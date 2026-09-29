SELECT table_name, table_type
FROM finserv.information_schema.tables
WHERE table_schema = 'energy_pulse'
ORDER BY table_name;

SELECT metric_date, service_region, peak_capacity_utilization_pct,
       customers_affected, lost_revenue_usd, reliability_score
FROM finserv.energy_pulse.gold_executive_kpis
ORDER BY lost_revenue_usd DESC
LIMIT 20;

SELECT asset_id, service_region, risk_score, risk_band, recommended_action
FROM finserv.energy_pulse.gold_feeder_risk
ORDER BY risk_score DESC
LIMIT 20;
