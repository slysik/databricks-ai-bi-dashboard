SELECT asset_id, service_region, actual_high_outage_frequency, rule_based_risk_band, rule_based_risk_score,
  predicted_risk_flag, ROUND(predicted_probability, 3) AS predicted_probability
FROM finserv.energy_pulse.gold_asset_risk_predictions
ORDER BY predicted_probability DESC
LIMIT 8;
