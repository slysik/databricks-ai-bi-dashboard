# Databricks notebook source
# MAGIC %md
# MAGIC # Energy Pulse — seed governed landing volume
# MAGIC Export deterministic sources as raw JSON; the declarative pipeline owns Bronze, Silver, and Gold.

# COMMAND ----------
CATALOG, SCHEMA, VOLUME = "finserv", "energy_pulse", "landing"
ROOT = f"/Volumes/{CATALOG}/{SCHEMA}/{VOLUME}"
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}")
spark.sql(f"CREATE VOLUME IF NOT EXISTS {CATALOG}.{SCHEMA}.{VOLUME} COMMENT 'Governed raw landing zone for Energy Pulse'")

assets = spark.table(f"{CATALOG}.{SCHEMA}.bronze_grid_assets")
readings = spark.table(f"{CATALOG}.{SCHEMA}.bronze_meter_readings").join(
    assets.select("asset_id", "service_region", "asset_type", "capacity_mw"), "asset_id")
outages = spark.table(f"{CATALOG}.{SCHEMA}.bronze_outage_events").join(
    assets.select("asset_id", "service_region", "asset_type", "criticality"), "asset_id")
weather = spark.table(f"{CATALOG}.{SCHEMA}.bronze_weather_hourly")

assets.coalesce(1).write.mode("overwrite").json(f"{ROOT}/grid_assets/batch=initial")
readings.repartition(8).write.mode("overwrite").json(f"{ROOT}/meter_readings/batch=initial")
outages.coalesce(1).write.mode("overwrite").json(f"{ROOT}/outage_events/batch=initial")
weather.coalesce(2).write.mode("overwrite").json(f"{ROOT}/weather/batch=initial")

display(spark.createDataFrame([
    ("grid_assets", assets.count()), ("meter_readings", readings.count()),
    ("outage_events", outages.count()), ("weather", weather.count())
], "source string, landed_rows long"))
