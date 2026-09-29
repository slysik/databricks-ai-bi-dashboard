# Databricks notebook source
# MAGIC %md
# MAGIC # Energy Pulse — land one new operating day
# MAGIC Adds an August 30 batch and one invalid telemetry row for the quarantine demonstration.

# COMMAND ----------
from pyspark.sql import functions as F
CATALOG, SCHEMA = "finserv", "energy_pulse"
ROOT, BATCH_ID = f"/Volumes/{CATALOG}/{SCHEMA}/landing", "interview_2026_08_30"
assets = spark.table(f"{CATALOG}.{SCHEMA}.bronze_grid_assets").select(
    "asset_id", "service_region", "asset_type", "capacity_mw", "criticality")

new_readings = (spark.range(2880)
    .withColumn("asset_idx", F.col("id") % 60)
    .withColumn("asset_id", F.concat(F.lit("AST-"), F.lpad(F.col("asset_idx").cast("string"), 4, "0")))
    .join(assets, "asset_id")
    .withColumn("reading_ts", F.expr("timestampadd(MINUTE, CAST((id / 60) * 30 AS INT), TIMESTAMP '2026-08-30 00:00:00')"))
    .select(F.concat(F.lit("RDG-NEW-"), F.lpad(F.col("id").cast("string"), 6, "0")).alias("reading_id"),
        "asset_id", "reading_ts", "service_region", "asset_type", "capacity_mw",
        F.when(F.col("id") == 0, F.lit(-5.0)).otherwise(F.col("capacity_mw") * F.when(F.hour("reading_ts").between(14, 20), 1.08).otherwise(0.66)).cast("decimal(12,3)").alias("demand_mw"),
        F.lit(13.7).cast("decimal(6,3)").alias("voltage_kv"), F.lit(59.96).cast("decimal(6,3)").alias("frequency_hz"),
        (F.col("id") % 541 == 0).alias("outage_flag"), F.lit("ami_scada").alias("source_system"), F.lit(BATCH_ID).alias("batch_id")))

new_outages = (spark.range(12).withColumn("asset_idx", (F.col("id") * 5) % 60)
    .withColumn("asset_id", F.concat(F.lit("AST-"), F.lpad(F.col("asset_idx").cast("string"), 4, "0"))).join(assets, "asset_id")
    .select(F.concat(F.lit("OUT-NEW-"), F.lpad(F.col("id").cast("string"), 3, "0")).alias("outage_id"), "asset_id",
        F.expr("timestampadd(HOUR, CAST(id AS INT), TIMESTAMP '2026-08-30 08:00:00')").alias("outage_start"), "service_region", "asset_type", "criticality",
        (F.lit(35) + F.col("id") * 4).cast("int").alias("duration_minutes"), (F.lit(120) + F.col("id") * 25).cast("int").alias("customers_affected"),
        F.when(F.col("id") % 3 == 0, "Equipment Failure").otherwise("Overload").alias("cause"),
        (F.lit(4200) + F.col("id") * 350).cast("decimal(14,2)").alias("restoration_cost_usd"),
        (F.lit(6900) + F.col("id") * 510).cast("decimal(14,2)").alias("lost_revenue_usd"),
        F.when(F.col("id") < 3, "Major").otherwise("Moderate").alias("severity"),
        F.lit("outage_management_system").alias("source_system"), F.lit(BATCH_ID).alias("batch_id")))

new_weather = (spark.range(96).withColumn("region_idx", F.floor(F.col("id") / 24)).select(
    F.expr("timestampadd(HOUR, CAST(id % 24 AS INT), TIMESTAMP '2026-08-30 00:00:00')").alias("weather_ts"),
    F.when(F.col("region_idx") == 0, "North").when(F.col("region_idx") == 1, "South").when(F.col("region_idx") == 2, "Central").otherwise("West").alias("service_region"),
    (F.lit(82) + F.col("id").between(12, 18).cast("int") * 12).cast("decimal(5,1)").alias("temperature_f"),
    (F.lit(7) + F.col("id") % 9).cast("decimal(5,1)").alias("wind_mph"), F.lit("Clear").alias("condition"),
    F.lit("Normal").alias("alert_level"), F.lit("weather_api").alias("source_system"), F.lit(BATCH_ID).alias("batch_id")))

new_readings.repartition(2).write.mode("overwrite").json(f"{ROOT}/meter_readings/batch={BATCH_ID}")
new_outages.coalesce(1).write.mode("overwrite").json(f"{ROOT}/outage_events/batch={BATCH_ID}")
new_weather.coalesce(1).write.mode("overwrite").json(f"{ROOT}/weather/batch={BATCH_ID}")
display(spark.createDataFrame([("meter_readings", 2880), ("outage_events", 12), ("weather", 96)], "feed string, landed_rows long"))
