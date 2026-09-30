import { createBrowserRouter, RouterProvider, NavLink, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Alert,
  AlertDescription,
  AreaChart,
  Badge,
  BarChart,
  DonutChart,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  LineChart,
  PieChart,
  ScatterChart,
  Skeleton,
  Avatar,
  AvatarFallback,
  Kbd,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  ToggleGroup,
  ToggleGroupItem,
  Toaster,
} from '@databricks/appkit-ui/react';
import { Activity, BarChart3, Bot, Code2, FileText, Filter, Gauge, LayoutGrid, Pencil, RotateCcw, Settings, ShieldAlert, Users, WalletCards, Zap } from 'lucide-react';

type QueryResult = Record<string, unknown>;
function usePulseQuery(key: string, filters: Record<string, string> = {}) {
  const [data, setData] = useState<QueryResult[]>();
  const [error, setError] = useState('');
  const query = new URLSearchParams(filters).toString();
  useEffect(() => { setData(undefined); setError(''); fetch(`/api/query/${key}?${query}`).then(r => r.ok ? r.json() : r.text().then(Promise.reject.bind(Promise))).then(setData).catch(e => setError(String(e))); }, [key, query]);
  return { data, error, loading: !data && !error };
}

type Tone='tonal'|'neutral'|'dark';
function setDocumentTone(tone:Tone){document.documentElement.dataset.tone=tone==='dark'?'tonal':tone;document.documentElement.classList.toggle('dark',tone==='dark');try{localStorage.setItem('pulse-tone',tone)}catch{/* storage can be disabled */}}
function Layout() {
  const identity = usePulseQuery('identity');
  const freshness=usePulseQuery('data_freshness');
  const user = identity.data?.[0];
  const location=useLocation(); const navigate=useNavigate();
  const [tone,setTone]=useState<Tone>(()=>{try{return (localStorage.getItem('pulse-tone') as Tone)||'tonal'}catch{return 'tonal'}});
  useEffect(()=>setDocumentTone(tone),[tone]);
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();navigate('/ask')}};addEventListener('keydown',onKey);return()=>removeEventListener('keydown',onKey)},[navigate]);
  const email=String(user?.email||user?.display_name||'Signed-in user');
  const routes=[['/','Executive Dashboard',LayoutGrid],['/reports','Custom Reports',FileText],['/observability','Observability',Activity]] as const;

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" variant="sidebar"><SidebarHeader><div className="pulse-brand"><div className="brand-mark"><Zap size={18} fill="currentColor"/></div><div className="brand-copy"><b>Pulse</b><small>ENERGY INTELLIGENCE</small></div></div><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild tooltip="Ask Pulse AI" className="sidebar-ask"><NavLink to="/ask"><Bot/><span>Ask Pulse AI</span><Kbd>⌘K</Kbd></NavLink></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarHeader>
      <SidebarContent><SidebarGroup><SidebarGroupLabel>Workspace</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{routes.map(([to,label,Icon])=><SidebarMenuItem key={to}><SidebarMenuButton asChild tooltip={label} isActive={to==='/'?location.pathname==='/':location.pathname.startsWith(to)}><NavLink to={to}><Icon/><span>{label}</span></NavLink></SidebarMenuButton>{to==='/reports'&&<SidebarMenuBadge>0</SidebarMenuBadge>}</SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
      <SidebarFooter><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild tooltip="Settings" isActive={location.pathname==='/settings'}><NavLink to="/settings"><Settings/><span>Settings</span></NavLink></SidebarMenuButton></SidebarMenuItem></SidebarMenu><div className="sidebar-user"><Avatar><AvatarFallback>{email.slice(0,2).toUpperCase()}</AvatarFallback></Avatar><div><b>{email}</b><small>Queries run as app service principal</small></div></div></SidebarFooter><SidebarRail/></Sidebar>
      <SidebarInset><header className="pulse-topbar"><SidebarTrigger/><h1>{location.pathname.startsWith('/reports')?'Custom Reports':location.pathname==='/observability'?'Observability':location.pathname==='/settings'?'Settings':location.pathname==='/ask'?'Ask Pulse AI':'Executive Dashboard'}</h1><span className="top-fresh"><i className={freshness.data?.some(r=>r.status==='Stale')?'stale':''}/> {freshness.loading?'Checking Gold freshness…':freshness.error?'Freshness unavailable':`Gold refreshed ${String(freshness.data?.[0]?.last_altered||'unknown')}`}</span><ToggleGroup type="single" value={tone} onValueChange={v=>v&&setTone(v as Tone)}><ToggleGroupItem value="tonal">Tonal</ToggleGroupItem><ToggleGroupItem value="neutral">Neutral</ToggleGroupItem><ToggleGroupItem value="dark">Dark</ToggleGroupItem></ToggleGroup></header><main className="app-main"><Outlet/></main></SidebarInset><Toaster/>
    </SidebarProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <ExecutivePage /> },
      { path: '/ask', element: <AskPulsePage /> },
      { path: '/reports', element: <ReportsPage /> },
      { path: '/reports/:reportId', element: <ReportPage /> },
      { path: '/observability', element: <ObservabilityPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}

type Report={report_id:string;name:string;description?:string;item_count?:number};
function ReportsPage(){const [reports,setReports]=useState<Report[]>();const [error,setError]=useState('');useEffect(()=>{fetch('/api/reports').then(r=>r.ok?r.json():Promise.reject(new Error('Reports unavailable'))).then(setReports).catch(e=>setError(String(e)))},[]);async function create(){const name=prompt('Report name','Q3 Board Review');if(!name)return;const r=await fetch('/api/reports',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});if(r.ok)setReports([await r.json(),...(reports||[])])}return <div className="pulse-shell"><div className="page-heading"><div><h2>Custom Reports</h2><p>Saved visual definitions re-query governed data when opened.</p></div><button onClick={create}>＋ New report</button></div>{!reports&&!error?<Skeleton className="h-40"/>:error?<ErrorBox message={error}/>:!reports?.length?<Empty><EmptyHeader><EmptyTitle>No reports yet</EmptyTitle><EmptyDescription>Create a report, then pin visuals from the Executive Dashboard.</EmptyDescription></EmptyHeader></Empty>:<div className="report-grid">{reports.map(r=><NavLink className="panel report-card" to={`/reports/${r.report_id}`} key={r.report_id}><h3>{r.name}</h3><p>{r.item_count||0} live visuals</p></NavLink>)}</div>}</div>}
type ReportItem={item_id:string;visual_id:string;filters_json:string;title?:string;position:number};
function ReportPage(){const {reportId}=useParams();const [items,setItems]=useState<ReportItem[]>();const [error,setError]=useState('');useEffect(()=>{fetch(`/api/reports/${reportId}/items`).then(r=>r.ok?r.json():Promise.reject(new Error('Report unavailable'))).then(setItems).catch(e=>setError(String(e)))},[reportId]);return <div className="pulse-shell"><div className="page-heading"><div><h2>Live governed report</h2><p>Every tile re-queries with its saved filters.</p></div><button disabled title="Coming soon">Export PDF</button></div>{!items&&!error?<Skeleton className="h-40"/>:error?<ErrorBox message={error}/>:!items?.length?<Empty><EmptyHeader><EmptyTitle>No visuals yet</EmptyTitle><EmptyDescription>Use Add to report on the Executive Dashboard.</EmptyDescription></EmptyHeader></Empty>:<div className="report-grid">{items.map(i=>i.visual_id.startsWith('genie_result')?<div className="report-genie-tile" key={i.item_id}><SavedGenieVisual item={i}/></div>:<SavedVisual key={i.item_id} item={i}/>)}</div>}</div>}
function SavedVisual({item}:{item:ReportItem}){let filters:Record<string,string>={};try{filters=JSON.parse(item.filters_json||'{}')}catch{}const q=usePulseQuery('executive_summary',filters);const row=q.data?.[0];const value=item.visual_id.includes('reliability')?number(row?.reliability_score):item.visual_id.includes('peak_demand')?`${number(row?.peak_demand_mw)} MW`:item.visual_id.includes('customers')?number(row?.customers_affected):money(row?.financial_impact_usd);return <Panel title={item.title||item.visual_id.replaceAll('_',' ')} subtitle={`Saved filters: ${Object.values(filters).join(' · ')}`}>{q.loading?<Skeleton className="h-28"/>:q.error?<ErrorBox message={q.error}/>:!q.data?.length?<Empty><EmptyHeader><EmptyTitle>No data</EmptyTitle><EmptyDescription>Adjust the saved filters.</EmptyDescription></EmptyHeader></Empty>:<div className="val">{value}</div>}</Panel>}
function ObservabilityPage(){const fresh=usePulseQuery('data_freshness'),ai=usePulseQuery('ai_usage'),latency=usePulseQuery('query_latency'),spend=usePulseQuery('warehouse_spend');const cards=[ai.data?.[0]&&<Kpi key="ai" icon={<Bot/>} label="Pulse AI questions" value={number(ai.data[0].questions_7d)} detail="Last 7 days · app question log" change={ai.data[0].helpful_pct?`${number(ai.data[0].helpful_pct)}% helpful`:'No ratings yet'}/>,latency.data?.[0]&&<Kpi key="lat" icon={<Gauge/>} label="p95 query latency" value={`${number(latency.data[0].p95_s)} s`} detail="Last 7 days · SQL warehouse" change="system.query.history"/>,spend.data?.[0]&&<Kpi key="spend" icon={<WalletCards/>} label="Warehouse spend" value={`$${number(spend.data[0].usd_mtd)}`} detail="Month to date" change="system.billing"/>].filter(Boolean);return <div className="pulse-shell">{cards.length>0&&<section className="kpi-grid">{cards}</section>}{(ai.error||latency.error||spend.error)&&<Alert><AlertDescription>Some observability metrics are omitted because their backing tables are unavailable or not granted. No values are fabricated.</AlertDescription></Alert>}<Panel title="Data freshness by Gold table" subtitle="Real information_schema last_altered values; SLA is four hours">{fresh.loading?<Skeleton className="h-48"/>:fresh.error?<ErrorBox message={fresh.error}/>:!fresh.data?.length?<Empty><EmptyHeader><EmptyTitle>No Gold tables found</EmptyTitle><EmptyDescription>Verify catalog permissions and schema configuration.</EmptyDescription></EmptyHeader></Empty>:<div className="table-wrap"><table><thead><tr><th>Table</th><th>Last altered</th><th>Status</th></tr></thead><tbody>{fresh.data.map(r=><tr key={String(r.table_name)}><td>{String(r.table_name)}</td><td>{String(r.last_altered)}</td><td><Badge variant={r.status==='Fresh'?'secondary':'destructive'}>{String(r.status)}</Badge></td></tr>)}</tbody></table></div>}</Panel></div>}
function SettingsPage(){const [saved,setSaved]=useState('');async function persist(){let tone='tonal';try{tone=localStorage.getItem('pulse-tone')||tone}catch{}const r=await fetch('/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tone,landingPage:'/',defaultFilters:{region:'All',period:'All',risk:'All'}})});setSaved(r.ok?'Saved for your account':'Unable to save settings')}return <div className="pulse-shell"><Panel title="Appearance" subtitle="Tonal teal, Warm neutral, or Dark"><p className="settings-copy">Use the tone selector in the top bar, then persist the choice to governed per-user settings.</p><button onClick={persist}>Save preferences</button>{saved&&<p>{saved}</p>}</Panel><Panel title="About and governance" subtitle="Runtime configuration"><dl className="about-grid"><dt>Catalog and schema</dt><dd>finserv.energy_pulse</dd><dt>App state</dt><dd>finserv.pulse_app</dd><dt>Execution identity</dt><dd>App service principal unless user authorization scopes are enabled</dd><dt>AppKit</dt><dd>0.81.0</dd></dl></Panel></div>}

const money = (value: unknown) => `$${(Number(value || 0) / 1_000_000).toFixed(1)}M`;
const number = (value: unknown) => Number(value || 0).toLocaleString();

function ExecutivePage() {
  const [region, setRegion] = useState('All');
  const [period, setPeriod] = useState('All');
  const [risk, setRisk] = useState('All');
  const filters = {region, period, risk};
  const summary = usePulseQuery('executive_summary', filters);
  const regions = usePulseQuery('regional_impact', filters);
  const risks = usePulseQuery('feeder_risk', filters);
  const causes = usePulseQuery('outage_causes', filters);
  const reliabilityTrend = usePulseQuery('reliability_trend', filters);
  const kpiTrend = usePulseQuery('kpi_trend', filters);
  const kpi = summary.data?.[0];
  const topCause = causes.data?.[0];
  const totalCauseExposure = (causes.data || []).reduce((sum, row) => sum + Number(row.financial_impact_usd || 0), 0);
  const periodLabel = period === 'All' ? 'Aug 1–31, 2026' : period;
  const topRegion = regions.data?.[0];
  const totalRegionExposure = (regions.data || []).reduce((sum, row) => sum + Number(row.financial_impact_usd || 0), 0);
  const supporting = topRegion && kpi
    ? `${String(topRegion.service_region)} carries ${Math.round(Number(topRegion.financial_impact_usd) / Math.max(totalRegionExposure, 1) * 100)}% of exposure; reliability is ${Math.abs(Number(kpi.reliability_score) - 99).toFixed(1)} pts ${Number(kpi.reliability_score) < 99 ? 'below' : 'above'} the 99.0 target.`
    : 'Prioritized from governed Gold metrics for the leadership team.';
  const trendRows = [...(kpiTrend.data || [])].reverse();
  const headline = topCause
    ? `${String(topCause.cause)} drove ${money(topCause.financial_impact_usd)} (${Math.round(Number(topCause.financial_impact_usd) / Math.max(totalCauseExposure, 1) * 100)}%) of ${money(totalCauseExposure)} exposure.`
    : 'Loading today’s operating priorities…';

  return (
    <div className="pulse-shell">
      <section className="hero executive-hero">
        <div><p className="eyebrow">WHAT CHANGED THIS PERIOD</p><h2>{headline}</h2><p>{supporting}</p></div>
        <NavLink to={`/ask?q=${encodeURIComponent(`Why did ${String(topCause?.cause || 'the leading outage cause')} drive the most financial exposure, and what should leadership do next?`)}`} className="ask-button">Ask why <span>→</span></NavLink>
      </section>
      <section className="slicer-bar"><div className="slicer-title"><Filter size={16}/><span>Analyze</span></div><label>Region<select value={region} onChange={e=>setRegion(e.target.value)}><option>All</option><option>Central</option><option>North</option><option>South</option><option>West</option></select></label><label>Period<select value={period} onChange={e=>setPeriod(e.target.value)}><option>All</option><option>July heat wave</option><option>Latest 30 days</option></select></label><label>Asset risk<select value={risk} onChange={e=>setRisk(e.target.value)}><option>All</option><option>Critical</option><option>Moderate</option><option>Low</option></select></label><button onClick={()=>{setRegion('All');setPeriod('All');setRisk('All')}}><RotateCcw size={14}/> Reset</button><span className="freshness">Updated {String(kpi?.last_refreshed_at || 'just now')} ET</span><span className="active-filter">{region === 'All' && period === 'All' && risk === 'All' ? 'Enterprise view' : 'Filtered view'}</span></section>
      {summary.loading ? <Skeleton className="h-32 w-full" /> : summary.error ? <ErrorBox message={summary.error} /> :
        <section className="kpi-grid">
          <Kpi visualId="kpi_peak_demand" filters={filters} icon={<Gauge />} label="Peak feeder demand" value={`${number(kpi?.peak_demand_mw)} MW`} detail={`${periodLabel} · highest single-meter reading · updated ${String(kpi?.last_refreshed_at)}`} change={`${number(kpi?.avg_utilization_pct)}% utilization · under 90% cap`} trend={trendRows.map(r=>Number(r.peak_demand_mw))} askQuestion={`What is driving peak feeder demand in ${region === 'All' ? 'each region' : region}, and which assets are closest to their capacity limits?`}/>
          <Kpi visualId="kpi_reliability_index" filters={filters} icon={<Activity />} label="Reliability index" value={number(kpi?.reliability_score)} detail={`${periodLabel} · SAIDI-weighted · updated ${String(kpi?.last_refreshed_at)}`} change={`${Number(kpi?.reliability_score)>=99?'▲':'▼'} ${Math.abs(Number(kpi?.reliability_score)-99).toFixed(1)} vs 99.0 target`} tone={Number(kpi?.reliability_score) >= 99 ? 'good' : 'danger'} trend={trendRows.map(r=>Number(r.reliability_score))} target={99} askQuestion={`Why is the reliability index ${Number(kpi?.reliability_score) >= 99 ? 'trending the way it is' : 'below the 99.0 target'} in ${region === 'All' ? 'each region' : region}, and which outage causes are driving it?`}/>
          <Kpi visualId="kpi_customers_impacted" filters={filters} icon={<Users />} label="Customers impacted" value={number(kpi?.customers_affected)} detail={`${periodLabel} · ${number(kpi?.outage_count)} events · updated ${String(kpi?.last_refreshed_at)}`} change="Current filtered period" trend={trendRows.map(r=>Number(r.customers_affected))} askQuestion={`Which outage causes and regions are driving the most customer impact in ${region === 'All' ? 'each region' : region} for ${periodLabel}?`}/>
          <Kpi visualId="kpi_financial_exposure" filters={filters} icon={<WalletCards />} label="Financial exposure" value={money(kpi?.financial_impact_usd)} detail={`${periodLabel} · restoration + lost revenue · updated ${String(kpi?.last_refreshed_at)}`} change="Current filtered period" trend={trendRows.map(r=>Number(r.financial_impact_usd))} askQuestion={`Which outage causes and assets are driving the most financial exposure in ${region === 'All' ? 'each region' : region}, and what should leadership prioritize?`}/>
        </section>}

      <section className="content-grid">
        <Panel title={`${String(topRegion?.service_region || 'Top region')} carries the most exposure`} subtitle={`Financial exposure by region · ${periodLabel}`}>
          {regions.loading ? <Skeleton className="h-64 w-full" /> : regions.error ? <ErrorBox message={regions.error} /> :
            <div className="bar-list">{regions.data?.map((r) => { const max = Math.max(...(regions.data || []).map(x => Number(x.financial_impact_usd))); return <button className="bar-row drill" onClick={()=>setRegion(String(r.service_region))} key={String(r.service_region)}><div className="bar-label"><strong>{String(r.service_region)}</strong><span>{money(r.financial_impact_usd)}</span></div><div className="track"><span style={{width: `${Math.max(8, Number(r.financial_impact_usd) / max * 100)}%`}} /></div><small>{number(r.customers_affected)} customers · reliability {number(r.reliability_score)} <span aria-hidden="true">›</span></small></button>})}</div>}
        </Panel>
        <Panel title="Why outages happened" subtitle="Root causes by economic impact">
          {causes.loading ? <Skeleton className="h-64 w-full" /> : causes.error ? <ErrorBox message={causes.error} /> :
            <div className="cause-list">{causes.data?.map((r, i) => { const share = Number(r.financial_impact_usd) / Math.max(totalCauseExposure, 1) * 100; return <NavLink to={`/ask?q=${encodeURIComponent(`Why did ${String(r.cause)} outages happen in ${region === 'All' ? 'each region' : region}, and what should leadership do next?`)}`} className="cause-row drill" key={String(r.cause)}><span className={`rank rank-${i + 1}`}>{i + 1}</span><div><strong>{String(r.cause)}</strong><div className="cause-track"><span style={{width:`${share}%`}}/></div><small>{number(r.outage_count)} events · {share.toFixed(1)}% of exposure</small></div><b>{money(r.financial_impact_usd)} ›</b></NavLink>})}</div>}
        </Panel>
      </section>

      <section className="content-grid lower-grid"><Panel title="Reliability trend against the 99.0 target" subtitle="Query-backed daily reliability · dashed target = 99.0">
        {reliabilityTrend.loading?<Skeleton className="h-64"/>:reliabilityTrend.error?<ErrorBox message={reliabilityTrend.error}/>:!reliabilityTrend.data?.length?<Empty><EmptyHeader><EmptyTitle>No reliability history</EmptyTitle><EmptyDescription>Change the period or region filter.</EmptyDescription></EmptyHeader></Empty>:<LineChart data={reliabilityTrend.data} xKey="metric_date" yKey="reliability_score" height={260} showSymbol={false}/>}
      </Panel>

      <Panel title="Assets requiring executive action" subtitle="UC-governed risk model ranked by composite risk score">
        {risks.loading ? <Skeleton className="h-72 w-full" /> : risks.error ? <ErrorBox message={risks.error} /> :
          <div className="table-wrap"><table><thead><tr><th>Asset</th><th>Region</th><th>Risk tier</th><th>Peak load</th><th>Exposure</th><th>Recommended action</th></tr></thead><tbody>{risks.data?.map(r => <tr key={String(r.asset_id)}><td><strong>{String(r.asset_id)}</strong></td><td>{String(r.service_region)}</td><td><span className={`risk ${String(r.risk_band).toLowerCase()}`}>{String(r.risk_band)} · {number(r.risk_score)}</span></td><td>{number(r.peak_utilization_pct)}%</td><td>{money(r.financial_impact_usd)}</td><td>{String(r.recommended_action)}</td></tr>)}</tbody></table></div>}
      </Panel></section>
      <p className="provenance"><ShieldAlert size={14}/> Governed by Unity Catalog · finserv.energy_pulse · updated {String(kpi?.last_refreshed_at || 'just now')} ET from the medallion pipeline</p>
    </div>
  );
}

function AskPulsePage() {
  const [search] = useSearchParams();
  const samples = ['Create a bar chart comparing total financial impact by outage cause.', 'Show a line chart of daily peak demand and average temperature during the July heat wave.', 'Rank the 10 highest-risk assets and visualize risk score versus peak utilization.', 'Compare customer impact and reliability score across regions.', 'Why did overload outages happen, and what actions should leadership prioritize?'];
  const [question, setQuestion] = useState(search.get('q') || samples[0]);
  const [answer, setAnswer] = useState('');
  const [genieUrl, setGenieUrl] = useState('');
  const [result, setResult] = useState<GenieResult>();
  const [loading, setLoading] = useState(false);
  async function ask() { setLoading(true); setAnswer(''); setGenieUrl(''); setResult(undefined); try { const r = await fetch('/api/genie', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({question})}); const body = await r.json(); if (!r.ok) throw new Error(body.error || 'Genie request failed'); setAnswer(body.answer || 'Genie completed the analysis.'); setGenieUrl(body.genie_url || ''); setResult(body); } catch(e) { setAnswer(String(e)); } finally { setLoading(false); } }
  const started = loading || Boolean(answer || result);
  return <div className="pulse-shell ask-page">
    <section className="hero compact ask-hero"><p><strong>Ask Pulse AI</strong> · governed answers and editable visuals from plain English</p></section>
    <div className="genie-frame custom-chat">
      {!started && <div className="chat-welcome"><Bot size={34}/><h3>Your AI energy analyst</h3><p>Choose a demo question or ask your own.</p><div className="sample-grid">{samples.map(s=><button key={s} onClick={()=>setQuestion(s)}>{s}</button>)}</div></div>}
      {loading && <Skeleton className="h-28 w-full" />}
      {answer && <div className="answer"><strong>Pulse AI</strong><ReactMarkdown>{answer}</ReactMarkdown></div>}
      {result?.data && <GenieVisualization result={result} genieRef={result.conversation_id && result.message_id && result.attachment_id ? {conversationId: result.conversation_id, messageId: result.message_id, attachmentId: result.attachment_id} : undefined} />}
      {result && <Alert className="trust-note"><ShieldAlert size={16}/><AlertDescription>AI-generated analysis. Verify important decisions against the generated SQL. Queries currently run as the app service principal and remain subject to Unity Catalog controls.</AlertDescription></Alert>}
      {result?.question_id&&<div className="feedback"><span>Was this answer helpful?</span><button onClick={()=>fetch('/api/feedback',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({questionId:result.question_id,feedback:'up'})})}>👍</button><button onClick={()=>fetch('/api/feedback',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({questionId:result.question_id,feedback:'down'})})}>👎</button></div>}
      {result?.suggestions && result.suggestions.length > 0 && <div className="followups"><strong>Continue exploring</strong>{result.suggestions.map(s=><button key={s} onClick={()=>setQuestion(s)}>{s}</button>)}</div>}
      {genieUrl && <a className="genie-link" href={genieUrl} target="_blank" rel="noreferrer">Open conversation in Genie →</a>}
      <div className="prompt"><textarea value={question} onChange={e=>setQuestion(e.target.value)} rows={2}/><button onClick={ask} disabled={loading || !question.trim()}>{loading ? 'Analyzing…' : 'Ask Genie'}</button></div>
    </div>
  </div>;
}

type GenieRef = {conversationId: string; messageId: string; attachmentId: string};
type GenieResult = { question_id?:string; conversation_id?:string; message_id?:string; attachment_id?:string; question?: string; answer?: string; sql?: string; description?: string; chart_type?: string; data?: {columns: string[]; rows: unknown[][]}; suggestions?: string[] };

function GenieVisualization({result, genieRef, initial}: {result: GenieResult; genieRef?: GenieRef; initial?: {chart?:string; category?:string; measure?:string; descending?:boolean}}) {
  const columns = result.data?.columns || [];
  const rows = result.data?.rows || [];
  const numeric = columns.filter((_, i) => rows.some(r => r[i] !== null && !Number.isNaN(Number(r[i]))));
  const dateColumn = columns.find(c => /date|time|day/i.test(c));
  const regionColumn = columns.find(c => /region/i.test(c));
  const isTimeSeries = Boolean(dateColumn);
  const [chart, setChart] = useState(initial?.chart || (isTimeSeries ? 'line' : result.chart_type || 'bar'));
  const [category, setCategory] = useState(initial?.category || columns.find(c => !numeric.includes(c)) || columns[0] || '');
  const [measure, setMeasure] = useState(initial?.measure || numeric[0] || columns[1] || '');
  const [descending, setDescending] = useState(initial?.descending ?? true);
  const [editing, setEditing] = useState(false);
  const [showSql, setShowSql] = useState(false);
  const records = rows.map(row => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
  const findingTitle = (result.answer || result.description || 'Generated analysis').replace(/[*#_]/g, '').split(/[.!?]\s/)[0].slice(0, 150);
  const regions = regionColumn ? [...new Set(records.map(r => String(r[regionColumn])).filter(Boolean))] : [];
  const pivot = (metric: string) => {
    if (!dateColumn) return [];
    const byDate = new Map<string, Record<string, unknown>>();
    records.forEach(record => {
      const date = String(record[dateColumn]);
      const item = byDate.get(date) || {[dateColumn]: date};
      item[regionColumn ? `${metric} · ${String(record[regionColumn])}` : metric] = Number(record[metric] || 0);
      byDate.set(date, item);
    });
    return [...byDate.values()].sort((a,b) => String(a[dateColumn]).localeCompare(String(b[dateColumn])));
  };
  const demandMetric = numeric.find(c => /demand/i.test(c));
  const temperatureMetric = numeric.find(c => /temp/i.test(c));
  const seriesKeys = (metric: string) => regionColumn ? regions.map(region => `${metric} · ${region}`) : [metric];
  const sortedRecords = isTimeSeries ? records.sort((a,b)=>String(a[category]).localeCompare(String(b[category]))) : [...records].sort((a,b)=>descending ? Number(b[measure])-Number(a[measure]) : Number(a[measure])-Number(b[measure]));

  const dashboardFilters = {conversationId: genieRef?.conversationId, messageId: genieRef?.messageId, attachmentId: genieRef?.attachmentId, question: result.question, sql: result.sql, description: result.description, chart, category, measure, descending};
  return <section className="viz-card overflow-hidden"><div className="viz-head"><div><span className="viz-kicker"><BarChart3 size={15}/> GENIE VISUAL</span><h3>{findingTitle}</h3></div><div className="viz-actions">{genieRef && <PinVisual visualId={`genie_result:${genieRef.conversationId}:${genieRef.messageId}:${genieRef.attachmentId}`} title={findingTitle} filters={dashboardFilters} label="＋ Add to Dashboard"/>}<button onClick={()=>setShowSql(!showSql)}><Code2 size={15}/> SQL</button><button onClick={()=>setEditing(!editing)}><Pencil size={15}/> Edit visualization</button></div></div>
    {editing && <div className="viz-editor"><label>Chart<select value={chart} onChange={e=>setChart(e.target.value)}><option value="bar">Bar</option><option value="line">Line</option><option value="area">Area</option><option value="pie">Pie</option><option value="donut">Donut</option><option value="scatter">Scatter</option><option value="table">Table</option></select></label><label>Category<select value={category} onChange={e=>setCategory(e.target.value)}>{columns.map(c=><option key={c}>{c}</option>)}</select></label><label>Measure<select value={measure} onChange={e=>setMeasure(e.target.value)}>{numeric.map(c=><option key={c}>{c}</option>)}</select></label>{!isTimeSeries && <label>Sort<select value={descending?'desc':'asc'} onChange={e=>setDescending(e.target.value==='desc')}><option value="desc">High to low</option><option value="asc">Low to high</option></select></label>}</div>}
    {showSql && <pre className="sql-block">{result.sql}</pre>}
    {!rows.length ? <Empty><EmptyHeader><EmptyTitle>No chartable result</EmptyTitle><EmptyDescription>Refine the question or inspect the generated SQL.</EmptyDescription></EmptyHeader></Empty> : chart === 'table' ? <div className="table-wrap"><table><thead><tr>{columns.map(c=><th key={c}>{c.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j}>{String(v ?? '')}</td>)}</tr>)}</tbody></table></div> : isTimeSeries && demandMetric ? <div className="time-series-grid"><div><h4>Daily peak demand by service region</h4><LineChart data={pivot(demandMetric)} xKey={dateColumn} yKey={seriesKeys(demandMetric)} height={300} showLegend showSymbol={false} smooth={false} /></div>{temperatureMetric && <div><h4>Average temperature by service region</h4><LineChart data={pivot(temperatureMetric)} xKey={dateColumn} yKey={seriesKeys(temperatureMetric)} height={300} showLegend showSymbol={false} smooth={false} /></div>}</div> : chart === 'line' ? <LineChart data={sortedRecords} xKey={category} yKey={measure} height={340} showLegend /> : chart === 'area' ? <AreaChart data={sortedRecords} xKey={category} yKey={measure} height={340} showLegend /> : chart === 'pie' ? <PieChart data={sortedRecords} xKey={category} yKey={measure} height={340} showLegend /> : chart === 'donut' ? <DonutChart data={sortedRecords} xKey={category} yKey={measure} height={340} showLegend /> : chart === 'scatter' ? <ScatterChart data={sortedRecords} xKey={category} yKey={measure} height={340} showLegend /> : <BarChart data={sortedRecords} xKey={category} yKey={measure} height={340} showLegend orientation="vertical" />}
  </section>;
}

function SavedGenieVisual({item}: {item: ReportItem}) {
  let filters: Record<string, unknown> = {};
  try { filters = JSON.parse(item.filters_json || '{}'); } catch { /* ignore malformed saved filters */ }
  const [data, setData] = useState<{columns: string[]; rows: unknown[][]}>();
  const [error, setError] = useState('');
  const conversationId = String(filters.conversationId || '');
  const messageId = String(filters.messageId || '');
  const attachmentId = String(filters.attachmentId || '');
  useEffect(() => {
    setData(undefined); setError('');
    const params = new URLSearchParams({conversationId, messageId, attachmentId});
    fetch(`/api/genie/query-result?${params}`).then(r => r.ok ? r.json() : r.text().then(t => Promise.reject(new Error(t)))).then(setData).catch(e => setError(String(e)));
  }, [conversationId, messageId, attachmentId]);
  const title = item.title || 'Saved Genie visual';
  if (error) return <Panel title={title} subtitle="Live Genie result"><ErrorBox message={error} /></Panel>;
  if (!data) return <Panel title={title} subtitle="Live Genie result"><Skeleton className="h-40" /></Panel>;
  const result: GenieResult = {question: filters.question as string, sql: filters.sql as string, description: filters.description as string, data};
  return <GenieVisualization result={result} initial={{chart: filters.chart as string, category: filters.category as string, measure: filters.measure as string, descending: filters.descending as boolean}} />;
}

function Sparkline({values,target,danger=false}:{values:number[];target?:number;danger?:boolean}){if(values.length<2)return <div className="spark-placeholder"/>;const w=200,h=42;const all=target===undefined?values:[...values,target];const min=Math.min(...all),max=Math.max(...all);const x=(i:number)=>i*w/(values.length-1);const y=(v:number)=>h-5-(v-min)/Math.max(max-min,1)*(h-10);const points=values.map((v,i)=>`${x(i)},${y(v)}`).join(' ');return <svg className={`spark ${danger?'danger':''}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">{target!==undefined&&<line className="spark-target" x1="0" x2={w} y1={y(target)} y2={y(target)}/>}<polyline points={points}/><circle cx={x(values.length-1)} cy={y(values.at(-1)!)} r="3"/></svg>}
function Kpi({icon, label, value, detail, change, tone = 'neutral',visualId,filters,trend=[],target,askQuestion}: {icon: React.ReactNode; label: string; value: string; detail: string; change: string; tone?: string;visualId?:string;filters?:Record<string,string>;trend?:number[];target?:number;askQuestion?:string}) {
  return <article className={`kpi ${tone}`}><div className="kpi-actions">{askQuestion&&<NavLink className="ask-genie-button" to={`/ask?q=${encodeURIComponent(askQuestion)}`} title="Ask Genie about this KPI"><Bot size={13}/></NavLink>}{visualId&&<PinVisual visualId={visualId} title={label} filters={filters||{}}/>}</div><div className="kpi-icon">{icon}</div><p>{label}</p><strong className="whitespace-nowrap">{value}</strong><Badge variant="outline" className="kpi-change">{change}</Badge><Sparkline values={trend} target={target} danger={tone==='danger'}/><small>{detail}</small></article>;
}

function PinVisual({visualId,title,filters,label='＋ Add'}:{visualId:string;title:string;filters:Record<string,unknown>;label?:string}){const [reports,setReports]=useState<Report[]>();const [open,setOpen]=useState(false);const [added,setAdded]=useState(false);useEffect(()=>{if(open&&!reports)fetch('/api/reports').then(r=>r.ok?r.json():[]).then(setReports)},[open,reports]);async function add(id:string){await fetch(`/api/reports/${id}/items`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({visualId,title,filters})});setOpen(false);setAdded(true)}return <div className="pin-wrap"><button className="pin-button" onClick={()=>setOpen(!open)}>{added?'✓ Added':label}</button>{open&&<div className="pin-menu">{reports?.length?reports.map(r=><button key={r.report_id} onClick={()=>add(r.report_id)}>{r.name}</button>):<NavLink to="/reports">Create a report first</NavLink>}</div>}</div>}

function Panel({title, subtitle, children}: {title: string; subtitle: string; children: React.ReactNode}) {
  return <section className="panel"><div className="panel-head"><div><h3>{title}</h3><p>{subtitle}</p></div></div>{children}</section>;
}

function ErrorBox({message}: {message: string}) { return <div className="error-box">Unable to load governed data: {message}</div>; }
