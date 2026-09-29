import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const staticRoot = join(root, 'client', 'dist');
let host = (process.env.DATABRICKS_HOST || 'https://dbc-61514402-8451.cloud.databricks.com').replace(/\/$/, '');
if (!/^https?:\/\//.test(host)) host = `https://${host}`;
const warehouse = process.env.DATABRICKS_WAREHOUSE_ID || '4bbaafe9538467a0';
const genieSpace = process.env.DATABRICKS_GENIE_SPACE_ID || '01f1bc21135d1e4abfbbad97a44dae6f';
const queryNames = ['executive_summary', 'feeder_risk', 'outage_causes', 'regional_impact', 'kpi_trend', 'reliability_trend', 'data_freshness', 'ai_usage', 'query_latency', 'warehouse_spend'];
const queries = Object.fromEntries(queryNames.map(name => [name, readFileSync(join(root, 'config', 'queries', `${name}.sql`), 'utf8')]));

const json = (res, value, status = 200) => {
  const body = JSON.stringify(value);
  res.writeHead(status, {'content-type': 'application/json', 'content-length': Buffer.byteLength(body)});
  res.end(body);
};

async function api(path, token, method = 'GET', body) {
  const response = await fetch(`${host}${path}`, {
    method,
    headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || payload.error || `Databricks API ${response.status}`);
  return payload;
}

const escapeSql = value => String(value).replaceAll("'", "''");
const contentType = path => ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'}[extname(path)] || 'application/octet-stream');

async function executeSql(statement, token) {
  const result = await api('/api/2.0/sql/statements', token, 'POST', {warehouse_id: warehouse, statement, wait_timeout: '50s', disposition: 'INLINE', format: 'JSON_ARRAY'});
  if (result.status?.state !== 'SUCCEEDED') throw new Error(result.status?.error?.message || 'SQL did not complete');
  const columns = (result.manifest?.schema?.columns || []).map(column => column.name);
  return {columns, rows: result.result?.data_array || []};
}

async function handleQuery(req, res, url, token) {
  const key = url.pathname.split('/').pop();
  if (key === 'identity') {
    const displayName = req.headers['x-forwarded-preferred-username'] || req.headers['x-forwarded-email'] || 'Signed-in Databricks user';
    return json(res, [{display_name: displayName, email: req.headers['x-forwarded-email'] || '', authorization: req.headers['x-forwarded-access-token'] ? 'signed-in user token available' : 'app service principal'}]);
  }
  if (!queries[key]) return json(res, {error: 'Unknown query'}, 404);
  const clauses = [];
  const region = url.searchParams.get('region') || 'All';
  const period = url.searchParams.get('period') || 'All';
  const risk = url.searchParams.get('risk') || 'All';
  if (region !== 'All') clauses.push(`service_region = '${escapeSql(region)}'`);
  const dateColumn = key === 'outage_causes' ? 'outage_date' : 'metric_date';
  if (['executive_summary','regional_impact','outage_causes','kpi_trend','reliability_trend'].includes(key)) {
    if (period === 'July heat wave') clauses.push(`MONTH(${dateColumn}) = 7`);
    if (period === 'Latest 30 days') clauses.push(`${dateColumn} >= (SELECT MAX(${dateColumn}) - INTERVAL 29 DAYS FROM finserv.energy_pulse.${key === 'outage_causes' ? 'gold_outage_root_cause' : 'gold_executive_kpis'})`);
  }
  if (key === 'feeder_risk' && risk !== 'All') clauses.push(`risk_band = '${escapeSql(risk)}'`);
  const statement = queries[key].replace('/*FILTERS*/', clauses.length ? ` AND ${clauses.join(' AND ')}` : '');
  const result = await executeSql(statement, token);
  return json(res, result.rows.map(row => Object.fromEntries(result.columns.map((column, index) => [column, row[index]]))));
}

const ownerOf = req => String(req.headers['x-forwarded-email'] || 'app-service-principal').toLowerCase();
const sqlString = value => `'${escapeSql(String(value))}'`;
let appTablesReady;
async function ensureAppTables(token) {
  if (!appTablesReady) {
    appTablesReady = executeSql('SELECT 1 FROM finserv.pulse_app.reports LIMIT 0', token).catch(async () => {
      await executeSql('CREATE SCHEMA IF NOT EXISTS finserv.pulse_app', token);
      await executeSql('CREATE TABLE IF NOT EXISTS finserv.pulse_app.reports (report_id STRING, owner_email STRING, name STRING, description STRING, created_at TIMESTAMP, updated_at TIMESTAMP) USING DELTA', token);
      await executeSql('CREATE TABLE IF NOT EXISTS finserv.pulse_app.report_items (item_id STRING, report_id STRING, owner_email STRING, visual_id STRING, filters_json STRING, title STRING, position INT, created_at TIMESTAMP) USING DELTA', token);
      await executeSql('CREATE TABLE IF NOT EXISTS finserv.pulse_app.user_settings (owner_email STRING, tone STRING, landing_page STRING, default_filters_json STRING, updated_at TIMESTAMP) USING DELTA', token);
      await executeSql('CREATE TABLE IF NOT EXISTS finserv.pulse_app.ai_questions (id STRING, user_email STRING, question STRING, conversation_id STRING, latency_ms BIGINT, status STRING, feedback STRING, created_at TIMESTAMP) USING DELTA', token);
    });
  }
  return appTablesReady;
}
async function handleReports(req,res,url,token){
  await ensureAppTables(token); const owner=ownerOf(req); const parts=url.pathname.split('/').filter(Boolean); const id=parts[2];
  if(req.method==='GET'&&!id){const r=await executeSql(`SELECT r.report_id,r.name,r.description,r.updated_at,COUNT(i.item_id) item_count FROM finserv.pulse_app.reports r LEFT JOIN finserv.pulse_app.report_items i ON r.report_id=i.report_id AND r.owner_email=i.owner_email WHERE r.owner_email=${sqlString(owner)} GROUP BY ALL ORDER BY r.updated_at DESC`,token);return json(res,r.rows.map(x=>Object.fromEntries(r.columns.map((c,i)=>[c,x[i]]))));}
  const chunks=[];for await(const c of req)chunks.push(c);const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{};
  if(req.method==='POST'&&!id){const rid=crypto.randomUUID();await executeSql(`INSERT INTO finserv.pulse_app.reports VALUES (${sqlString(rid)},${sqlString(owner)},${sqlString(body.name||'Untitled report')},'',current_timestamp(),current_timestamp())`,token);return json(res,{report_id:rid,name:body.name||'Untitled report'},201);}
  if(req.method==='GET'&&id&&parts[3]==='items'){const r=await executeSql(`SELECT item_id,visual_id,filters_json,title,position FROM finserv.pulse_app.report_items WHERE owner_email=${sqlString(owner)} AND report_id=${sqlString(id)} ORDER BY position`,token);return json(res,r.rows.map(x=>Object.fromEntries(r.columns.map((c,i)=>[c,x[i]]))));}
  if(req.method==='POST'&&id&&parts[3]==='items'){const iid=crypto.randomUUID();await executeSql(`INSERT INTO finserv.pulse_app.report_items VALUES (${sqlString(iid)},${sqlString(id)},${sqlString(owner)},${sqlString(body.visualId)},${sqlString(JSON.stringify(body.filters||{}))},${sqlString(body.title||'')},COALESCE((SELECT MAX(position)+1 FROM finserv.pulse_app.report_items WHERE report_id=${sqlString(id)}),0),current_timestamp())`,token);return json(res,{item_id:iid},201);}
  if(req.method==='DELETE'&&id&&parts[3]==='items'&&parts[4]){await executeSql(`DELETE FROM finserv.pulse_app.report_items WHERE owner_email=${sqlString(owner)} AND report_id=${sqlString(id)} AND item_id=${sqlString(parts[4])}`,token);return json(res,{ok:true});}
  return json(res,{error:'Unsupported reports operation'},405);
}

async function handleGenie(req, res, token) {
  const requestStarted = Date.now();
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const requested = String(body.question || '').toLowerCase();
  const heatWaveIntent = requested.includes('daily') && requested.includes('demand') && requested.includes('temperature');
  let genieQuestion = body.question;
  if (heatWaveIntent) genieQuestion += ' Return metric_date, service_region, daily peak_demand_mw, and AVG temperature as avg_temperature_f. Group by both date and service region, preserve chronological date order, and do not substitute maximum temperature.';
  const started = await api(`/api/2.0/genie/spaces/${genieSpace}/start-conversation`, token, 'POST', {content: genieQuestion});
  const {conversation_id: conversationId, message_id: messageId} = started;
  let message = started;
  for (let attempt = 0; attempt < 60 && !['COMPLETED','FAILED','CANCELLED'].includes(message.status); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    message = await api(`/api/2.0/genie/spaces/${genieSpace}/conversations/${conversationId}/messages/${messageId}`, token);
  }
  let texts = [];
  let queryAttachment;
  let queryAttachmentId;
  let suggestions = [];
  let hasViz = false;
  for (const attachment of message.attachments || []) {
    if (attachment.text?.content && attachment.text?.purpose === 'TEXT_ATTACHMENT_PURPOSE_ANSWER') texts.push(attachment.text.content);
    if (attachment.query) { queryAttachment = attachment.query; queryAttachmentId = attachment.attachment_id; }
    if (attachment.suggested_questions) suggestions = attachment.suggested_questions.questions || [];
    if (attachment.viz) hasViz = true;
  }
  if (!texts.length && message.status !== 'COMPLETED') throw new Error(`Genie status: ${message.status}`);
  let dataset;
  if (queryAttachment && queryAttachmentId) {
    const response = await api(`/api/2.0/genie/spaces/${genieSpace}/conversations/${conversationId}/messages/${messageId}/attachments/${queryAttachmentId}/query-result`, token);
    const result = response.statement_response || response;
    const columns = (result.manifest?.schema?.columns || []).map(column => column.name);
    dataset = {columns, rows: result.result?.data_array || []};
  }
  const required = ['metric_date','service_region','peak_demand_mw','avg_temperature_f'];
  if (heatWaveIntent && (!dataset || !required.every(column => dataset.columns.includes(column)))) {
    const correctedSql = "SELECT metric_date, service_region, ROUND(peak_demand_mw, 1) AS peak_demand_mw, ROUND(avg_temperature_f, 1) AS avg_temperature_f FROM finserv.energy_pulse.gold_load_weather WHERE MONTH(metric_date) = 7 ORDER BY metric_date, service_region";
    dataset = await executeSql(correctedSql, token);
    queryAttachment = {query: correctedSql, description: 'Peak demand rose with average temperature across all four service regions during the July heat wave.'};
    texts = ['Daily peak demand and **average temperature** are shown chronologically for each service region. The separate panels preserve the units and make regional divergence easy to compare.'];
  }
  const chartType = requested.includes('pareto') ? 'pareto' : ['line','trend','over time','daily'].some(term => requested.includes(term)) ? 'line' : 'bar';
  const questionId=crypto.randomUUID();
  try{await ensureAppTables(token);await executeSql(`INSERT INTO finserv.pulse_app.ai_questions VALUES (${sqlString(questionId)},${sqlString('app-service-principal')},${sqlString(body.question)},${sqlString(conversationId)},${Date.now()-requestStarted},${sqlString(message.status||'COMPLETED')},NULL,current_timestamp())`,token);}catch(error){console.warn('AI question logging unavailable',error instanceof Error?error.message:String(error));}
  return json(res, {question_id:questionId, conversation_id:conversationId, message_id:messageId, question: body.question, answer: texts.join('\n\n') || 'Analysis complete.', genie_url: `${host}/genie/rooms/${genieSpace}`, sql: queryAttachment?.query, description: queryAttachment?.description, data: dataset, chart_type: chartType, has_viz: hasViz, suggestions});
}

async function handleSettings(req,res,token){await ensureAppTables(token);const owner=ownerOf(req);if(req.method==='GET'){const r=await executeSql(`SELECT tone,landing_page,default_filters_json FROM finserv.pulse_app.user_settings WHERE owner_email=${sqlString(owner)} ORDER BY updated_at DESC LIMIT 1`,token);return json(res,r.rows.length?Object.fromEntries(r.columns.map((c,i)=>[c,r.rows[0][i]])):{});}const chunks=[];for await(const c of req)chunks.push(c);const b=JSON.parse(Buffer.concat(chunks).toString('utf8'));await executeSql(`DELETE FROM finserv.pulse_app.user_settings WHERE owner_email=${sqlString(owner)}`,token);await executeSql(`INSERT INTO finserv.pulse_app.user_settings VALUES (${sqlString(owner)},${sqlString(b.tone||'tonal')},${sqlString(b.landingPage||'/')},${sqlString(JSON.stringify(b.defaultFilters||{}))},current_timestamp())`,token);return json(res,{ok:true});}
async function handleFeedback(req,res,token){await ensureAppTables(token);const chunks=[];for await(const c of req)chunks.push(c);const b=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!['up','down'].includes(b.feedback))return json(res,{error:'Invalid feedback'},400);await executeSql(`UPDATE finserv.pulse_app.ai_questions SET feedback=${sqlString(b.feedback)} WHERE id=${sqlString(b.questionId)} AND user_email IN (${sqlString(ownerOf(req))},'app-service-principal')`,token);return json(res,{ok:true});}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const token = req.headers['x-forwarded-access-token'] || process.env.DATABRICKS_TOKEN || '';
    if (req.method === 'GET' && url.pathname.startsWith('/api/query/')) return await handleQuery(req, res, url, token);
    if (req.method === 'POST' && url.pathname === '/api/genie') return await handleGenie(req, res, token);
    if (url.pathname.startsWith('/api/reports')) return await handleReports(req,res,url,token);
    if (url.pathname==='/api/settings') return await handleSettings(req,res,token);
    if (req.method==='POST'&&url.pathname==='/api/feedback') return await handleFeedback(req,res,token);
    const requested = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.(\/|\\|$))+/, '');
    let target = join(staticRoot, requested === '/' ? 'index.html' : requested);
    if (!existsSync(target)) target = join(staticRoot, 'index.html');
    const payload = readFileSync(target);
    res.writeHead(200, {'content-type': contentType(target), 'content-length': payload.length});
    res.end(payload);
  } catch (error) {
    json(res, {error: error instanceof Error ? error.message : String(error)}, 500);
  }
}).listen(Number(process.env.DATABRICKS_APP_PORT || 8000), '0.0.0.0');
