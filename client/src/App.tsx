import { createBrowserRouter, RouterProvider, NavLink, Outlet, useSearchParams } from 'react-router';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Alert,
  AlertDescription,
  Badge,
  BarChart,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  LineChart,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Skeleton,
  useIsMobile,
} from '@databricks/appkit-ui/react';
import { Activity, BarChart3, Bot, Code2, Filter, Gauge, Menu, Pencil, RotateCcw, ShieldAlert, Users, WalletCards, Zap } from 'lucide-react';

type QueryResult = Record<string, unknown>;
function usePulseQuery(key: string, filters: Record<string, string> = {}) {
  const [data, setData] = useState<QueryResult[]>();
  const [error, setError] = useState('');
  const query = new URLSearchParams(filters).toString();
  useEffect(() => { setData(undefined); setError(''); fetch(`/api/query/${key}?${query}`).then(r => r.ok ? r.json() : r.text().then(Promise.reject.bind(Promise))).then(setData).catch(e => setError(String(e))); }, [key, query]);
  return { data, error, loading: !data && !error };
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? 'bg-primary text-primary-foreground'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`;

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? 'bg-primary text-primary-foreground'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`;

type NavLinkClassFn = (props: { isActive: boolean }) => string;

function NavLinks({ className, linkClass, onClick }: { className?: string; linkClass: NavLinkClassFn; onClick?: () => void }) {
  return (
    <nav className={className}>
      <NavLink to="/" end className={linkClass} onClick={onClick}>
        Executive pulse
      </NavLink>
      <NavLink to="/ask" className={linkClass} onClick={onClick}>
        Ask Pulse AI
      </NavLink>
    </nav>
  );
}

function Layout() {
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const identity = usePulseQuery('identity');
  const user = identity.data?.[0];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="pulse-header px-4 md:px-8 py-3 flex items-center gap-5">
        <div className="brand-mark"><Zap size={18} fill="currentColor" /></div>
        <div><h1 className="text-lg font-semibold">Pulse</h1><p className="brand-sub">Executive Energy Intelligence</p></div>
        {/* Desktop nav — hidden below md breakpoint */}
        <NavLinks className="hidden md:flex gap-1" linkClass={navLinkClass} />
        {/* Mobile nav — visible below md breakpoint */}
        <div className="ml-auto hidden md:flex items-center gap-2">
          <Badge variant="secondary">{String(user?.display_name || user?.email || 'Signed-in user')}</Badge>
          <span className="auth-note">Signed in · governed app access</span>
        </div>
        <div className="ml-auto md:hidden">
          {/* Gate on isMobile so the portaled sheet can't linger on desktop
              (replaces a set-state-in-effect reset). */}
          <Sheet open={mobileNavOpen && isMobile} onOpenChange={setMobileNavOpen}>
            <Button variant="ghost" size="icon" onClick={() => setMobileNavOpen(true)}>
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open navigation</span>
            </Button>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <NavLinks className="flex flex-col gap-1" linkClass={mobileNavLinkClass} onClick={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <ExecutivePage /> },
      { path: '/ask', element: <AskPulsePage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}

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
  const kpi = summary.data?.[0];
  const topCause = causes.data?.[0];
  const totalCauseExposure = (causes.data || []).reduce((sum, row) => sum + Number(row.financial_impact_usd || 0), 0);
  const periodLabel = period === 'All' ? 'Aug 1–30, 2026' : period;
  const headline = topCause
    ? `${String(topCause.cause)} drove ${money(topCause.financial_impact_usd)} (${Math.round(Number(topCause.financial_impact_usd) / Math.max(totalCauseExposure, 1) * 100)}%) of ${money(totalCauseExposure)} exposure.`
    : 'Loading today’s operating priorities…';

  return (
    <div className="pulse-shell">
      <section className="hero executive-hero">
        <div><p className="eyebrow">LIVE OPERATING VIEW</p><h2>{headline}</h2><p>Prioritized from governed Gold metrics for the leadership team.</p></div>
        <NavLink to="/ask" className="ask-button"><Bot size={18} /> Ask Pulse AI</NavLink>
      </section>
      <section className="slicer-bar"><div className="slicer-title"><Filter size={16}/><span>Analyze</span></div><label>Region<select value={region} onChange={e=>setRegion(e.target.value)}><option>All</option><option>Central</option><option>North</option><option>South</option><option>West</option></select></label><label>Period<select value={period} onChange={e=>setPeriod(e.target.value)}><option>All</option><option>July heat wave</option><option>Latest 30 days</option></select></label><label>Asset risk<select value={risk} onChange={e=>setRisk(e.target.value)}><option>All</option><option>Critical</option><option>Moderate</option><option>Low</option></select></label><button onClick={()=>{setRegion('All');setPeriod('All');setRisk('All')}}><RotateCcw size={14}/> Reset</button><span className="freshness">Updated {String(kpi?.last_refreshed_at || 'just now')} ET</span><span className="active-filter">{region === 'All' && period === 'All' && risk === 'All' ? 'Enterprise view' : 'Filtered view'}</span></section>
      {summary.loading ? <Skeleton className="h-32 w-full" /> : summary.error ? <ErrorBox message={summary.error} /> :
        <section className="kpi-grid">
          <Kpi icon={<Gauge />} label="Peak demand" value={`${number(kpi?.peak_demand_mw)} MW`} detail={`${periodLabel} · ${number(kpi?.avg_utilization_pct)}% utilization`} change="vs 90% operating target" />
          <Kpi icon={<Activity />} label="Reliability index" value={number(kpi?.reliability_score)} detail={`${periodLabel} · target ≥ 99.0`} change="SAIDI-weighted score" tone={Number(kpi?.reliability_score) >= 99 ? 'good' : 'warn'} />
          <Kpi icon={<Users />} label="Customers impacted" value={number(kpi?.customers_affected)} detail={`${periodLabel} · ${number(kpi?.outage_count)} events`} change="Lower is better" tone="warn" />
          <Kpi icon={<WalletCards />} label="Financial exposure" value={money(kpi?.financial_impact_usd)} detail={`${periodLabel} · restoration + lost revenue`} change="Compared with operating plan" />
        </section>}

      <section className="content-grid">
        <Panel title="Regional business impact" subtitle="Ranked by total financial exposure">
          {regions.loading ? <Skeleton className="h-64 w-full" /> : regions.error ? <ErrorBox message={regions.error} /> :
            <div className="bar-list">{regions.data?.map((r) => { const max = Math.max(...(regions.data || []).map(x => Number(x.financial_impact_usd))); return <button className="bar-row drill" onClick={()=>setRegion(String(r.service_region))} key={String(r.service_region)}><div className="bar-label"><strong>{String(r.service_region)}</strong><span>{money(r.financial_impact_usd)}</span></div><div className="track"><span style={{width: `${Math.max(8, Number(r.financial_impact_usd) / max * 100)}%`}} /></div><small>{number(r.customers_affected)} customers · reliability {number(r.reliability_score)} <span aria-hidden="true">›</span></small></button>})}</div>}
        </Panel>
        <Panel title="Why outages happened" subtitle="Root causes by economic impact">
          {causes.loading ? <Skeleton className="h-64 w-full" /> : causes.error ? <ErrorBox message={causes.error} /> :
            <div className="cause-list">{causes.data?.map((r, i) => { const share = Number(r.financial_impact_usd) / Math.max(totalCauseExposure, 1) * 100; return <NavLink to={`/ask?q=${encodeURIComponent(`Why did ${String(r.cause)} outages happen in ${region === 'All' ? 'each region' : region}, and what should leadership do next?`)}`} className="cause-row drill" key={String(r.cause)}><span className={`rank rank-${i + 1}`}>{i + 1}</span><div><strong>{String(r.cause)}</strong><div className="cause-track"><span style={{width:`${share}%`}}/></div><small>{number(r.outage_count)} events · {share.toFixed(1)}% of exposure</small></div><b>{money(r.financial_impact_usd)} ›</b></NavLink>})}</div>}
        </Panel>
      </section>

      <Panel title="Assets requiring executive action" subtitle="UC-governed risk model ranked by composite risk score">
        {risks.loading ? <Skeleton className="h-72 w-full" /> : risks.error ? <ErrorBox message={risks.error} /> :
          <div className="table-wrap"><table><thead><tr><th>Asset</th><th>Region</th><th>Risk</th><th>Peak load</th><th>Exposure</th><th>Recommended action</th></tr></thead><tbody>{risks.data?.map(r => <tr key={String(r.asset_id)}><td><strong>{String(r.asset_id)}</strong><small>{String(r.criticality)} criticality</small></td><td>{String(r.service_region)}</td><td><span className={`risk ${String(r.risk_band).toLowerCase()}`}>{String(r.risk_band)} · {number(r.risk_score)}</span></td><td>{number(r.peak_utilization_pct)}%</td><td>{money(r.financial_impact_usd)}</td><td>{String(r.recommended_action)}</td></tr>)}</tbody></table></div>}
      </Panel>
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
      {result?.data && <GenieVisualization result={result} />}
      {result && <Alert className="trust-note"><ShieldAlert size={16}/><AlertDescription>AI-generated analysis. Verify important decisions against the generated SQL. Query executed with the signed-in user's scoped Genie and SQL permissions and remains subject to Unity Catalog controls.</AlertDescription></Alert>}
      {result?.suggestions && result.suggestions.length > 0 && <div className="followups"><strong>Continue exploring</strong>{result.suggestions.map(s=><button key={s} onClick={()=>setQuestion(s)}>{s}</button>)}</div>}
      {genieUrl && <a className="genie-link" href={genieUrl} target="_blank" rel="noreferrer">Open conversation in Genie →</a>}
      <div className="prompt"><textarea value={question} onChange={e=>setQuestion(e.target.value)} rows={2}/><button onClick={ask} disabled={loading || !question.trim()}>{loading ? 'Analyzing…' : 'Ask Genie'}</button></div>
    </div>
  </div>;
}

type GenieResult = { question?: string; answer?: string; sql?: string; description?: string; chart_type?: string; data?: {columns: string[]; rows: unknown[][]}; suggestions?: string[] };

function GenieVisualization({result}: {result: GenieResult}) {
  const columns = result.data?.columns || [];
  const rows = result.data?.rows || [];
  const numeric = columns.filter((_, i) => rows.some(r => r[i] !== null && !Number.isNaN(Number(r[i]))));
  const dateColumn = columns.find(c => /date|time|day/i.test(c));
  const regionColumn = columns.find(c => /region/i.test(c));
  const isTimeSeries = Boolean(dateColumn);
  const [chart, setChart] = useState(isTimeSeries ? 'line' : result.chart_type || 'bar');
  const [category, setCategory] = useState(columns.find(c => !numeric.includes(c)) || columns[0] || '');
  const [measure, setMeasure] = useState(numeric[0] || columns[1] || '');
  const [descending, setDescending] = useState(true);
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

  return <section className="viz-card overflow-hidden"><div className="viz-head"><div><span className="viz-kicker"><BarChart3 size={15}/> GENIE VISUAL</span><h3>{findingTitle}</h3></div><div className="viz-actions"><button onClick={()=>setShowSql(!showSql)}><Code2 size={15}/> SQL</button><button onClick={()=>setEditing(!editing)}><Pencil size={15}/> Edit visualization</button></div></div>
    {editing && <div className="viz-editor"><label>Chart<select value={chart} onChange={e=>setChart(e.target.value)}><option value="bar">Bar</option><option value="line">Line</option><option value="table">Table</option></select></label><label>Category<select value={category} onChange={e=>setCategory(e.target.value)}>{columns.map(c=><option key={c}>{c}</option>)}</select></label><label>Measure<select value={measure} onChange={e=>setMeasure(e.target.value)}>{numeric.map(c=><option key={c}>{c}</option>)}</select></label>{!isTimeSeries && <label>Sort<select value={descending?'desc':'asc'} onChange={e=>setDescending(e.target.value==='desc')}><option value="desc">High to low</option><option value="asc">Low to high</option></select></label>}</div>}
    {showSql && <pre className="sql-block">{result.sql}</pre>}
    {!rows.length ? <Empty><EmptyHeader><EmptyTitle>No chartable result</EmptyTitle><EmptyDescription>Refine the question or inspect the generated SQL.</EmptyDescription></EmptyHeader></Empty> : chart === 'table' ? <div className="table-wrap"><table><thead><tr>{columns.map(c=><th key={c}>{c.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j}>{String(v ?? '')}</td>)}</tr>)}</tbody></table></div> : isTimeSeries && demandMetric ? <div className="time-series-grid"><div><h4>Daily peak demand by service region</h4><LineChart data={pivot(demandMetric)} xKey={dateColumn} yKey={seriesKeys(demandMetric)} height={300} showLegend showSymbol={false} smooth={false} /></div>{temperatureMetric && <div><h4>Average temperature by service region</h4><LineChart data={pivot(temperatureMetric)} xKey={dateColumn} yKey={seriesKeys(temperatureMetric)} height={300} showLegend showSymbol={false} smooth={false} /></div>}</div> : chart === 'line' ? <LineChart data={sortedRecords} xKey={category} yKey={measure} height={340} showLegend /> : <BarChart data={sortedRecords} xKey={category} yKey={measure} height={340} showLegend orientation="vertical" />}
  </section>;
}

function Kpi({icon, label, value, detail, change, tone = 'neutral'}: {icon: React.ReactNode; label: string; value: string; detail: string; change: string; tone?: string}) {
  return <article className={`kpi ${tone}`}><div className="kpi-icon">{icon}</div><p>{label}</p><strong className="whitespace-nowrap">{value}</strong><small>{detail}</small><Badge variant="outline" className="kpi-change">{change}</Badge></article>;
}

function Panel({title, subtitle, children}: {title: string; subtitle: string; children: React.ReactNode}) {
  return <section className="panel"><div className="panel-head"><div><h3>{title}</h3><p>{subtitle}</p></div></div>{children}</section>;
}

function ErrorBox({message}: {message: string}) { return <div className="error-box">Unable to load governed data: {message}</div>; }
