import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Gauge, Plus, Search, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { EmptyState, ErrorNotice, Loading, StatusBadge } from '../components/UI.jsx';
import { useAuth } from '../lib/auth.jsx';

const emptyForm = { manufacturer: '', model: '', serialNumber: '', accuracyClass: 'III', maxCapacity: '', minCapacity: '', verificationInterval: '', actualScaleInterval: '', unit: 'kg', location: '' };

export default function InstrumentsPage() {
  const { user } = useAuth();
  const canRegister = ['TESTER', 'ADMIN'].includes(user.role);
  const [instruments, setInstruments] = useState(null);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => api('/api/instruments').then((result) => setInstruments(result.instruments)).catch((reason) => setError(reason.message));
  useEffect(load, []);
  const filtered = useMemo(() => (instruments || []).filter((item) => `${item.manufacturer} ${item.model} ${item.serialNumber}`.toLowerCase().includes(query.toLowerCase())), [instruments, query]);

  function update(name, value) { setForm((current) => ({ ...current, [name]: value })); }
  async function submit(event) {
    event.preventDefault(); setError(''); setSaving(true);
    try {
      await api('/api/instruments', { method: 'POST', body: JSON.stringify(form) });
      setModal(false); setForm(emptyForm); await load();
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }

  if (!instruments) return <Loading label={error || 'Loading registered instruments...'} />;

  return (
    <>
      <div className="page-actions"><div className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search model or serial number" /></div>{canRegister && <button className="button primary" onClick={() => { setError(''); setModal(true); }}><Plus size={18} /> Register instrument</button>}</div>
      <section className="panel instrument-panel">
        <div className="panel-heading"><div><span className="eyebrow">{filtered.length} registered</span><h3>Weighing instruments</h3></div></div>
        {filtered.length ? <div className="instrument-grid">{filtered.map((instrument) => <article className="instrument-card" key={instrument.id}>
          <div className="instrument-card-top"><span className="instrument-icon"><Gauge /></span><StatusBadge status={instrument.status} /></div>
          <span className="eyebrow">Class {instrument.accuracyClass}</span><h3>{instrument.model}</h3><p>{instrument.manufacturer}</p>
          <dl><div><dt>Serial number</dt><dd>{instrument.serialNumber}</dd></div><div><dt>Capacity</dt><dd>{instrument.minCapacity} to {instrument.maxCapacity} {instrument.unit}</dd></div><div><dt>Verification interval</dt><dd>{instrument.verificationInterval} {instrument.unit}</dd></div><div><dt>Scale intervals</dt><dd>{Math.round(instrument.maxCapacity / instrument.verificationInterval).toLocaleString('en-IN')}</dd></div></dl>
          <footer><CheckCircle2 size={15} /> Ready for OIML testing</footer>
        </article>)}</div> : <EmptyState icon={Gauge} title="No instruments found">Try another search or register a new instrument.</EmptyState>}
      </section>

      {modal && <div className="modal-layer" role="dialog" aria-modal="true"><button className="modal-backdrop" onClick={() => setModal(false)} aria-label="Close" /><form className="modal-card" onSubmit={submit}>
        <div className="modal-heading"><div><span className="eyebrow">Instrument registry</span><h2>Register a weighing instrument</h2><p>Enter the information printed on the instrument plate.</p></div><button type="button" className="icon-button" onClick={() => setModal(false)}><X /></button></div>
        <ErrorNotice>{error}</ErrorNotice>
        <div className="form-grid two">
          <label>Manufacturer<input value={form.manufacturer} onChange={(e) => update('manufacturer', e.target.value)} required placeholder="Example: Apex Weighing Systems" /></label>
          <label>Model<input value={form.model} onChange={(e) => update('model', e.target.value)} required placeholder="Example: RetailPro 30" /></label>
          <label>Serial number<input value={form.serialNumber} onChange={(e) => update('serialNumber', e.target.value)} required placeholder="Unique serial number" /></label>
          <label>Accuracy class<select value={form.accuracyClass} onChange={(e) => update('accuracyClass', e.target.value)}><option>I</option><option>II</option><option>III</option><option>IIII</option></select></label>
          <label>Maximum capacity<input type="number" min="0" step="any" value={form.maxCapacity} onChange={(e) => update('maxCapacity', e.target.value)} required /></label>
          <label>Minimum capacity<input type="number" min="0" step="any" value={form.minCapacity} onChange={(e) => update('minCapacity', e.target.value)} required /></label>
          <label>Verification interval (e)<input type="number" min="0" step="any" value={form.verificationInterval} onChange={(e) => update('verificationInterval', e.target.value)} required /></label>
          <label>Actual scale interval (d)<input type="number" min="0" step="any" value={form.actualScaleInterval} onChange={(e) => update('actualScaleInterval', e.target.value)} placeholder="Usually same as e" /></label>
          <label>Unit<select value={form.unit} onChange={(e) => update('unit', e.target.value)}><option>kg</option><option>g</option><option>mg</option><option>t</option></select></label>
          <label>Laboratory / location<input value={form.location} onChange={(e) => update('location', e.target.value)} required placeholder="Where it is tested" /></label>
        </div>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setModal(false)}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Registering...' : 'Register instrument'}</button></div>
      </form></div>}
    </>
  );
}
