import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ClipboardCheck, Download, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, downloadFile } from '../lib/api.js';
import { EmptyState, Loading, StatusBadge } from '../components/UI.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function TestsPage({ reviewQueue = false }) {
  const [tests, setTests] = useState(null); const [query, setQuery] = useState(''); const [filter, setFilter] = useState(reviewQueue ? 'Submitted' : 'All'); const [error, setError] = useState('');
  const navigate = useNavigate(); const { user } = useAuth(); const canTest = ['TESTER', 'ADMIN'].includes(user.role);
  useEffect(() => { api(`/api/tests${reviewQueue ? '?queue=review' : ''}`).then((result) => setTests(result.tests)).catch((reason) => setError(reason.message)); }, [reviewQueue]);
  const filtered = useMemo(() => (tests || []).filter((test) => {
    const matches = `${test.certificateNumber} ${test.instrument?.model} ${test.instrument?.serialNumber} ${test.inspectorName}`.toLowerCase().includes(query.toLowerCase());
    return matches && (filter === 'All' || test.status === filter);
  }), [tests, query, filter]);
  if (!tests) return <Loading label={error || 'Loading controlled test records...'} />;

  return <>
    <div className="page-actions"><div className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search report, application, instrument or tester" /></div>{canTest && <button className="button primary" onClick={() => navigate('/tests/new')}><Plus size={18} /> Start type evaluation</button>}</div>
    <section className="panel reports-panel">
      <div className="panel-heading reports-heading"><div><span className="eyebrow">{reviewQueue ? 'Independent approval control' : 'Immutable digital repository'}</span><h3>{reviewQueue ? 'Type evaluations waiting for review' : 'All controlled type-evaluation records'}</h3></div>{!reviewQueue && <div className="segmented">{['All', 'Draft', 'Submitted', 'Approved', 'Returned', 'Revoked'].map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>}</div>
      {filtered.length ? <div className="table-scroll"><table><thead><tr><th>Record</th><th>Instrument</th><th>Tester</th><th>Last action</th><th>Technical result</th><th>Workflow</th><th /></tr></thead><tbody>{filtered.map((test) => <tr key={test.id}><td><strong>{test.certificateNumber}</strong><small>Revision {test.revision} · rules v{test.evaluation?.ruleVersion}</small></td><td><span className="table-primary">{test.instrument?.model}</span><small>{test.instrument?.serialNumber}</small></td><td>{test.inspectorName}<small>{test.inspectorId}</small></td><td>{new Date(test.updatedAt || test.approvedAt || test.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td><td><StatusBadge status={test.evaluation?.status} /></td><td><StatusBadge status={test.integrityFailure ? 'INTEGRITY FAILURE' : test.status} /></td><td><div className="row-actions">{['Approved', 'Revoked'].includes(test.status) && test.coverageMode !== 'LEGACY_PARTIAL' && !test.integrityFailure && <button title="Download issued PDF" onClick={() => downloadFile(`/api/tests/${test.id}/report.pdf`, `${test.certificateNumber}.pdf`)}><Download size={17} /></button>}<button title="Open record" onClick={() => navigate(`/tests/${test.id}`)}><ArrowRight size={17} /></button></div></td></tr>)}</tbody></table></div> : <EmptyState icon={ClipboardCheck} title={reviewQueue ? 'Review queue is clear' : 'No matching records'}>{reviewQueue ? 'There are no submitted tests waiting for independent approval.' : 'Change the search or workflow filter.'}</EmptyState>}
    </section>
  </>;
}
