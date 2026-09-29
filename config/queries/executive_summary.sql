SELECT
  ROUND(MAX(peak_demand_mw), 1) AS peak_demand_mw,
  ROUND(AVG(avg_capacity_utilization_pct), 1) AS avg_utilization_pct,
  SUM(outage_count) AS outage_count,
  SUM(customers_affected) AS customers_affected,
  ROUND(SUM(restoration_cost_usd + lost_revenue_usd), 0) AS financial_impact_usd,
  ROUND(AVG(reliability_score), 1) AS reliability_score,
  DATE_FORMAT(MAX(metric_date), 'MMM d, yyyy') AS data_period,
  DATE_FORMAT(FROM_UTC_TIMESTAMP(CURRENT_TIMESTAMP(), 'America/New_York'), 'h:mm a') AS last_refreshed_at,
  ROUND(AVG(CASE WHEN metric_date=(SELECT MAX(metric_date) FROM finserv.energy_pulse.gold_executive_kpis) THEN reliability_score END),1) AS current_reliability,
  ROUND(AVG(CASE WHEN metric_date=(SELECT DATE_SUB(MAX(metric_date),1) FROM finserv.energy_pulse.gold_executive_kpis) THEN reliability_score END),1) AS prior_reliability
FROM finserv.energy_pulse.gold_executive_kpis
WHERE 1=1 /*FILTERS*/;
