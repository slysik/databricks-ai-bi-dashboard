SELECT job_id AS run_key, 'Job' AS kind, run_name AS name, result_state, trigger_type,
  run_duration_seconds AS duration_seconds, period_end_time AS finished_at
FROM system.lakeflow.job_run_timeline
WHERE run_name LIKE '%Energy Pulse%'
UNION ALL
SELECT pipeline_id AS run_key, 'Pipeline' AS kind, 'Energy Pulse Medallion' AS name, result_state, trigger_type,
  CAST((unix_timestamp(period_end_time) - unix_timestamp(period_start_time)) AS BIGINT) AS duration_seconds, period_end_time AS finished_at
FROM system.lakeflow.pipeline_update_timeline
WHERE pipeline_id = '18d80e76-6049-44f6-a682-42d2a6f10d35'
ORDER BY finished_at DESC
LIMIT 12;
