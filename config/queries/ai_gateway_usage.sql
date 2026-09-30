SELECT destination_model, api_type, COUNT(*) AS requests_7d,
  SUM(input_tokens) AS input_tokens_7d, SUM(output_tokens) AS output_tokens_7d,
  SUM(total_tokens) AS total_tokens_7d, ROUND(AVG(latency_ms), 0) AS avg_latency_ms
FROM system.ai_gateway.usage
WHERE event_time >= current_timestamp() - INTERVAL 7 DAYS
GROUP BY destination_model, api_type
ORDER BY total_tokens_7d DESC;
