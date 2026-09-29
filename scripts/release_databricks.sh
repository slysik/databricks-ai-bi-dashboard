#!/usr/bin/env bash
set -euo pipefail

PROFILE="${DATABRICKS_PROFILE:-primary-aws-user}"
WAREHOUSE_ID="${DATABRICKS_WAREHOUSE_ID:-4bbaafe9538467a0}"
APP_NAME="${DATABRICKS_APP_NAME:-app-pwb8}"
export DATABRICKS_AUTH_STORAGE="${DATABRICKS_AUTH_STORAGE:-plaintext}"

dbsql() {
  local statement="$1"
  local payload
  payload="$(jq -n --arg wid "$WAREHOUSE_ID" --arg sql "$statement" '{warehouse_id:$wid,statement:$sql,wait_timeout:"50s",disposition:"INLINE",format:"JSON_ARRAY"}')"
  local response
  response="$(databricks api post /api/2.0/sql/statements --profile "$PROFILE" --json "$payload")"
  local state
  state="$(jq -r '.status.state' <<<"$response")"
  if [[ "$state" != "SUCCEEDED" ]]; then
    jq '.status' <<<"$response" >&2
    return 1
  fi
  jq -c '{columns:[.manifest.schema.columns[].name],rows:(.result.data_array // [])}' <<<"$response"
}

echo "Validating local application"
npm run typecheck
npm run build
node --check server.mjs

email="$(databricks current-user me --profile "$PROFILE" -o json | jq -r '.userName')"
workspace_source="/Workspace/Users/${email}/databricks_apps/pulse-appkit"
app_principal="$(databricks apps get "$APP_NAME" --profile "$PROFILE" -o json | jq -r '.service_principal_client_id // empty')"

echo "Creating governed application state"
dbsql 'CREATE SCHEMA IF NOT EXISTS finserv.pulse_app' >/dev/null
dbsql 'CREATE TABLE IF NOT EXISTS finserv.pulse_app.reports (report_id STRING, owner_email STRING, name STRING, description STRING, created_at TIMESTAMP, updated_at TIMESTAMP) USING DELTA' >/dev/null
dbsql 'CREATE TABLE IF NOT EXISTS finserv.pulse_app.report_items (item_id STRING, report_id STRING, owner_email STRING, visual_id STRING, filters_json STRING, title STRING, position INT, created_at TIMESTAMP) USING DELTA' >/dev/null
dbsql 'CREATE TABLE IF NOT EXISTS finserv.pulse_app.user_settings (owner_email STRING, tone STRING, landing_page STRING, default_filters_json STRING, updated_at TIMESTAMP) USING DELTA' >/dev/null
dbsql 'CREATE TABLE IF NOT EXISTS finserv.pulse_app.ai_questions (id STRING, user_email STRING, question STRING, conversation_id STRING, latency_ms BIGINT, status STRING, feedback STRING, created_at TIMESTAMP) USING DELTA' >/dev/null

if [[ -n "$app_principal" ]]; then
  dbsql "GRANT USE CATALOG ON CATALOG finserv TO \`${app_principal}\`" >/dev/null
  dbsql "GRANT USE SCHEMA ON SCHEMA finserv.energy_pulse TO \`${app_principal}\`" >/dev/null
  dbsql "GRANT SELECT ON SCHEMA finserv.energy_pulse TO \`${app_principal}\`" >/dev/null
  dbsql "GRANT USE SCHEMA ON SCHEMA finserv.pulse_app TO \`${app_principal}\`" >/dev/null
  dbsql "GRANT SELECT, MODIFY ON SCHEMA finserv.pulse_app TO \`${app_principal}\`" >/dev/null
fi

echo "Validating governed Gold data"
dbsql 'SELECT COUNT(*) rows, MIN(metric_date) min_date, MAX(metric_date) max_date FROM finserv.energy_pulse.gold_executive_kpis'
dbsql 'SELECT service_region, ROUND(SUM(restoration_cost_usd + lost_revenue_usd),0) exposure FROM finserv.energy_pulse.gold_executive_kpis GROUP BY service_region ORDER BY exposure DESC'
dbsql 'SELECT risk_band, COUNT(*) assets, ROUND(MIN(peak_utilization_pct),1) min_load, ROUND(MAX(peak_utilization_pct),1) max_load FROM finserv.energy_pulse.gold_feeder_risk GROUP BY risk_band'

echo "Syncing ${workspace_source}"
databricks sync . "$workspace_source" --profile "$PROFILE"

echo "Deploying ${APP_NAME}"
databricks apps deploy "$APP_NAME" --source-code-path "$workspace_source" --mode SNAPSHOT --profile "$PROFILE" --timeout 20m

echo "Deployment status"
databricks apps get "$APP_NAME" --profile "$PROFILE" -o json | jq '{name,url,compute_status,active_deployment}'
databricks apps list-deployments "$APP_NAME" --profile "$PROFILE" -o json | jq '.deployments[0] | {deployment_id,status,create_time,update_time,message}'

echo "Release validation complete"
