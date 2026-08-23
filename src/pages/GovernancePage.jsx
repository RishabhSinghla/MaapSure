import { useEffect, useState } from 'react';
import { DatabaseBackup, FileKey2, LockKeyhole, Plus, ShieldCheck, Users } from 'lucide-react';
import { api, downloadFile } from '../lib/api.js';
import { ErrorNotice, Loading, StatusBadge } from '../components/UI.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function GovernancePage() {
  const { user } = useAuth(); const [data, setData] = useState(null); const [users, setUsers] = useState([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', reason: '', source: '' });
  const load = async () => { const rules = await api('/api/rules'); setData(rules); if (user.role === 'ADMIN') setUsers((await api('/api/admin/users')).users); };
  useEffect(() => { load().catch((reason) => setError(reason.message)); }, []);
  async function propose(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('/api/rules/change-requests', { method: 'POST', body: JSON.stringify(form) }); setForm({ title: '', reason: '', source: '' }); await load(); }
    catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }
  if (!data) return <Loading label={error || 'Loading governance controls...'} />;
  const active = data.profiles.find((item) => item.id === data.activeRuleProfileId);
  return <div className="governance-grid"><ErrorNotice>{error}</ErrorNotice>
    <section className="panel governance-hero"><div><span className="eyebrow"><ShieldCheck size={15} /> Published rules profile</span><h2>{active.name}</h2><p>{active.standard} · report format {active.reportFormat}</p></div><div><StatusBadge status={active.status} /><strong>Version {active.version}</strong><small>Effective {active.effectiveFrom}</small></div></section>
    <section className="panel governance-card"><div className="panel-heading"><div><span className="eyebrow">Controlled scope</span><h3>What this version governs</h3></div><LockKeyhole /></div><div className="governance-body"><p>{active.jurisdictionNote}</p><div className="scope-counts"><div><strong>{active.automatedSections.length}</strong><span>automatic calculation sections</span></div><div><strong>{active.conditionalSections.length}</strong><span>controlled applicability sections</span></div></div><p className="method-note">Published rules are immutable. A report always retains the exact rules version used when it was created.</p></div></section>
    <section className="panel governance-card"><div className="panel-heading"><div><span className="eyebrow">Data custody</span><h3>Controlled backup export</h3></div><DatabaseBackup /></div><div className="governance-body"><p>Export instruments, test records, rule versions and the complete audit ledger. Password hashes are excluded.</p>{user.role === 'ADMIN' && <button className="button secondary" onClick={() => downloadFile('/api/admin/export', 'maapsure-controlled-export.json')}>Download controlled export</button>}</div></section>
    {user.role === 'ADMIN' && <section className="panel governance-card wide"><div className="panel-heading"><div><span className="eyebrow">Change control</span><h3>Propose a rules update</h3></div><FileKey2 /></div><form className="governance-form" onSubmit={propose}><p>A proposal cannot silently change calculations. It remains pending until an authorized metrology expert validates the source, tests and effective date.</p><div className="form-grid three"><label>Change title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label><label>Authoritative source<input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="Official notification or OIML publication" required /></label><label>Reason<input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} required /></label></div><button className="button primary" disabled={busy}><Plus size={16} /> Submit governed proposal</button></form>{data.changeRequests.length > 0 && <div className="change-list">{data.changeRequests.map((item) => <article key={item.id}><div><strong>{item.title}</strong><small>{item.source}</small></div><StatusBadge status={item.status} /></article>)}</div>}</section>}
    {user.role === 'ADMIN' && <section className="panel governance-card wide"><div className="panel-heading"><div><span className="eyebrow">Access control</span><h3>Named users and separation of duties</h3></div><Users /></div><div className="table-scroll"><table><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Officer ID</th><th>Status</th></tr></thead><tbody>{users.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.email}</td><td>{item.roleLabel}</td><td>{item.officerId || '-'}</td><td><StatusBadge status={item.active ? 'Active' : 'Disabled'} /></td></tr>)}</tbody></table></div></section>}
  </div>;
}
