SELECT
  service_region,
  SUM(customers_affected) AS customers_affected,
  ROUND(SUM(restoration_cost_usd + lost_revenue_usd), 0) AS financial_impact_usd,
  ROUND(AVG(reliability_score), 1) AS reliability_score
FROM finserv.energy_pulse.gold_executive_kpis
WHERE 1=1 /*FILTERS*/
GROUP BY service_region
ORDER BY financial_impact_usd DESC;
