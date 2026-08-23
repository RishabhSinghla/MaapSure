import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Gauge, Plus, Sparkles, TrendingUp } from 'lucide-react';
import { api } from '../lib/api.js';
import { Loading, StatusBadge } from '../components/UI.jsx';
import { REPORT_SECTIONS, REQUIREMENT_FAMILIES } from '../../shared/r76Catalog.js';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => { api('/api/dashboard').then(setData).catch((reason) => setError(reason.message)); }, []);
  if (!data) return <Loading label={error || 'Preparing your laboratory overview...'} />;

  const stats = [
    { label: 'Approved reports', value: data.stats.totalTests, note: 'Locked records', icon: CheckCircle2, tone: 'green' },
    { label: 'Pass rate', value: `${data.stats.passRate}%`, note: 'Approved reports', icon: TrendingUp, tone: 'blue' },
    { label: 'Active instruments', value: data.stats.activeInstruments, note: 'Registered', icon: Gauge, tone: 'amber' },
    { label: 'Waiting for review', value: data.stats.pendingReview, note: 'Independent approval', icon: Clock3, tone: 'violet' },
  ];

  return (
    <div className="dashboard-grid">
      {data.stats.integrityFailures > 0 && <div className="warning-banner dashboard-integrity-warning"><AlertTriangle /><span><strong>{data.stats.integrityFailures} issued record consistency failure(s).</strong> Exports and public reliance are blocked until an administrator restores the controlled record.</span></div>}
      <section className="hero-card">
        <div>
          <span className="eyebrow light"><Sparkles size={15} /> Guided model approval / type evaluation</span>
          <h2>Turn a complete type dossier into a governed report.</h2>
          <p>MaapSure plans applicability, calculates corrected errors, blocks missing work and preserves the independent approval record.</p>
          <button className="button light" onClick={() => navigate('/tests/new')}><Plus size={18} /> Start an evaluation</button>
        </div>
        <div className="hero-visual">
          <div className="scale-display"><span>15.008</span><small>kg</small></div>
          <div className="limit-line"><i /><span>Allowed: +/- 0.010 kg</span></div>
          <div className="hero-result"><CheckCircle2 /><span><strong>Within limit</strong><small>OIML R 76, Table 6</small></span></div>
        </div>
      </section>

      <section className="stats-grid">
        {stats.map((stat) => <article className="stat-card" key={stat.label}><span className={`stat-icon ${stat.tone}`}><stat.icon /></span><div><small>{stat.label}</small><strong>{stat.value}</strong><em>{stat.note}</em></div></article>)}
      </section>

      <section className="panel chart-panel">
        <div className="panel-heading"><div><span className="eyebrow">Laboratory performance</span><h3>Tests completed</h3></div><span className="period-pill">Last 6 months</span></div>
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.monthly} margin={{ top: 10, right: 8, left: -25, bottom: 0 }}><defs><linearGradient id="testsGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2b7f62" stopOpacity={0.25} /><stop offset="100%" stopColor="#2b7f62" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#e8eeea" vertical={false} /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#7a8780', fontSize: 12 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#7a8780', fontSize: 12 }} /><Tooltip contentStyle={{ border: '1px solid #dce5df', borderRadius: 10, boxShadow: '0 10px 30px rgba(26,49,38,.08)' }} /><Area type="monotone" dataKey="tests" stroke="#2b7f62" strokeWidth={2.5} fill="url(#testsGradient)" /></AreaChart></ResponsiveContainer></div>
      </section>

      <section className="panel standards-panel">
        <div className="panel-heading"><div><span className="eyebrow">Live rule engine</span><h3>What MaapSure checks</h3></div></div>
        <div className="rules-list">
          {[
            ['3.5.1 / Table 6', 'Corrected error at every load'], ['3.9.2.3', 'Temperature effect at zero'], ['3.9.4.1', 'Creep over time'], ['3.9.3', 'Supply-voltage influence'],
            ['R 76-2 sections 1-17', `${REPORT_SECTIONS.length} separately recorded digital branches`], ['R 76-1 requirements', `${REQUIREMENT_FAMILIES.length} governed requirement families`],
          ].map(([clause, label]) => <div key={clause}><CheckCircle2 /><span><strong>{label}</strong><small>OIML {clause}</small></span></div>)}
        </div>
      </section>

      <section className="panel recent-panel">
        <div className="panel-heading"><div><span className="eyebrow">Latest activity</span><h3>Recent test reports</h3></div><button className="text-button" onClick={() => navigate('/tests')}>View all <ArrowRight size={16} /></button></div>
        <div className="table-scroll"><table><thead><tr><th>Certificate</th><th>Instrument</th><th>Inspector</th><th>Date</th><th>Result</th><th /></tr></thead><tbody>{data.recent.map((test) => <tr key={test.id}><td><strong>{test.certificateNumber}</strong></td><td><span className="table-primary">{test.instrument?.model}</span><small>{test.instrument?.serialNumber}</small></td><td>{test.inspectorName}</td><td>{new Date(test.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td><td><StatusBadge status={test.evaluation?.status || test.status} /></td><td><button className="row-action" onClick={() => navigate(`/tests/${test.id}`)}><ArrowRight size={17} /></button></td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}
