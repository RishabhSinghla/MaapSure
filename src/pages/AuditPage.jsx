import { useEffect, useState } from 'react';
import { Fingerprint, Link2, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { ErrorNotice, Loading, StatusBadge } from '../components/UI.jsx';

export default function AuditPage() {
  const [data, setData] = useState(null); const [error, setError] = useState('');
  useEffect(() => { api('/api/audit').then(setData).catch((reason) => setError(reason.message)); }, []);
  if (!data) return <Loading label={error || 'Verifying the audit ledger...'} />;
  return <><ErrorNotice>{error}</ErrorNotice><section className={`panel audit-integrity ${data.integrity.valid ? 'valid' : 'invalid'}`}><span><ShieldCheck /></span><div><small>Chained audit consistency</small><h2>{data.integrity.valid ? 'Every stored audit link matches' : 'Consistency failure detected'}</h2><p>{data.integrity.checked} recorded event(s) checked from genesis to the current ledger head. Production should externally anchor this head in WORM storage or an HSM-backed signing service.</p></div><code>{data.integrity.headHash || data.integrity.brokenAt}</code></section>
    <section className="panel reports-panel"><div className="panel-heading"><div><span className="eyebrow"><Link2 size={14} /> SHA-256 chained history</span><h3>Recorded activity trail</h3></div><StatusBadge status={data.integrity.valid ? 'Consistent' : 'Broken'} /></div><div className="table-scroll"><table><thead><tr><th>Sequence</th><th>Action</th><th>Actor</th><th>Target</th><th>Time</th><th>Fingerprint</th></tr></thead><tbody>{data.events.map((event) => <tr key={event.id}><td>#{event.sequence}</td><td><strong>{event.action}</strong></td><td>{event.actor.name}<small>{event.actor.role}</small></td><td>{event.targetType}<small>{event.targetId || '-'}</small></td><td>{new Date(event.at).toLocaleString('en-IN')}</td><td><span className="fingerprint"><Fingerprint size={13} /> {event.hash.slice(0, 14)}...</span></td></tr>)}</tbody></table></div></section></>;
}
