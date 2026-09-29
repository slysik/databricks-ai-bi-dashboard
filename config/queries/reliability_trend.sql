SELECT metric_date, ROUND(AVG(reliability_score),2) reliability_score
FROM finserv.energy_pulse.gold_executive_kpis
WHERE 1=1 /*FILTERS*/
GROUP BY metric_date ORDER BY metric_date;
