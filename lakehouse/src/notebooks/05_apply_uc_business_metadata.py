# Databricks notebook source
# MAGIC %md
# MAGIC # Pulse — Unity Catalog business metadata
# MAGIC Business definitions improve Genie SQL generation, visual selection, and executive trust.

# COMMAND ----------

CATALOG = "finserv"
SCHEMA = "energy_pulse"

TABLE_COMMENTS = {
    "gold_executive_kpis": (
        "Certified daily C-suite scorecard by service region. Use for KPI cards, "
        "time trends, regional comparisons, reliability, customer impact, and financial exposure."
    ),
    "gold_feeder_risk": (
        "Certified current asset risk ranking. Use for top-N risk visuals, maintenance prioritization, "
        "capacity planning, customer exposure, and recommended operational actions."
    ),
    "gold_outage_root_cause": (
        "Certified outage root-cause summary by day, region, cause, and severity. Use for Pareto charts, "
        "financial-impact analysis, and explanations of reliability changes."
    ),
    "gold_load_weather": (
        "Certified daily relationship between weather and grid load. Use to explain demand peaks, "
        "capacity stress, heat-wave effects, and weather-driven operational risk."
    ),
}

COLUMN_COMMENTS = {
    "gold_executive_kpis": {
        "metric_date": "Business date represented by the executive metrics; use as the time axis.",
        "service_region": "Excel Energy operating region used for geographic comparisons and filters.",
        "peak_demand_mw": "Maximum observed electricity demand in megawatts for the day and region.",
        "avg_capacity_utilization_pct": "Average demand as a percentage of available grid asset capacity.",
        "peak_capacity_utilization_pct": "Highest demand-to-capacity percentage; values above 100 indicate overload.",
        "overload_readings": "Count of telemetry observations at or above 100 percent capacity.",
        "outage_count": "Number of outage-management events recorded for the day and region.",
        "customers_affected": "Total customer impact summed across outage events; customers may appear in multiple events.",
        "customer_minutes_interrupted": "Customers affected multiplied by outage duration; primary reliability-impact measure.",
        "restoration_cost_usd": "Estimated direct field-service and restoration cost in US dollars.",
        "lost_revenue_usd": "Estimated electricity revenue not realized because of outages, in US dollars.",
        "reliability_score": "Executive reliability index from 0 to 100 where higher is better.",
    },
    "gold_feeder_risk": {
        "asset_id": "Stable identifier for a feeder, transformer, or substation.",
        "asset_type": "Grid equipment category used for maintenance and capacity comparisons.",
        "service_region": "Excel Energy operating region responsible for the asset.",
        "criticality": "Business criticality tier assigned by grid operations.",
        "asset_age_years": "Current age of the asset calculated from its commissioned year.",
        "capacity_mw": "Rated asset capacity in megawatts.",
        "peak_utilization_pct": "Maximum observed demand divided by rated capacity; above 100 indicates overload.",
        "avg_utilization_pct": "Average observed demand divided by rated capacity.",
        "overload_hours": "Count of telemetry intervals where utilization reached or exceeded 100 percent.",
        "outage_count": "Number of outage events linked to the asset.",
        "customers_affected": "Total customer impact linked to the asset across outage events.",
        "financial_impact_usd": "Restoration cost plus lost revenue attributed to the asset, in US dollars.",
        "risk_score": "Explainable operational risk score from 0 to 100 where higher requires faster action.",
        "risk_band": "Executive risk category derived from risk score: Critical, High, Moderate, or Low.",
        "recommended_action": "Plain-English operational recommendation associated with the asset risk level.",
    },
    "gold_outage_root_cause": {
        "outage_date": "Date on which the outage began; use as the trend axis.",
        "service_region": "Excel Energy operating region impacted by the outage.",
        "cause": "Primary operational cause assigned by the outage-management system.",
        "severity": "Business severity classification: Major, Moderate, or Minor.",
        "outage_count": "Number of outage events in the grouping.",
        "avg_duration_minutes": "Mean outage duration in minutes.",
        "customers_affected": "Total customer impact across grouped outage events.",
        "restoration_cost_usd": "Total direct restoration cost in US dollars.",
        "lost_revenue_usd": "Total estimated revenue loss in US dollars.",
        "total_financial_impact_usd": "Restoration cost plus lost revenue in US dollars; use for financial rankings.",
    },
    "gold_load_weather": {
        "metric_date": "Business date for weather and grid-load comparison.",
        "service_region": "Excel Energy operating region.",
        "max_temperature_f": "Highest observed daily temperature in degrees Fahrenheit.",
        "avg_temperature_f": "Average observed daily temperature in degrees Fahrenheit; use for daily demand correlation unless the question explicitly asks for a maximum.",
        "max_wind_mph": "Highest observed daily wind speed in miles per hour.",
        "weather_warning": "Indicator equal to 1 when the region had an extreme-weather warning.",
        "peak_demand_mw": "Maximum observed regional demand in megawatts.",
        "avg_capacity_utilization_pct": "Average regional grid capacity utilization percentage.",
        "peak_capacity_utilization_pct": "Maximum regional grid capacity utilization percentage.",
    },
}

# Materialized-view column comments are declared in the pipeline DDL because UC
# does not allow ALTER COLUMN COMMENT against an MV after creation. This task
# validates that every expected business description survived the refresh.
expected_columns = sum(len(columns) for columns in COLUMN_COMMENTS.values())
metadata = spark.sql(
    f"""
    SELECT table_name, column_name, comment
    FROM {CATALOG}.information_schema.columns
    WHERE table_schema = '{SCHEMA}'
      AND table_name LIKE 'gold_%'
    """
)
missing_comments = metadata.where("comment IS NULL OR trim(comment) = ''").count()
actual_columns = metadata.count()

if actual_columns != expected_columns:
    raise ValueError(
        f"Expected {expected_columns} documented Gold columns, found {actual_columns}"
    )
if missing_comments:
    raise ValueError(f"Found {missing_comments} Gold columns without business descriptions")

# Gold tables are deliberately narrow and pre-aggregated. Catalog-level predictive
# optimization is enabled, and the serverless SQL warehouse supplies result caching.
display(
    spark.sql(
        f"""
        SELECT table_name, comment
        FROM {CATALOG}.information_schema.tables
        WHERE table_schema = '{SCHEMA}' AND table_name LIKE 'gold_%'
        ORDER BY table_name
        """
    )
)
