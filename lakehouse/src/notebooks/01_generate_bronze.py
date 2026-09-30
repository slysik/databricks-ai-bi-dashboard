# Databricks notebook source
# MAGIC %md
# MAGIC # Energy Pulse — synthetic Bronze generation
# MAGIC A deterministic heat-wave incident links grid telemetry, weather, outages, customers, and financial impact.

# COMMAND ----------

from pyspark.sql import DataFrame
from pyspark.sql import functions as F

CATALOG = "finserv"
SCHEMA = "energy_pulse"
BATCH_ID = "pulse_demo_2026_09"
N_ASSETS = 60
N_READINGS = 150_000
N_WEATHER = 8_640
N_OUTAGES = 600

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}")
spark.sql(
    f"COMMENT ON SCHEMA {CATALOG}.{SCHEMA} IS "
    "'Governed operational and executive intelligence for the Energy Pulse demo'"
)

# COMMAND ----------

def add_metadata(df: DataFrame, source_system: str) -> DataFrame:
    return df.select(
        "*",
        F.current_timestamp().alias("ingest_ts"),
        F.lit(source_system).alias("source_system"),
        F.lit(BATCH_ID).alias("batch_id"),
    )


assets = add_metadata(
    spark.range(N_ASSETS).select(
        F.concat(F.lit("AST-"), F.lpad(F.col("id").cast("string"), 4, "0")).alias("asset_id"),
        F.when(F.col("id") % 5 == 0, "Substation")
        .when(F.col("id") % 3 == 0, "Transformer")
        .otherwise("Feeder").alias("asset_type"),
        F.when(F.col("id") % 4 == 0, "North")
        .when(F.col("id") % 4 == 1, "South")
        .when(F.col("id") % 4 == 2, "Central")
        .otherwise("West").alias("service_region"),
        (F.lit(18.0) + (F.col("id") % 9) * F.lit(2.5) + F.rand(11) * F.lit(6.0)).cast("decimal(10,2)").alias("capacity_mw"),
        F.when(F.col("id") % 10 < 2, "Critical")
        .when(F.col("id") % 10 < 6, "High")
        .otherwise("Standard").alias("criticality"),
        (F.lit(1988) + (F.col("id") % 35)).cast("int").alias("commissioned_year"),
    ),
    "grid_asset_registry",
)
assets.write.format("delta").mode("overwrite").option("overwriteSchema", "true").saveAsTable(
    f"{CATALOG}.{SCHEMA}.bronze_grid_assets"
)

# COMMAND ----------

weather_base = (
    spark.range(N_WEATHER)
    .withColumn("region_idx", F.floor(F.col("id") / F.lit(2160)))
    .withColumn("hour_idx", F.col("id") % F.lit(2160))
    .withColumn(
        "weather_ts",
        F.expr("timestampadd(HOUR, CAST(hour_idx AS INT), TIMESTAMP '2026-06-01 00:00:00')"),
    )
    .withColumn(
        "service_region",
        F.when(F.col("region_idx") == 0, "North")
        .when(F.col("region_idx") == 1, "South")
        .when(F.col("region_idx") == 2, "Central")
        .otherwise("West"),
    )
    .withColumn(
        "is_heatwave",
        (F.to_date("weather_ts").between("2026-07-14", "2026-07-20"))
        & F.col("service_region").isin("Central", "West"),
    )
)

weather = add_metadata(
    weather_base.select(
        "weather_ts",
        "service_region",
        (
            F.lit(78.0)
            + (F.hour("weather_ts").between(12, 19)).cast("int") * F.lit(9.0)
            + F.when(F.col("is_heatwave"), F.lit(19.0)).otherwise(F.lit(0.0))
            + (F.col("id") % 7) * F.lit(0.7)
        ).cast("decimal(5,1)").alias("temperature_f"),
        (F.lit(5.0) + (F.col("id") % 23) * F.lit(0.8)).cast("decimal(5,1)").alias("wind_mph"),
        F.when(F.col("is_heatwave"), "Extreme Heat")
        .when(F.col("id") % 37 == 0, "Storm")
        .otherwise("Clear").alias("condition"),
        F.when(F.col("is_heatwave"), "Warning")
        .when(F.col("id") % 37 == 0, "Watch")
        .otherwise("Normal").alias("alert_level"),
    ),
    "weather_api",
)
weather.write.format("delta").mode("overwrite").option("overwriteSchema", "true").saveAsTable(
    f"{CATALOG}.{SCHEMA}.bronze_weather_hourly"
)

# COMMAND ----------

asset_lookup = spark.table(f"{CATALOG}.{SCHEMA}.bronze_grid_assets").select(
    "asset_id", "service_region", "capacity_mw"
)

reading_base = (
    spark.range(N_READINGS, numPartitions=16)
    .withColumn("asset_idx", F.col("id") % F.lit(N_ASSETS))
    .withColumn("asset_id", F.concat(F.lit("AST-"), F.lpad(F.col("asset_idx").cast("string"), 4, "0")))
    .withColumn(
        "reading_ts",
        F.expr("timestampadd(HOUR, CAST(id % 2160 AS INT), TIMESTAMP '2026-06-01 00:00:00')"),
    )
    .join(F.broadcast(asset_lookup), "asset_id")
    .withColumn("day_offset", F.datediff(F.to_date("reading_ts"), F.lit("2026-06-01")))
    .withColumn("hw_day", F.col("day_offset") - F.lit(43))
    .withColumn(
        "heatwave_ramp",
        F.when(
            F.col("hw_day").between(0, 6),
            F.lit(1.0) - F.abs(F.col("hw_day") - F.lit(3.0)) / F.lit(3.0),
        ).otherwise(F.lit(0.0)),
    )
    .withColumn("is_hw_region", F.col("service_region").isin("Central", "West"))
    .withColumn(
        "heatwave_boost",
        F.when(F.col("is_hw_region"), F.col("heatwave_ramp") * F.lit(0.42))
        .otherwise(F.col("heatwave_ramp") * F.lit(0.14)),
    )
    .withColumn("weekly_wave", F.sin(F.col("day_offset") * (F.lit(2 * 3.14159265) / F.lit(7.0))) * F.lit(0.06))
    .withColumn(
        "base_load",
        F.when(F.hour("reading_ts").between(14, 20), F.lit(0.84))
        .when(F.hour("reading_ts").between(6, 9), F.lit(0.70))
        .otherwise(F.lit(0.52)),
    )
    .withColumn(
        "load_multiplier",
        F.col("base_load")
        * (F.lit(0.90) + F.pmod(F.col("id"), F.lit(97)) / F.lit(97.0) * F.lit(0.24))
        * F.when(F.col("service_region") == "West", F.lit(1.12))
          .when(F.col("service_region") == "Central", F.lit(1.05))
          .when(F.col("service_region") == "South", F.lit(0.96))
          .otherwise(F.lit(0.89))
        * (F.lit(1.0) + F.col("weekly_wave") + F.col("heatwave_boost")),
    )
    .withColumn("is_heatwave", F.col("heatwave_ramp") > F.lit(0.5))
)

readings = add_metadata(
    reading_base.select(
        F.concat(F.lit("RDG-"), F.lpad(F.col("id").cast("string"), 8, "0")).alias("reading_id"),
        "asset_id",
        "reading_ts",
        (F.col("capacity_mw") * F.col("load_multiplier")).cast("decimal(12,3)").alias("demand_mw"),
        (F.lit(13.8) - F.greatest(F.col("load_multiplier") - F.lit(1.0), F.lit(0.0)) * 1.6)
        .cast("decimal(6,3)").alias("voltage_kv"),
        (F.lit(60.0) - F.greatest(F.col("load_multiplier") - F.lit(1.0), F.lit(0.0)) * 0.45)
        .cast("decimal(6,3)").alias("frequency_hz"),
        (
            F.col("is_heatwave")
            & F.hour("reading_ts").between(15, 20)
            & (F.col("asset_idx") % 10).isin(0, 1)
            & (F.col("id") % 17 == 0)
        ).alias("outage_flag"),
    ),
    "ami_scada",
)
readings.write.format("delta").mode("overwrite").option("overwriteSchema", "true").saveAsTable(
    f"{CATALOG}.{SCHEMA}.bronze_meter_readings"
)

# COMMAND ----------

outage_base = (
    spark.range(N_OUTAGES)
    .withColumn("asset_idx", F.col("id") % F.lit(N_ASSETS))
    .withColumn("asset_id", F.concat(F.lit("AST-"), F.lpad(F.col("asset_idx").cast("string"), 4, "0")))
    .join(F.broadcast(asset_lookup.select("asset_id", "service_region")), "asset_id")
    # spread outages across the full ~91-day window instead of forcing the first 180 ids into one fixed week
    .withColumn("day_offset", F.pmod(F.hash(F.col("id"), F.lit("day")), F.lit(91)))
    .withColumn("hour_offset", F.pmod(F.hash(F.col("id"), F.lit("hour")), F.lit(24)))
    .withColumn(
        "outage_start",
        F.expr(
            "timestampadd(HOUR, CAST(hour_offset AS INT), "
            "timestampadd(DAY, CAST(day_offset AS INT), TIMESTAMP '2026-06-01 00:00:00'))"
        ),
    )
    .withColumn("hw_day", F.col("day_offset") - F.lit(43))
    .withColumn(
        "heatwave_ramp",
        F.when(
            F.col("hw_day").between(0, 6),
            F.lit(1.0) - F.abs(F.col("hw_day") - F.lit(3.0)) / F.lit(3.0),
        ).otherwise(F.lit(0.0)),
    )
    .withColumn("is_hw_region", F.col("service_region").isin("Central", "West"))
    .withColumn(
        "severity",
        F.when(F.col("is_hw_region"), F.col("heatwave_ramp")).otherwise(F.col("heatwave_ramp") * F.lit(0.35)),
    )
    .withColumn(
        "regional_impact",
        F.when(F.col("service_region") == "West", F.lit(1.65))
        .when(F.col("service_region") == "Central", F.lit(1.35))
        .when(F.col("service_region") == "South", F.lit(0.85))
        .otherwise(F.lit(0.65)),
    )
    .withColumn("rand_dur", F.pmod(F.hash(F.col("id"), F.lit("dur")), F.lit(90)))
    .withColumn("rand_cust", F.pmod(F.hash(F.col("id"), F.lit("cust")), F.lit(700)))
    .withColumn("rand_cost", F.pmod(F.hash(F.col("id"), F.lit("cost")), F.lit(41)))
    .withColumn("rand_rev", F.pmod(F.hash(F.col("id"), F.lit("rev")), F.lit(53)))
    .withColumn("rand_cause", F.pmod(F.hash(F.col("id"), F.lit("cause")), F.lit(1000)) / F.lit(1000.0))
    .withColumn("overload_prob", F.lit(0.10) + F.col("severity") * F.lit(0.55))
)

outages = add_metadata(
    outage_base.select(
        F.concat(F.lit("OUT-"), F.lpad(F.col("id").cast("string"), 5, "0")).alias("outage_id"),
        "asset_id",
        "outage_start",
        (F.lit(18) + F.col("rand_dur") + F.col("severity") * F.lit(90))
        .cast("int").alias("duration_minutes"),
        ((F.lit(80) + F.col("rand_cust") + F.col("severity") * F.lit(770)) * F.col("regional_impact"))
        .cast("int").alias("customers_affected"),
        F.when(F.col("rand_cause") < F.col("overload_prob"), "Overload")
        .when(F.col("rand_cause") < F.col("overload_prob") + F.lit(0.22), "Vegetation")
        .when(F.col("rand_cause") < F.col("overload_prob") + F.lit(0.44), "Equipment Failure")
        .when(F.col("rand_cause") < F.col("overload_prob") + F.lit(0.62), "Storm")
        .otherwise("Planned Maintenance").alias("cause"),
        ((F.lit(2400.0) + F.col("rand_cost") * F.lit(325.0) + F.col("severity") * F.lit(15600.0)) * F.col("regional_impact"))
        .cast("decimal(14,2)").alias("restoration_cost_usd"),
        ((F.lit(3800.0) + F.col("rand_rev") * F.lit(490.0) + F.col("severity") * F.lit(27200.0)) * F.col("regional_impact"))
        .cast("decimal(14,2)").alias("lost_revenue_usd"),
        F.when(F.col("severity") >= F.lit(0.66), "Major")
        .when(F.col("severity") >= F.lit(0.25), "Moderate")
        .otherwise("Minor").alias("severity"),
    ),
    "outage_management_system",
)
outages.write.format("delta").mode("overwrite").option("overwriteSchema", "true").saveAsTable(
    f"{CATALOG}.{SCHEMA}.bronze_outage_events"
)

# COMMAND ----------

spark.sql(f"COMMENT ON TABLE {CATALOG}.{SCHEMA}.bronze_grid_assets IS 'Grid asset registry used to connect capacity, geography, criticality, telemetry, and outage risk'")
spark.sql(f"COMMENT ON TABLE {CATALOG}.{SCHEMA}.bronze_weather_hourly IS 'Hourly weather observations with an embedded July heat-wave event in Central and West regions'")
spark.sql(f"COMMENT ON TABLE {CATALOG}.{SCHEMA}.bronze_meter_readings IS 'AMI and SCADA telemetry containing demand, voltage, frequency, and outage signals'")
spark.sql(f"COMMENT ON TABLE {CATALOG}.{SCHEMA}.bronze_outage_events IS 'Outage-management events with customer and financial impact measures'")

display(
    spark.sql(
        f"""
        SELECT 'bronze_grid_assets' AS table_name, COUNT(*) AS row_count FROM {CATALOG}.{SCHEMA}.bronze_grid_assets
        UNION ALL SELECT 'bronze_weather_hourly', COUNT(*) FROM {CATALOG}.{SCHEMA}.bronze_weather_hourly
        UNION ALL SELECT 'bronze_meter_readings', COUNT(*) FROM {CATALOG}.{SCHEMA}.bronze_meter_readings
        UNION ALL SELECT 'bronze_outage_events', COUNT(*) FROM {CATALOG}.{SCHEMA}.bronze_outage_events
        """
    )
)
