SELECT COUNT(*) questions_7d,
  SUM(CASE WHEN feedback IS NOT NULL THEN 1 ELSE 0 END) rated_answers,
  ROUND(100.0 * SUM(CASE WHEN feedback='up' THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN feedback IS NOT NULL THEN 1 ELSE 0 END),0),1) helpful_pct,
  ROUND(percentile_approx(latency_ms,0.95)/1000.0,2) p95_genie_s
FROM finserv.pulse_app.ai_questions
WHERE created_at >= current_timestamp() - INTERVAL 7 DAYS;
