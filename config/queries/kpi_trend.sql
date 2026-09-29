SELECT metric_date, ROUND(MAX(peak_demand_mw),1) peak_demand_mw,
  ROUND(AVG(reliability_score),2) reliability_score,
  SUM(customers_affected) customers_affected,
  ROUND(SUM(restoration_cost_usd + lost_revenue_usd),0) financial_impact_usd
FROM finserv.energy_pulse.gold_executive_kpis
WHERE 1=1 /*FILTERS*/
GROUP BY metric_date ORDER BY metric_date DESC LIMIT 12;
