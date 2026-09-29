SELECT
  cause,
  SUM(outage_count) AS outage_count,
  SUM(customers_affected) AS customers_affected,
  ROUND(SUM(total_financial_impact_usd), 0) AS financial_impact_usd
FROM finserv.energy_pulse.gold_outage_root_cause
WHERE 1=1 /*FILTERS*/
GROUP BY cause
ORDER BY financial_impact_usd DESC;
