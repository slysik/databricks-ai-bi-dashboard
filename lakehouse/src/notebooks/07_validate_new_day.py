# Databricks notebook source
# MAGIC %md
# MAGIC # Energy Pulse — validate incremental business change

# COMMAND ----------
display(spark.sql("""
SELECT 'latest_gold_date' AS check_name, CAST(MAX(metric_date) AS STRING) AS check_value FROM finserv.energy_pulse.gold_executive_kpis
UNION ALL SELECT 'aug_30_outages', CAST(SUM(outage_count) AS STRING) FROM finserv.energy_pulse.gold_executive_kpis WHERE metric_date = DATE '2026-08-30'
UNION ALL SELECT 'quarantined_meter_rows', CAST(COUNT(*) AS STRING) FROM finserv.energy_pulse.silver_meter_readings_quarantine
UNION ALL SELECT 'latest_batch_id', MAX(batch_id) FROM finserv.energy_pulse.silver_meter_readings
"""))
