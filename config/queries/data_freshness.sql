SELECT table_name, DATE_FORMAT(last_altered,'yyyy-MM-dd h:mm a') last_altered,
  CASE WHEN last_altered >= current_timestamp() - INTERVAL 4 HOURS THEN 'Fresh' ELSE 'Stale' END status
FROM finserv.information_schema.tables
WHERE table_schema='energy_pulse' AND table_name LIKE 'gold_%'
ORDER BY last_altered DESC;
