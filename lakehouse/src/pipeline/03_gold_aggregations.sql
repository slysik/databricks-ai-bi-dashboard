CREATE OR REFRESH MATERIALIZED VIEW gold_executive_kpis
(metric_date DATE COMMENT 'Business date represented by the executive metrics; use as the time axis',
 service_region STRING COMMENT 'Excel Energy operating region used for geographic comparisons and filters',
 peak_demand_mw DECIMAL(14,2) COMMENT 'Maximum observed electricity demand in megawatts for the day and region',
 avg_capacity_utilization_pct DECIMAL(8,2) COMMENT 'Average demand as a percentage of available grid asset capacity',
 peak_capacity_utilization_pct DECIMAL(8,2) COMMENT 'Highest demand-to-capacity percentage; values above 100 indicate overload',
 overload_readings BIGINT COMMENT 'Count of telemetry observations at or above 100 percent capacity',
 outage_count BIGINT COMMENT 'Number of outage-management events recorded for the day and region',
 customers_affected BIGINT COMMENT 'Total customer impact summed across outage events; customers may appear in multiple events',
 customer_minutes_interrupted BIGINT COMMENT 'Customers affected multiplied by outage duration; primary reliability-impact measure',
 restoration_cost_usd DECIMAL(16,2) COMMENT 'Estimated direct field-service and restoration cost in US dollars',
 lost_revenue_usd DECIMAL(16,2) COMMENT 'Estimated electricity revenue not realized because of outages, in US dollars',
 reliability_score DECIMAL(6,2) COMMENT 'Executive reliability index from 0 to 100 where higher is better')
COMMENT 'Daily executive scorecard by region for demand, reliability, customer impact, and financial exposure'
CLUSTER BY (metric_date, service_region)
AS
WITH load AS (
  SELECT
    reading_date AS metric_date,
    service_region,
    MAX(demand_mw) AS peak_demand_mw,
    AVG(capacity_utilization_pct) AS avg_capacity_utilization_pct,
    MAX(capacity_utilization_pct) AS peak_capacity_utilization_pct,
    SUM(CASE WHEN capacity_utilization_pct >= 100 THEN 1 ELSE 0 END) AS overload_readings
  FROM silver_meter_readings
  GROUP BY reading_date, service_region
), outages AS (
  SELECT
    outage_date AS metric_date,
    service_region,
    COUNT(*) AS outage_count,
    SUM(customers_affected) AS customers_affected,
    SUM(duration_minutes * customers_affected) AS customer_minutes_interrupted,
    SUM(restoration_cost_usd) AS restoration_cost_usd,
    SUM(lost_revenue_usd) AS lost_revenue_usd
  FROM silver_outage_events
  GROUP BY outage_date, service_region
)
SELECT
  l.metric_date,
  l.service_region,
  CAST(l.peak_demand_mw AS DECIMAL(14,2)) AS peak_demand_mw,
  CAST(l.avg_capacity_utilization_pct AS DECIMAL(8,2)) AS avg_capacity_utilization_pct,
  CAST(l.peak_capacity_utilization_pct AS DECIMAL(8,2)) AS peak_capacity_utilization_pct,
  l.overload_readings,
  COALESCE(o.outage_count, 0) AS outage_count,
  COALESCE(o.customers_affected, 0) AS customers_affected,
  COALESCE(o.customer_minutes_interrupted, 0) AS customer_minutes_interrupted,
  CAST(COALESCE(o.restoration_cost_usd, 0) AS DECIMAL(16,2)) AS restoration_cost_usd,
  CAST(COALESCE(o.lost_revenue_usd, 0) AS DECIMAL(16,2)) AS lost_revenue_usd,
  CAST(GREATEST(0, 100 - COALESCE(o.customer_minutes_interrupted, 0) / 50000.0) AS DECIMAL(6,2)) AS reliability_score
FROM load l
LEFT JOIN outages o
  ON l.metric_date = o.metric_date
 AND l.service_region = o.service_region;

CREATE OR REFRESH MATERIALIZED VIEW gold_feeder_risk
(asset_id STRING COMMENT 'Stable identifier for a feeder, transformer, or substation',
 asset_type STRING COMMENT 'Grid equipment category used for maintenance and capacity comparisons',
 service_region STRING COMMENT 'Excel Energy operating region responsible for the asset',
 criticality STRING COMMENT 'Business criticality tier assigned by grid operations',
 asset_age_years INT COMMENT 'Current age of the asset calculated from its commissioned year',
 capacity_mw DECIMAL(10,2) COMMENT 'Rated asset capacity in megawatts',
 peak_utilization_pct DECIMAL(8,2) COMMENT 'Maximum observed demand divided by rated capacity; above 100 indicates overload',
 avg_utilization_pct DECIMAL(8,2) COMMENT 'Average observed demand divided by rated capacity',
 overload_hours BIGINT COMMENT 'Count of telemetry intervals where utilization reached or exceeded 100 percent',
 outage_count BIGINT COMMENT 'Number of outage events linked to the asset',
 customers_affected BIGINT COMMENT 'Total customer impact linked to the asset across outage events',
 financial_impact_usd DECIMAL(16,2) COMMENT 'Restoration cost plus lost revenue attributed to the asset, in US dollars',
 risk_score DECIMAL(6,2) COMMENT 'Explainable operational risk score from 0 to 100 where higher requires faster action',
 risk_band STRING COMMENT 'Executive risk category derived from risk score: Critical, High, Moderate, or Low',
 recommended_action STRING COMMENT 'Plain-English operational recommendation associated with the asset risk level')
COMMENT 'Asset-level risk ranking with explainable drivers and recommended executive action'
CLUSTER BY (risk_band, service_region)
AS
WITH telemetry AS (
  SELECT
    asset_id,
    MAX(capacity_utilization_pct) AS peak_utilization_pct,
    AVG(capacity_utilization_pct) AS avg_utilization_pct,
    SUM(CASE WHEN capacity_utilization_pct >= 100 THEN 1 ELSE 0 END) AS overload_hours
  FROM silver_meter_readings
  GROUP BY asset_id
), outages AS (
  SELECT
    asset_id,
    COUNT(*) AS outage_count,
    SUM(customers_affected) AS customers_affected,
    SUM(restoration_cost_usd + lost_revenue_usd) AS financial_impact_usd
  FROM silver_outage_events
  GROUP BY asset_id
), scored AS (
  SELECT
    a.asset_id,
    a.asset_type,
    a.service_region,
    a.criticality,
    a.asset_age_years,
    a.capacity_mw,
    t.peak_utilization_pct,
    t.avg_utilization_pct,
    t.overload_hours,
    COALESCE(o.outage_count, 0) AS outage_count,
    COALESCE(o.customers_affected, 0) AS customers_affected,
    CAST(COALESCE(o.financial_impact_usd, 0) AS DECIMAL(16,2)) AS financial_impact_usd,
    LEAST(99.9,
      t.peak_utilization_pct * 0.35
      + LEAST(t.overload_hours, 40) * 0.6
      + LEAST(COALESCE(o.outage_count, 0), 20) * 0.7
      + LEAST(COALESCE(o.financial_impact_usd, 0) / 100000.0, 15)
      + CASE WHEN a.criticality = 'Critical' THEN 5 WHEN a.criticality = 'High' THEN 2.5 ELSE 0 END
    ) AS risk_score
  FROM silver_grid_assets a
  INNER JOIN telemetry t ON a.asset_id = t.asset_id
  LEFT JOIN outages o ON a.asset_id = o.asset_id
)
SELECT
  asset_id,
  asset_type,
  service_region,
  criticality,
  asset_age_years,
  capacity_mw,
  CAST(peak_utilization_pct AS DECIMAL(8,2)) AS peak_utilization_pct,
  CAST(avg_utilization_pct AS DECIMAL(8,2)) AS avg_utilization_pct,
  overload_hours,
  outage_count,
  customers_affected,
  financial_impact_usd,
  CAST(risk_score AS DECIMAL(6,2)) AS risk_score,
  CASE WHEN risk_score >= 85 THEN 'Critical'
       WHEN risk_score >= 70 THEN 'High'
       WHEN risk_score >= 50 THEN 'Moderate'
       ELSE 'Low' END AS risk_band,
  CASE WHEN risk_score >= 85 THEN 'Prioritize capacity upgrade and inspect within 7 days'
       WHEN risk_score >= 70 THEN 'Schedule engineering review and targeted maintenance'
       WHEN risk_score >= 50 THEN 'Increase monitoring during peak and extreme weather'
       ELSE 'Continue standard preventive maintenance' END AS recommended_action
FROM scored;

CREATE OR REFRESH MATERIALIZED VIEW gold_outage_root_cause
(outage_date DATE COMMENT 'Date on which the outage began; use as the trend axis',
 service_region STRING COMMENT 'Excel Energy operating region impacted by the outage',
 cause STRING COMMENT 'Primary operational cause assigned by the outage-management system',
 severity STRING COMMENT 'Business severity classification: Major, Moderate, or Minor',
 outage_count BIGINT COMMENT 'Number of outage events in the grouping',
 avg_duration_minutes DECIMAL(10,2) COMMENT 'Mean outage duration in minutes',
 customers_affected BIGINT COMMENT 'Total customer impact across grouped outage events',
 restoration_cost_usd DECIMAL(16,2) COMMENT 'Total direct restoration cost in US dollars',
 lost_revenue_usd DECIMAL(16,2) COMMENT 'Total estimated revenue loss in US dollars',
 total_financial_impact_usd DECIMAL(16,2) COMMENT 'Restoration cost plus lost revenue in US dollars; use for financial rankings')
COMMENT 'Root-cause and financial-impact summary designed for automatically generated executive visuals'
CLUSTER BY (outage_date, service_region)
AS
SELECT
  outage_date,
  service_region,
  cause,
  severity,
  COUNT(*) AS outage_count,
  CAST(AVG(duration_minutes) AS DECIMAL(10,2)) AS avg_duration_minutes,
  SUM(customers_affected) AS customers_affected,
  CAST(SUM(restoration_cost_usd) AS DECIMAL(16,2)) AS restoration_cost_usd,
  CAST(SUM(lost_revenue_usd) AS DECIMAL(16,2)) AS lost_revenue_usd,
  CAST(SUM(restoration_cost_usd + lost_revenue_usd) AS DECIMAL(16,2)) AS total_financial_impact_usd
FROM silver_outage_events
GROUP BY outage_date, service_region, cause, severity;

CREATE OR REFRESH MATERIALIZED VIEW gold_load_weather
(metric_date DATE COMMENT 'Business date for weather and grid-load comparison',
 service_region STRING COMMENT 'Excel Energy operating region',
 max_temperature_f DECIMAL(5,1) COMMENT 'Highest observed daily temperature in degrees Fahrenheit',
 avg_temperature_f DECIMAL(5,1) COMMENT 'Average observed daily temperature in degrees Fahrenheit',
 max_wind_mph DECIMAL(5,1) COMMENT 'Highest observed daily wind speed in miles per hour',
 weather_warning INT COMMENT 'Indicator equal to 1 when the region had an extreme-weather warning',
 peak_demand_mw DECIMAL(14,2) COMMENT 'Maximum observed regional demand in megawatts',
 avg_capacity_utilization_pct DECIMAL(8,2) COMMENT 'Average regional grid capacity utilization percentage',
 peak_capacity_utilization_pct DECIMAL(8,2) COMMENT 'Maximum regional grid capacity utilization percentage')
COMMENT 'Daily weather-to-grid relationship for explaining demand peaks, capacity stress, and outage trends'
CLUSTER BY (metric_date, service_region)
AS
WITH load AS (
  SELECT
    reading_date,
    service_region,
    MAX(demand_mw) AS peak_demand_mw,
    AVG(capacity_utilization_pct) AS avg_capacity_utilization_pct,
    MAX(capacity_utilization_pct) AS peak_capacity_utilization_pct
  FROM silver_meter_readings
  GROUP BY reading_date, service_region
), weather AS (
  SELECT
    weather_date,
    service_region,
    MAX(temperature_f) AS max_temperature_f,
    AVG(temperature_f) AS avg_temperature_f,
    MAX(wind_mph) AS max_wind_mph,
    MAX(CASE WHEN alert_level = 'Warning' THEN 1 ELSE 0 END) AS weather_warning
  FROM silver_weather_hourly
  GROUP BY weather_date, service_region
)
SELECT
  l.reading_date AS metric_date,
  l.service_region,
  CAST(w.max_temperature_f AS DECIMAL(5,1)) AS max_temperature_f,
  CAST(w.avg_temperature_f AS DECIMAL(5,1)) AS avg_temperature_f,
  CAST(w.max_wind_mph AS DECIMAL(5,1)) AS max_wind_mph,
  w.weather_warning,
  CAST(l.peak_demand_mw AS DECIMAL(14,2)) AS peak_demand_mw,
  CAST(l.avg_capacity_utilization_pct AS DECIMAL(8,2)) AS avg_capacity_utilization_pct,
  CAST(l.peak_capacity_utilization_pct AS DECIMAL(8,2)) AS peak_capacity_utilization_pct
FROM load l
INNER JOIN weather w
  ON l.reading_date = w.weather_date
 AND l.service_region = w.service_region;
