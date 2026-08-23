import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ClipboardList, Gauge, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { ErrorNotice, Loading } from '../components/UI.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function NewTestPage() {
  const { user } = useAuth(); const navigate = useNavigate();
  const [instruments, setInstruments] = useState(null); const [instrumentId, setInstrumentId] = useState('');
  const [meta, setMeta] = useState({ inspectorName: user?.name || '', inspectorId: user?.officerId || '', laboratory: '', temperature: 20, humidity: 50, barometricPressure: 1013.25, notes: '' });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { api('/api/instruments').then(({ instruments: rows }) => { setInstruments(rows); if (rows[0]) setInstrumentId(rows[0].id); }).catch((reason) => setError(reason.message)); }, []);
  const instrument = useMemo(() => instruments?.find((item) => item.id === instrumentId), [instruments, instrumentId]);
  useEffect(() => { if (instrument) setMeta((current) => ({ ...current, laboratory: instrument.location || current.laboratory })); }, [instrument]);
  const update = (name, value) => setMeta((current) => ({ ...current, [name]: value }));
  async function start() {
    setBusy(true); setError('');
    try { const { test } = await api('/api/type-evaluations', { method: 'POST', body: JSON.stringify({ instrumentId, ...meta }) }); navigate(`/tests/${test.id}/edit`, { state: { justCreated: true } }); }
    catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }
  if (!instruments) return <Loading label={error || 'Preparing the type-evaluation registry...'} />;
  return <div className="test-wizard">
    <ErrorNotice>{error}</ErrorNotice>
    <section className="panel wizard-panel">
      <div className="section-heading"><span className="section-number"><ClipboardList /></span><div><span className="eyebrow">OIML R 76 model approval</span><h2>Start a resumable type evaluation</h2><p>A blank case is saved immediately. MaapSure then creates the applicable R 76 plan from the instrument questionnaire.</p></div></div>
      <div className="instrument-choice-grid">{instruments.map((item) => <button type="button" key={item.id} className={item.id === instrumentId ? 'instrument-choice selected' : 'instrument-choice'} onClick={() => setInstrumentId(item.id)}><span className="instrument-icon"><Gauge /></span><div><strong>{item.typeDesignation || item.model}</strong><small>{item.manufacturer}</small><em>{item.applicationNumber} · {item.serialNumber}</em></div><i>{item.id === instrumentId && <Check />}</i></button>)}</div>
      {instrument && <><div className="selected-summary"><div><span>Application</span><strong>{instrument.applicationNumber}</strong></div><div><span>Class</span><strong>{instrument.accuracyClass}</strong></div><div><span>Capacity</span><strong>{instrument.minCapacity} to {instrument.maxCapacity} {instrument.unit}</strong></div><div><span>Type</span><strong>{instrument.features?.electronic ? 'Electronic' : 'Mechanical'} · {instrument.features?.indicatingMode}</strong></div></div>
      <div className="section-heading compact"><span className="section-number">02</span><div><h2>Case and laboratory details</h2><p>These can be changed while the case remains a draft.</p></div></div>
      <div className="form-grid three"><label>Inspector name<input value={meta.inspectorName} onChange={(e) => update('inspectorName', e.target.value)} /></label><label>Officer ID<input value={meta.inspectorId} onChange={(e) => update('inspectorId', e.target.value)} /></label><label>Laboratory<input value={meta.laboratory} onChange={(e) => update('laboratory', e.target.value)} /></label><label>Temperature (C)<input type="number" step="any" value={meta.temperature} onChange={(e) => update('temperature', e.target.value)} /></label><label>Relative humidity (%)<input type="number" step="any" value={meta.humidity} onChange={(e) => update('humidity', e.target.value)} /></label><label>Barometric pressure (hPa)<input type="number" step="any" value={meta.barometricPressure} onChange={(e) => update('barometricPressure', e.target.value)} /></label></div>
      <div className="method-note"><ShieldCheck size={18} /><span>The instrument dossier and active rules profile are locked as snapshots when this case is created, so later registry edits cannot silently change its report.</span></div>
      <div className="wizard-footer"><span /><button className="button primary" disabled={busy || !instrument} onClick={start}>{busy ? 'Creating saved case...' : 'Create saved case'} <ArrowRight size={18} /></button></div></>}
    </section>
  </div>;
}
