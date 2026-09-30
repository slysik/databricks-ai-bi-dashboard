WITH daily AS (
  SELECT metric_date, service_region, restoration_cost_usd + lost_revenue_usd AS financial_impact_usd
  FROM finserv.energy_pulse.gold_executive_kpis
),
stats AS (
  SELECT service_region, AVG(financial_impact_usd) AS avg_impact, STDDEV(financial_impact_usd) AS sd_impact
  FROM daily
  GROUP BY service_region
)
SELECT d.metric_date, d.service_region, ROUND(d.financial_impact_usd, 0) AS financial_impact_usd,
  ROUND((d.financial_impact_usd - s.avg_impact) / NULLIF(s.sd_impact, 0), 2) AS z_score
FROM daily d
JOIN stats s ON d.service_region = s.service_region
WHERE ABS((d.financial_impact_usd - s.avg_impact) / NULLIF(s.sd_impact, 0)) >= 2
ORDER BY ABS(z_score) DESC
LIMIT 10;
