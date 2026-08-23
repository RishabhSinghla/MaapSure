import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Gauge, Info, Mic, Plus, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { ErrorNotice, Loading } from '../components/UI.jsx';
import { useAuth } from '../lib/auth.jsx';
import { CONDITIONAL_TESTS } from '../../shared/oimlEngine.js';

const positions = ['Centre', 'Front left', 'Front right', 'Rear left', 'Rear right'];

function freshInput(instrument) {
  const max = Number(instrument.maxCapacity);
  const e = Number(instrument.verificationInterval);
  const d = Number(instrument.actualScaleInterval || e);
  const point = (ratio) => Number((max * ratio).toFixed(6));
  const middle = point(.5);
  return {
    performance: [0, .2, .5, 1].map((ratio, index) => ({ id: `p-${index}`, load: point(ratio), indication: point(ratio) })),
    repeatability: { load: point(.5), readings: [point(.5), point(.5), point(.5)] },
    eccentricity: { load: Number(Math.max(max / 3, e).toFixed(6)), positions: positions.map((position) => ({ position, indication: Number(Math.max(max / 3, e).toFixed(6)) })) },
    zeroReturn: { reading: 0 },
    temperatureZero: { points: [{ temperature: 20, zero: 0 }, { temperature: 25, zero: 0 }] },
    discrimination: { before: middle, after: Number((middle + d).toFixed(6)), extraLoad: Number((1.4 * d).toFixed(6)) },
    creep: { initial: middle, at15: middle, at30: middle },
    warmUp: { points: [0, 5, 15, 30].map((minutes) => ({ minutes, zero: 0, load: middle, indication: middle })) },
    voltageVariation: { points: [207, 230, 253].map((voltage) => ({ voltage, load: middle, indication: middle })) },
    conditionalTests: CONDITIONAL_TESTS.map((item) => ({ id: item.id, applicability: 'Not applicable', result: 'NOT TESTED', reason: 'Not applicable to this initial-verification assessment.', evidenceNote: '' })),
  };
}

export default function NewTestPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [instruments, setInstruments] = useState(null);
  const [instrumentId, setInstrumentId] = useState('');
  const [input, setInput] = useState(null);
  const [meta, setMeta] = useState({ inspectorName: user?.name || '', inspectorId: 'LMO-0186', laboratory: '', temperature: 24, humidity: 48, notes: '' });
  const [evaluation, setEvaluation] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => { api('/api/instruments').then((result) => { setInstruments(result.instruments); if (result.instruments[0]) setInstrumentId(result.instruments[0].id); }).catch((reason) => setError(reason.message)); }, []);
  const instrument = useMemo(() => instruments?.find((item) => item.id === instrumentId), [instruments, instrumentId]);
  useEffect(() => { if (instrument) { setInput(freshInput(instrument)); setMeta((current) => ({ ...current, laboratory: instrument.location })); setEvaluation(null); } }, [instrumentId, instrument]);

  function updateMeta(name, value) { setMeta((current) => ({ ...current, [name]: value })); }
  function updatePerformance(index, name, value) { setInput((current) => ({ ...current, performance: current.performance.map((row, rowIndex) => rowIndex === index ? { ...row, [name]: Number(value) } : row) })); }
  function addPerformanceRow() { setInput((current) => ({ ...current, performance: [...current.performance, { id: `p-${Date.now()}`, load: 0, indication: 0 }] })); }
  function removePerformanceRow(index) { setInput((current) => ({ ...current, performance: current.performance.filter((_row, rowIndex) => rowIndex !== index) })); }
  function updateRepeatability(index, value) { setInput((current) => ({ ...current, repeatability: { ...current.repeatability, readings: current.repeatability.readings.map((reading, readingIndex) => readingIndex === index ? Number(value) : reading) } })); }
  function updatePosition(index, value) { setInput((current) => ({ ...current, eccentricity: { ...current.eccentricity, positions: current.eccentricity.positions.map((row, rowIndex) => rowIndex === index ? { ...row, indication: Number(value) } : row) } })); }
  function updatePoint(section, index, name, value) { setInput((current) => ({ ...current, [section]: { ...current[section], points: current[section].points.map((row, rowIndex) => rowIndex === index ? { ...row, [name]: Number(value) } : row) } })); }
  function updateConditional(index, name, value) { setInput((current) => ({ ...current, conditionalTests: current.conditionalTests.map((row, rowIndex) => rowIndex === index ? { ...row, [name]: value } : row) })); }

  async function calculate() {
    setBusy(true); setError('');
    try { const result = await api('/api/tests/evaluate', { method: 'POST', body: JSON.stringify({ instrumentId, input }) }); setEvaluation(result.evaluation); setStep(3); }
    catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }

  async function finalize() {
    setBusy(true); setError('');
    try { const result = await api('/api/tests', { method: 'POST', body: JSON.stringify({ instrumentId, input, ...meta }) }); navigate(`/tests/${result.test.id}`, { state: { justCreated: true } }); }
    catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }

  function toggleVoice() {
    if (listening) { recognitionRef.current?.stop(); return; }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setError('Voice notes are not supported in this browser. Chrome works best.'); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN'; recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event) => updateMeta('notes', `${meta.notes}${meta.notes ? ' ' : ''}${event.results[0][0].transcript}`);
    recognitionRef.current = recognition; recognition.start();
  }

  if (!instruments || !input) return <Loading label={error || 'Preparing the guided test...'} />;

  return (
    <div className="test-wizard">
      <div className="wizard-steps">{[
        [1, 'Instrument and conditions'], [2, 'Record observations'], [3, 'Review and finalize'],
      ].map(([number, label]) => <div key={number} className={step === number ? 'active' : step > number ? 'done' : ''}><span>{step > number ? <Check size={16} /> : number}</span><strong>{label}</strong></div>)}</div>
      <ErrorNotice>{error}</ErrorNotice>

      {step === 1 && <section className="panel wizard-panel">
        <div className="section-heading"><span className="section-number">01</span><div><h2>Select the instrument</h2><p>MaapSure uses its class and verification interval to choose the correct limits.</p></div></div>
        <div className="instrument-choice-grid">{instruments.map((item) => <button key={item.id} className={item.id === instrumentId ? 'instrument-choice selected' : 'instrument-choice'} onClick={() => setInstrumentId(item.id)}><span className="instrument-icon"><Gauge /></span><div><strong>{item.model}</strong><small>{item.manufacturer}</small><em>{item.serialNumber}</em></div><i>{item.id === instrumentId && <Check />}</i></button>)}</div>
        <div className="selected-summary"><div><span>Accuracy class</span><strong>{instrument.accuracyClass}</strong></div><div><span>Capacity</span><strong>{instrument.minCapacity} to {instrument.maxCapacity} {instrument.unit}</strong></div><div><span>Verification interval</span><strong>{instrument.verificationInterval} {instrument.unit}</strong></div><div><span>Scale intervals</span><strong>{Math.round(instrument.maxCapacity / instrument.verificationInterval).toLocaleString('en-IN')}</strong></div></div>
        <div className="section-heading compact"><span className="section-number">02</span><div><h2>Test conditions</h2><p>Record who performed the test and the laboratory environment.</p></div></div>
        <div className="form-grid three"><label>Inspector name<input value={meta.inspectorName} onChange={(e) => updateMeta('inspectorName', e.target.value)} /></label><label>Inspector ID<input value={meta.inspectorId} onChange={(e) => updateMeta('inspectorId', e.target.value)} /></label><label>Laboratory<input value={meta.laboratory} onChange={(e) => updateMeta('laboratory', e.target.value)} /></label><label>Temperature (C)<input type="number" step="any" value={meta.temperature} onChange={(e) => updateMeta('temperature', e.target.value)} /></label><label>Relative humidity (%)<input type="number" step="any" value={meta.humidity} onChange={(e) => updateMeta('humidity', e.target.value)} /></label></div>
        <div className="wizard-footer"><span /><button className="button primary" onClick={() => setStep(2)}>Record observations <ArrowRight size={18} /></button></div>
      </section>}

      {step === 2 && <section className="panel wizard-panel observations-panel">
        <div className="test-block"><div className="test-block-heading"><div><span className="eyebrow">OIML 3.5.1</span><h2>Weighing performance</h2><p>Enter the actual indication shown for each applied standard load.</p></div><button className="button secondary small" onClick={addPerformanceRow}><Plus size={16} /> Add load point</button></div><div className="reading-table"><div className="reading-row heading"><span>Applied load ({instrument.unit})</span><span>Indication ({instrument.unit})</span><span>Live error</span><span /></div>{input.performance.map((row, index) => <div className="reading-row" key={row.id}><input type="number" step="any" value={row.load} onChange={(e) => updatePerformance(index, 'load', e.target.value)} /><input type="number" step="any" value={row.indication} onChange={(e) => updatePerformance(index, 'indication', e.target.value)} /><strong className={Math.abs(row.indication - row.load) > instrument.verificationInterval ? 'bad' : ''}>{Number(row.indication - row.load).toFixed(3)}</strong><button onClick={() => removePerformanceRow(index)} disabled={input.performance.length <= 3}><Trash2 size={16} /></button></div>)}</div></div>
        <div className="test-block"><div className="test-block-heading"><div><span className="eyebrow">OIML 3.6.1</span><h2>Repeatability</h2><p>Apply the same load three times and record each result.</p></div></div><div className="inline-readings"><label>Applied load<input type="number" step="any" value={input.repeatability.load} onChange={(e) => setInput((current) => ({ ...current, repeatability: { ...current.repeatability, load: Number(e.target.value) } }))} /></label>{input.repeatability.readings.map((reading, index) => <label key={index}>Reading {index + 1}<input type="number" step="any" value={reading} onChange={(e) => updateRepeatability(index, e.target.value)} /></label>)}</div></div>
        <div className="test-block"><div className="test-block-heading"><div><span className="eyebrow">OIML 3.6.2</span><h2>Eccentric loading</h2><p>Place the load at the centre and corners of the platform.</p></div></div><div className="inline-readings position-readings"><label>Applied load<input type="number" step="any" value={input.eccentricity.load} onChange={(e) => setInput((current) => ({ ...current, eccentricity: { ...current.eccentricity, load: Number(e.target.value) } }))} /></label>{input.eccentricity.positions.map((row, index) => <label key={row.position}>{row.position}<input type="number" step="any" value={row.indication} onChange={(e) => updatePosition(index, e.target.value)} /></label>)}</div></div>
        <div className="test-block"><div className="test-block-heading"><div><span className="eyebrow">OIML 3.9.4.2</span><h2>Return to zero</h2><p>Remove the load after the test and record the stable indication.</p></div></div><label className="single-reading">Zero indication ({instrument.unit})<input type="number" step="any" value={input.zeroReturn.reading} onChange={(e) => setInput((current) => ({ ...current, zeroReturn: { reading: Number(e.target.value) } }))} /><small>Maximum permitted: +/- {(instrument.verificationInterval * .5).toFixed(4)} {instrument.unit}</small></label></div>
        <div className="test-block"><div className="test-block-heading"><div><span className="eyebrow">OIML R 76-2, 5.2</span><h2>Temperature effect at zero</h2><p>Record stable zero indications at two temperatures.</p></div></div><div className="inline-readings">{input.temperatureZero.points.map((row, index) => <div className="paired-reading" key={index}><label>Temperature (C)<input type="number" step="any" value={row.temperature} onChange={(e) => updatePoint('temperatureZero', index, 'temperature', e.target.value)} /></label><label>Zero indication<input type="number" step="any" value={row.zero} onChange={(e) => updatePoint('temperatureZero', index, 'zero', e.target.value)} /></label></div>)}</div></div>
        <div className="test-block"><div className="test-block-heading"><div><span className="eyebrow">OIML R 76-2, 5.3</span><h2>Digital discrimination</h2><p>Confirm that an extra load near 1.4d produces at least one scale-interval response.</p></div></div><div className="inline-readings"><label>Before<input type="number" step="any" value={input.discrimination.before} onChange={(e) => setInput((current) => ({ ...current, discrimination: { ...current.discrimination, before: Number(e.target.value) } }))} /></label><label>After<input type="number" step="any" value={input.discrimination.after} onChange={(e) => setInput((current) => ({ ...current, discrimination: { ...current.discrimination, after: Number(e.target.value) } }))} /></label><label>Extra load<input type="number" step="any" value={input.discrimination.extraLoad} onChange={(e) => setInput((current) => ({ ...current, discrimination: { ...current.discrimination, extraLoad: Number(e.target.value) } }))} /></label></div></div>
        <div className="test-block"><div className="test-block-heading"><div><span className="eyebrow">OIML R 76-2, 5.7</span><h2>Creep</h2><p>Keep the load applied and record the indication at the required times.</p></div></div><div className="inline-readings">{[['initial', 'Initial'], ['at15', 'After 15 minutes'], ['at30', 'After 30 minutes']].map(([name, label]) => <label key={name}>{label}<input type="number" step="any" value={input.creep[name]} onChange={(e) => setInput((current) => ({ ...current, creep: { ...current.creep, [name]: Number(e.target.value) } }))} /></label>)}</div></div>
        <div className="test-block"><div className="test-block-heading"><div><span className="eyebrow">OIML R 76-2, 5.11</span><h2>Warm-up time</h2><p>Enter zero, applied load and indication at 0, 5, 15 and 30 minutes.</p></div></div><div className="compact-grid"><div className="compact-row heading"><span>Minutes</span><span>Zero</span><span>Load</span><span>Indication</span></div>{input.warmUp.points.map((row, index) => <div className="compact-row" key={row.minutes}><strong>{row.minutes}</strong>{['zero', 'load', 'indication'].map((name) => <input key={name} type="number" step="any" value={row[name]} onChange={(e) => updatePoint('warmUp', index, name, e.target.value)} />)}</div>)}</div></div>
        <div className="test-block"><div className="test-block-heading"><div><span className="eyebrow">OIML R 76-2, 6.2</span><h2>Voltage variation</h2><p>Record performance at low, nominal and high supply voltage.</p></div></div><div className="compact-grid"><div className="compact-row heading"><span>Voltage</span><span>Load</span><span>Indication</span><span /></div>{input.voltageVariation.points.map((row, index) => <div className="compact-row" key={index}>{['voltage', 'load', 'indication'].map((name) => <input key={name} type="number" step="any" value={row[name]} onChange={(e) => updatePoint('voltageVariation', index, name, e.target.value)} />)}<span /></div>)}</div></div>
        <div className="test-block"><div className="test-block-heading"><div><span className="eyebrow">Controlled applicability</span><h2>Equipment-dependent and conditional tests</h2><p>Every item must either have a result and evidence note, or a clear reason why it is not applicable.</p></div></div><div className="conditional-list">{input.conditionalTests.map((row, index) => { const definition = CONDITIONAL_TESTS.find((item) => item.id === row.id); return <article key={row.id}><div><strong>{definition.name}</strong><small>{definition.clause}</small></div><select value={row.applicability} onChange={(e) => updateConditional(index, 'applicability', e.target.value)}><option>Applicable</option><option>Not applicable</option><option>Not assessed</option></select>{row.applicability === 'Applicable' ? <><select value={row.result} onChange={(e) => updateConditional(index, 'result', e.target.value)}><option>NOT TESTED</option><option>PASS</option><option>FAIL</option></select><input value={row.evidenceNote} onChange={(e) => updateConditional(index, 'evidenceNote', e.target.value)} placeholder="Equipment, observation or evidence reference" /></> : <input value={row.reason} onChange={(e) => updateConditional(index, 'reason', e.target.value)} placeholder="Reason this test is not applicable" />}</article>; })}</div></div>
        <div className="test-block notes-block"><div className="test-block-heading"><div><span className="eyebrow">Field notes</span><h2>Inspector observations</h2><p>Type or dictate anything that should appear in the report.</p></div><button className={`button secondary small ${listening ? 'listening' : ''}`} onClick={toggleVoice}><Mic size={16} /> {listening ? 'Listening...' : 'Dictate note'}</button></div><textarea value={meta.notes} onChange={(e) => updateMeta('notes', e.target.value)} placeholder="Example: Platform was levelled before the test. Reference weights were checked..." /></div>
        <div className="wizard-footer"><button className="button secondary" onClick={() => setStep(1)}><ArrowLeft size={18} /> Back</button><button className="button primary" disabled={busy} onClick={calculate}>{busy ? 'Calculating...' : 'Calculate result'} <Sparkles size={18} /></button></div>
      </section>}

      {step === 3 && evaluation && <section className="panel wizard-panel result-review">
        <div className={`big-result ${evaluation.passed ? 'passed' : 'failed'}`}><span>{evaluation.passed ? <CheckCircle2 /> : <Info />}</span><div><small>Automatic OIML result</small><h2>{evaluation.status}</h2><p>{evaluation.passed ? 'Every recorded core check is within the permitted limit.' : 'One or more checks exceed the permitted limit. Review the findings below.'}</p></div></div>
        <div className="review-grid"><div><span className="eyebrow">Controlled checks</span>{Object.values(evaluation.sections).map((section) => <article className="review-check" key={section.name}><span className={section.passed ? 'pass-dot' : 'fail-dot'}>{section.passed ? <Check /> : '!'}</span><div><strong>{section.name}</strong><small>{section.summary}</small></div><em>{section.passed ? 'PASS' : section.complete ? 'FAIL' : 'INCOMPLETE'}</em></article>)}<article className="review-check"><span className={evaluation.conditional.passed ? 'pass-dot' : 'fail-dot'}>{evaluation.conditional.passed ? <Check /> : '!'}</span><div><strong>Conditional test disposition</strong><small>{evaluation.conditional.summary}</small></div><em>{evaluation.conditional.passed ? 'PASS' : evaluation.conditional.complete ? 'FAIL' : 'INCOMPLETE'}</em></article></div><div className="diagnostic-card"><span className="eyebrow"><Sparkles size={14} /> Explainable diagnostic review</span><div className={`risk-banner ${evaluation.diagnostic.risk.toLowerCase()}`}>Risk level: <strong>{evaluation.diagnostic.risk}</strong></div>{evaluation.diagnostic.findings.map((finding) => <article key={finding.title}><i className={finding.severity} /><div><strong>{finding.title}</strong><p>{finding.detail}</p></div></article>)}</div></div>
        <div className="method-note"><Info size={17} /><span><strong>Nothing is hidden.</strong> MaapSure uses the instrument class, verification interval and OIML clauses shown beside each test. The final legal decision remains with the authorized officer.</span></div>
        <div className="wizard-footer"><button className="button secondary" onClick={() => setStep(2)}><ArrowLeft size={18} /> Change readings</button><button className="button primary" disabled={busy || !evaluation.complete} onClick={finalize}>{busy ? 'Saving draft...' : 'Save controlled draft'} <ArrowRight size={18} /></button></div>
      </section>}
    </div>
  );
}
