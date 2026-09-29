SELECT ROUND(percentile_approx(total_duration_ms,0.95)/1000.0,2) p95_s
FROM system.query.history
WHERE compute.warehouse_id='4bbaafe9538467a0'
  AND start_time >= current_timestamp() - INTERVAL 7 DAYS;
