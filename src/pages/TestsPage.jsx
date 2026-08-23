import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ClipboardCheck, Download, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, downloadFile } from '../lib/api.js';
import { EmptyState, Loading, StatusBadge } from '../components/UI.jsx';

export default function TestsPage() {
  const [tests, setTests] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  useEffect(() => { api('/api/tests').then((result) => setTests(result.tests)).catch((reason) => setError(reason.message)); }, []);
  const filtered = useMemo(() => (tests || []).filter((test) => {
    const matchesQuery = `${test.certificateNumber} ${test.instrument?.model} ${test.instrument?.serialNumber} ${test.inspectorName}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (filter === 'All' || test.evaluation?.status === filter);
  }), [tests, query, filter]);
  if (!tests) return <Loading label={error || 'Loading test reports...'} />;

  return (
    <>
      <div className="page-actions"><div className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search certificate, instrument or inspector" /></div><button className="button primary" onClick={() => navigate('/tests/new')}><Plus size={18} /> Start a new test</button></div>
      <section className="panel reports-panel">
        <div className="panel-heading reports-heading"><div><span className="eyebrow">Digital repository</span><h3>All test reports</h3></div><div className="segmented">{['All', 'PASS', 'FAIL'].map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
        {filtered.length ? <div className="table-scroll"><table><thead><tr><th>Certificate</th><th>Instrument</th><th>Tested by</th><th>Finalized</th><th>Risk</th><th>Result</th><th /></tr></thead><tbody>{filtered.map((test) => <tr key={test.id}><td><strong>{test.certificateNumber}</strong><small>{test.verificationCode}</small></td><td><span className="table-primary">{test.instrument?.model}</span><small>{test.instrument?.serialNumber}</small></td><td>{test.inspectorName}<small>{test.inspectorId}</small></td><td>{new Date(test.finalizedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td><td><span className={`risk-text ${test.evaluation?.diagnostic?.risk?.toLowerCase()}`}>{test.evaluation?.diagnostic?.risk}</span></td><td><StatusBadge status={test.evaluation?.status} /></td><td><div className="row-actions"><button title="Download report" onClick={() => downloadFile(`/api/tests/${test.id}/report.pdf`, `${test.certificateNumber}.pdf`)}><Download size={17} /></button><button title="Open test" onClick={() => navigate(`/tests/${test.id}`)}><ArrowRight size={17} /></button></div></td></tr>)}</tbody></table></div> : <EmptyState icon={ClipboardCheck} title="No matching test reports">Change the search or result filter.</EmptyState>}
      </section>
    </>
  );
}
