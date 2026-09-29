-- Silver validation with visible expectations and quarantine branches.
-- Materialized views preserve the existing public object types while the upstream
-- Bronze streaming tables provide incremental file ingestion.
CREATE OR REFRESH MATERIALIZED VIEW silver_grid_assets (
  CONSTRAINT valid_asset_id EXPECT (asset_id IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT valid_capacity EXPECT (capacity_mw > 0) ON VIOLATION DROP ROW,
  CONSTRAINT parsed_asset_record EXPECT (_rescued_data IS NULL) ON VIOLATION DROP ROW)
COMMENT 'Validated asset master with expectations for identity, capacity, and schema conformance'
AS SELECT asset_id, asset_type, service_region, CAST(capacity_mw AS DECIMAL(10,2)) AS capacity_mw,
  criticality, commissioned_year, YEAR(current_date()) - commissioned_year AS asset_age_years,
  _rescued_data, _ingested_at, _source_file, batch_id
FROM bronze_raw_grid_assets;

CREATE OR REFRESH MATERIALIZED VIEW silver_meter_readings (
  CONSTRAINT valid_reading_id EXPECT (reading_id IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT valid_asset_reference EXPECT (asset_id IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT valid_demand EXPECT (demand_mw >= 0) ON VIOLATION DROP ROW,
  CONSTRAINT valid_voltage EXPECT (voltage_kv BETWEEN 10 AND 16) ON VIOLATION DROP ROW,
  CONSTRAINT valid_frequency EXPECT (frequency_hz BETWEEN 58 AND 61) ON VIOLATION DROP ROW,
  CONSTRAINT parsed_meter_record EXPECT (_rescued_data IS NULL) ON VIOLATION DROP ROW)
COMMENT 'Quality-controlled telemetry with expectations visible in the pipeline event log'
CLUSTER BY (asset_id, reading_date)
AS SELECT reading_id, asset_id, reading_ts, CAST(reading_ts AS DATE) AS reading_date,
  service_region, asset_type, capacity_mw, CAST(demand_mw AS DECIMAL(12,3)) AS demand_mw,
  CAST(100.0 * demand_mw / capacity_mw AS DECIMAL(8,2)) AS capacity_utilization_pct,
  voltage_kv, frequency_hz, outage_flag, _rescued_data, _ingested_at, _source_file, batch_id
FROM bronze_raw_meter_readings;

CREATE OR REFRESH STREAMING TABLE silver_meter_readings_quarantine
COMMENT 'Rejected telemetry retained for remediation instead of being silently discarded'
AS SELECT *, CASE
    WHEN _rescued_data IS NOT NULL THEN 'SCHEMA_OR_PARSE_ERROR'
    WHEN reading_id IS NULL THEN 'MISSING_READING_ID'
    WHEN asset_id IS NULL THEN 'MISSING_ASSET_ID'
    WHEN demand_mw < 0 THEN 'NEGATIVE_DEMAND'
    WHEN voltage_kv NOT BETWEEN 10 AND 16 THEN 'INVALID_VOLTAGE'
    WHEN frequency_hz NOT BETWEEN 58 AND 61 THEN 'INVALID_FREQUENCY'
    ELSE 'UNKNOWN_QUALITY_ERROR' END AS quarantine_reason,
  current_timestamp() AS quarantined_at
FROM STREAM bronze_raw_meter_readings
WHERE _rescued_data IS NOT NULL OR reading_id IS NULL OR asset_id IS NULL OR demand_mw < 0
   OR voltage_kv NOT BETWEEN 10 AND 16 OR frequency_hz NOT BETWEEN 58 AND 61;

CREATE OR REFRESH MATERIALIZED VIEW silver_outage_events (
  CONSTRAINT valid_outage_id EXPECT (outage_id IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT valid_outage_asset EXPECT (asset_id IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT positive_duration EXPECT (duration_minutes > 0) ON VIOLATION DROP ROW,
  CONSTRAINT positive_customer_impact EXPECT (customers_affected > 0) ON VIOLATION DROP ROW,
  CONSTRAINT parsed_outage_record EXPECT (_rescued_data IS NULL) ON VIOLATION DROP ROW)
COMMENT 'Validated outage events with customer and financial impact measures'
CLUSTER BY (service_region, outage_date)
AS SELECT outage_id, asset_id, outage_start, CAST(outage_start AS DATE) AS outage_date,
  service_region, asset_type, criticality, duration_minutes, customers_affected,
  cause, restoration_cost_usd, lost_revenue_usd, severity,
  _rescued_data, _ingested_at, _source_file, batch_id
FROM bronze_raw_outage_events;

CREATE OR REFRESH STREAMING TABLE silver_outage_events_quarantine
COMMENT 'Rejected outage records with explainable reasons for client remediation'
AS SELECT *, CASE
    WHEN _rescued_data IS NOT NULL THEN 'SCHEMA_OR_PARSE_ERROR'
    WHEN outage_id IS NULL THEN 'MISSING_OUTAGE_ID'
    WHEN asset_id IS NULL THEN 'MISSING_ASSET_ID'
    WHEN duration_minutes <= 0 THEN 'INVALID_DURATION'
    WHEN customers_affected <= 0 THEN 'INVALID_CUSTOMER_IMPACT'
    ELSE 'UNKNOWN_QUALITY_ERROR' END AS quarantine_reason,
  current_timestamp() AS quarantined_at
FROM STREAM bronze_raw_outage_events
WHERE _rescued_data IS NOT NULL OR outage_id IS NULL OR asset_id IS NULL
   OR duration_minutes <= 0 OR customers_affected <= 0;

CREATE OR REFRESH MATERIALIZED VIEW silver_weather_hourly (
  CONSTRAINT valid_weather_timestamp EXPECT (weather_ts IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT plausible_temperature EXPECT (temperature_f BETWEEN -40 AND 130) ON VIOLATION DROP ROW,
  CONSTRAINT parsed_weather_record EXPECT (_rescued_data IS NULL) ON VIOLATION DROP ROW)
COMMENT 'Validated hourly weather observations aligned to service regions'
CLUSTER BY (service_region, weather_date)
AS SELECT weather_ts, CAST(weather_ts AS DATE) AS weather_date, service_region,
  temperature_f, wind_mph, condition, alert_level,
  _rescued_data, _ingested_at, _source_file, batch_id
FROM bronze_raw_weather_hourly;
