-- Governed landing files -> incremental Bronze with Auto Loader.
CREATE OR REFRESH STREAMING TABLE bronze_raw_grid_assets
COMMENT 'Append-only raw grid asset files incrementally ingested from the governed landing volume'
CLUSTER BY (service_region, asset_type)
AS SELECT *, current_timestamp() AS _ingested_at, _metadata.file_path AS _source_file,
  _metadata.file_modification_time AS _source_modified_at
FROM STREAM read_files('${landing_root}/grid_assets/', format => 'json',
  schemaHints => 'asset_id STRING, asset_type STRING, service_region STRING, capacity_mw DECIMAL(10,2), criticality STRING, commissioned_year INT, ingest_ts TIMESTAMP, source_system STRING, batch_id STRING',
  schemaEvolutionMode => 'rescue', rescuedDataColumn => '_rescued_data');

CREATE OR REFRESH STREAMING TABLE bronze_raw_meter_readings
COMMENT 'Append-only AMI and SCADA telemetry with source-file lineage and rescued data'
CLUSTER BY (asset_id, reading_ts)
AS SELECT *, current_timestamp() AS _ingested_at, _metadata.file_path AS _source_file,
  _metadata.file_modification_time AS _source_modified_at
FROM STREAM read_files('${landing_root}/meter_readings/', format => 'json',
  schemaHints => 'reading_id STRING, asset_id STRING, reading_ts TIMESTAMP, service_region STRING, asset_type STRING, capacity_mw DECIMAL(10,2), demand_mw DECIMAL(12,3), voltage_kv DECIMAL(6,3), frequency_hz DECIMAL(6,3), outage_flag BOOLEAN, ingest_ts TIMESTAMP, source_system STRING, batch_id STRING',
  schemaEvolutionMode => 'rescue', rescuedDataColumn => '_rescued_data');

CREATE OR REFRESH STREAMING TABLE bronze_raw_outage_events
COMMENT 'Append-only outage-management events incrementally ingested from landing'
CLUSTER BY (service_region, outage_start)
AS SELECT *, current_timestamp() AS _ingested_at, _metadata.file_path AS _source_file,
  _metadata.file_modification_time AS _source_modified_at
FROM STREAM read_files('${landing_root}/outage_events/', format => 'json',
  schemaHints => 'outage_id STRING, asset_id STRING, outage_start TIMESTAMP, service_region STRING, asset_type STRING, criticality STRING, duration_minutes INT, customers_affected INT, cause STRING, restoration_cost_usd DECIMAL(14,2), lost_revenue_usd DECIMAL(14,2), severity STRING, ingest_ts TIMESTAMP, source_system STRING, batch_id STRING',
  schemaEvolutionMode => 'rescue', rescuedDataColumn => '_rescued_data');

CREATE OR REFRESH STREAMING TABLE bronze_raw_weather_hourly
COMMENT 'Append-only regional weather observations incrementally ingested from landing'
CLUSTER BY (service_region, weather_ts)
AS SELECT *, current_timestamp() AS _ingested_at, _metadata.file_path AS _source_file,
  _metadata.file_modification_time AS _source_modified_at
FROM STREAM read_files('${landing_root}/weather/', format => 'json',
  schemaHints => 'weather_ts TIMESTAMP, service_region STRING, temperature_f DECIMAL(5,1), wind_mph DECIMAL(5,1), condition STRING, alert_level STRING, ingest_ts TIMESTAMP, source_system STRING, batch_id STRING',
  schemaEvolutionMode => 'rescue', rescuedDataColumn => '_rescued_data');
