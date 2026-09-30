SELECT metric_date, service_region, ROUND(restoration_cost_usd + lost_revenue_usd, 0) AS financial_impact_usd
FROM finserv.energy_pulse.gold_executive_kpis
ORDER BY metric_date;
