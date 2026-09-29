SELECT
  asset_id,
  service_region,
  criticality,
  ROUND(peak_utilization_pct, 1) AS peak_utilization_pct,
  outage_count,
  ROUND(financial_impact_usd, 0) AS financial_impact_usd,
  ROUND(risk_score, 1) AS risk_score,
  risk_band,
  recommended_action
FROM finserv.energy_pulse.gold_feeder_risk
WHERE 1=1 /*FILTERS*/
ORDER BY risk_score DESC, financial_impact_usd DESC,
  CASE criticality WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 ELSE 3 END,
  asset_id
LIMIT 6;
