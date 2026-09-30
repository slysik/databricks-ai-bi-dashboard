# Databricks notebook source
# MAGIC %md
# MAGIC # Energy Pulse — hypothesis testing, causal inference, and ML risk model
# MAGIC
# MAGIC The synthetic Bronze generator embeds a real natural experiment: a heat wave
# MAGIC (July 14–20) that only stresses the Central and West regions. That split gives
# MAGIC us a treatment/control setup for free, so this notebook tells three connected
# MAGIC stories against the same Gold data:
# MAGIC
# MAGIC 1. **Hypothesis test** — is financial exposure actually higher in the
# MAGIC    heat-wave regions during the heat wave, or could the gap be noise?
# MAGIC 2. **Causal inference (difference-in-differences)** — a plain comparison
# MAGIC    can't tell "the heat wave caused this" from "West is just worse." DiD nets
# MAGIC    out each region's own baseline by comparing the *change* in the treated
# MAGIC    regions against the *change* in the untreated regions over the same
# MAGIC    window — that's the causal estimate.
# MAGIC 3. **ML risk model** — a small classifier that predicts which grid assets
# MAGIC    will land in the Critical/High risk band next period, trained on the
# MAGIC    same asset-level features that feed the rule-based risk score already
# MAGIC    in `gold_feeder_risk`. Everything is tracked in MLflow and registered to
# MAGIC    Unity Catalog.
# MAGIC
# MAGIC Outputs land in two Gold tables the app reads directly:
# MAGIC `gold_ml_insights` (one summary row per run) and
# MAGIC `gold_asset_risk_predictions` (per-asset ML score vs. the rule-based score).

# COMMAND ----------

import uuid
from datetime import datetime, timezone

import mlflow
import mlflow.sklearn
import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from mlflow.models import infer_signature
from scipy.stats import ttest_ind
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

CATALOG, SCHEMA = "finserv", "energy_pulse"
HEATWAVE_START, HEATWAVE_END = "2026-07-14", "2026-07-20"
TREATED_REGIONS = ["Central", "West"]

current_user = spark.sql("SELECT current_user() AS u").collect()[0]["u"]
mlflow.set_registry_uri("databricks-uc")
mlflow.set_experiment(f"/Users/{current_user}/pulse_ml_causal_analysis")

# COMMAND ----------

# MAGIC %md ## 1. Load Gold data

# COMMAND ----------

kpis = spark.table(f"{CATALOG}.{SCHEMA}.gold_executive_kpis").toPandas()
kpis["financial_impact_usd"] = kpis["restoration_cost_usd"].astype(float) + kpis["lost_revenue_usd"].astype(float)
kpis["metric_date"] = pd.to_datetime(kpis["metric_date"])
kpis["treated"] = kpis["service_region"].isin(TREATED_REGIONS).astype(int)
kpis["post"] = ((kpis["metric_date"] >= HEATWAVE_START) & (kpis["metric_date"] <= HEATWAVE_END)).astype(int)

feeder = spark.table(f"{CATALOG}.{SCHEMA}.gold_feeder_risk").toPandas()
for col in ["peak_utilization_pct", "avg_utilization_pct", "overload_hours", "outage_count", "financial_impact_usd", "asset_age_years", "risk_score", "capacity_mw"]:
    feeder[col] = feeder[col].astype(float)

# COMMAND ----------

# MAGIC %md ## 2. Hypothesis test — heat-wave regions vs. everyone else, during the heat wave

# COMMAND ----------

during = kpis[kpis["post"] == 1]
treated_sample = during[during["treated"] == 1]["financial_impact_usd"]
control_sample = during[during["treated"] == 0]["financial_impact_usd"]

t_stat, ttest_pvalue = ttest_ind(treated_sample, control_sample, equal_var=False)
print(f"Welch's t-test — treated mean=${treated_sample.mean():,.0f} vs control mean=${control_sample.mean():,.0f}")
print(f"t={t_stat:.3f}, p={ttest_pvalue:.4f}")

# COMMAND ----------

# MAGIC %md ## 3. Causal inference — difference-in-differences
# MAGIC
# MAGIC `financial_impact ~ treated + post + treated:post` — the coefficient on the
# MAGIC interaction term (`treated:post`) is the DiD estimate: the extra effect of
# MAGIC being in a treated region *during* the heat wave, over and above each
# MAGIC region's own baseline and the overall pre/post trend.

# COMMAND ----------

did_model = smf.ols("financial_impact_usd ~ treated + post + treated:post", data=kpis).fit()
did_estimate = float(did_model.params["treated:post"])
did_pvalue = float(did_model.pvalues["treated:post"])
print(did_model.summary())
print(f"\nDiff-in-diff causal estimate: ${did_estimate:,.0f} additional daily financial exposure per treated region during the heat wave (p={did_pvalue:.4f})")

# COMMAND ----------

# MAGIC %md ## 4. ML risk model — predict which assets run a high outage frequency
# MAGIC
# MAGIC **Deliberately not** predicting `risk_band`: it's a hard threshold on
# MAGIC `risk_score`, which is itself a weighted formula over `outage_count`,
# MAGIC `overload_hours`, and `financial_impact_usd`. Training on those same
# MAGIC features to predict a label derived from them is leakage — the model
# MAGIC would just be re-deriving the rule, not learning anything, and would
# MAGIC show a suspicious AUC near 1.0.
# MAGIC
# MAGIC Instead the model predicts a genuinely independent outcome — **does this
# MAGIC asset run an above-typical outage frequency** (above the fleet median
# MAGIC outage count) — from features that exist *before* an outage happens:
# MAGIC utilization telemetry, rated capacity, age, criticality, and region.
# MAGIC `outage_count` only defines the label; it is excluded from the features,
# MAGIC so the model has to earn its signal from operating conditions alone.

# COMMAND ----------

feeder["label"] = (feeder["outage_count"] > feeder["outage_count"].median()).astype(int)
feature_cols = ["peak_utilization_pct", "avg_utilization_pct", "capacity_mw", "asset_age_years"]
X = pd.get_dummies(feeder[feature_cols + ["service_region", "criticality"]], columns=["service_region", "criticality"])
y = feeder["label"]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42, stratify=y)
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

model = LogisticRegression(max_iter=1000, class_weight="balanced")
model.fit(X_train_scaled, y_train)

train_auc = roc_auc_score(y_train, model.predict_proba(X_train_scaled)[:, 1])
test_auc = roc_auc_score(y_test, model.predict_proba(X_test_scaled)[:, 1]) if y_test.nunique() > 1 else float("nan")
test_accuracy = accuracy_score(y_test, model.predict(X_test_scaled))
print(f"Train AUC={train_auc:.3f}  Test AUC={test_auc:.3f}  Test accuracy={test_accuracy:.3f}")

# COMMAND ----------

# MAGIC %md ## 5. Log everything to MLflow and register the model in Unity Catalog

# COMMAND ----------

model_name = f"{CATALOG}.{SCHEMA}.pulse_risk_classifier"
with mlflow.start_run(run_name="pulse_causal_and_risk_model") as run:
    mlflow.log_param("heatwave_start", HEATWAVE_START)
    mlflow.log_param("heatwave_end", HEATWAVE_END)
    mlflow.log_param("treated_regions", ",".join(TREATED_REGIONS))
    mlflow.log_param("model_type", "LogisticRegression")
    mlflow.log_param("n_features", X.shape[1])
    mlflow.log_param("n_train", len(X_train))
    mlflow.log_param("n_test", len(X_test))

    mlflow.log_metric("ttest_statistic", float(t_stat))
    mlflow.log_metric("ttest_pvalue", float(ttest_pvalue))
    mlflow.log_metric("diff_in_diff_estimate_usd", did_estimate)
    mlflow.log_metric("diff_in_diff_pvalue", did_pvalue)
    mlflow.log_metric("model_train_auc", float(train_auc))
    mlflow.log_metric("model_test_auc", float(test_auc) if not np.isnan(test_auc) else 0.0)
    mlflow.log_metric("model_test_accuracy", float(test_accuracy))

    signature = infer_signature(X_train_scaled, model.predict(X_train_scaled))
    mlflow.sklearn.log_model(
        model,
        artifact_path="model",
        signature=signature,
        registered_model_name=model_name,
    )
    run_id = run.info.run_id
    experiment_id = run.info.experiment_id

client = mlflow.MlflowClient()
model_version = max(int(v.version) for v in client.search_model_versions(f"name='{model_name}'"))
print(f"Registered {model_name} v{model_version} — run {run_id}")

# COMMAND ----------

# MAGIC %md ## 6. Write results Gold tables the app reads directly

# COMMAND ----------

insights_row = spark.createDataFrame([{
    "trained_at": datetime.now(timezone.utc),
    "ttest_statistic": float(t_stat),
    "ttest_pvalue": float(ttest_pvalue),
    "diff_in_diff_estimate_usd": did_estimate,
    "diff_in_diff_pvalue": did_pvalue,
    "treated_regions": ",".join(TREATED_REGIONS),
    "heatwave_start": HEATWAVE_START,
    "heatwave_end": HEATWAVE_END,
    "model_type": "LogisticRegression",
    "model_train_auc": float(train_auc),
    "model_test_auc": float(test_auc) if not np.isnan(test_auc) else None,
    "model_test_accuracy": float(test_accuracy),
    "model_name": model_name,
    "model_version": model_version,
    "mlflow_experiment_id": experiment_id,
    "mlflow_run_id": run_id,
    "pipeline_id": "18d80e76-6049-44f6-a682-42d2a6f10d35",
}])
insights_row.write.format("delta").mode("overwrite").option("overwriteSchema", "true").saveAsTable(f"{CATALOG}.{SCHEMA}.gold_ml_insights")

# COMMAND ----------

feeder["predicted_probability"] = model.predict_proba(scaler.transform(X))[:, 1]
feeder["predicted_risk_flag"] = (feeder["predicted_probability"] >= 0.5).astype(int)
predictions = feeder[["asset_id", "service_region", "label", "risk_band", "risk_score", "predicted_risk_flag", "predicted_probability"]].rename(
    columns={"label": "actual_high_outage_frequency", "risk_band": "rule_based_risk_band", "risk_score": "rule_based_risk_score"}
)
spark.createDataFrame(predictions).write.format("delta").mode("overwrite").option("overwriteSchema", "true").saveAsTable(
    f"{CATALOG}.{SCHEMA}.gold_asset_risk_predictions"
)

display(spark.sql(f"SELECT * FROM {CATALOG}.{SCHEMA}.gold_ml_insights"))
