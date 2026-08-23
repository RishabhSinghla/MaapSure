import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ChevronRight, ClipboardCheck, FlaskConical, Gauge, HardDrive, Plus, Save, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { ErrorNotice, Loading, StatusBadge } from '../components/UI.jsx';
import { createDemoAssessmentInput, REPORT_SECTIONS } from '../../shared/oimlEngine.js';

const groups = [
  { id: 'core', label: 'Tests 1-11', match: (section) => Number.parseInt(section.number, 10) <= 11 },
  { id: 'electrical', label: 'Electrical test 12', match: (section) => section.number.startsWith('12') },
  { id: 'environment', label: 'Environment 13-15', match: (section) => ['13', '14', '15'].some((prefix) => section.number.startsWith(prefix)) },
  { id: 'construction', label: 'Construction & clauses', match: (section) => ['16', '17'].includes(section.number) },
];
const numberKey = /(load|indication|voltage|frequency|temperature|humidity|pressure|hours|minutes|seconds|count|duration|error|value|displacement|rate|section|sequence|run|measurement|cycle|point|range|max|min|uncertainty)/i;
const longKey = /(note|description|reference|approval|criteria|components|documents|conclusion|explanation|purpose|remarks)/i;
const lockedKey = /^(id|label|direction|rangeId|protocolId|position|category|point|condition|measurementNo|sequence|run)$/;
const human = (value) => String(value).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, (letter) => letter.toUpperCase());

function replaceAt(root, path, value) {
  if (!path.length) return value; const clone = Array.isArray(root) ? [...root] : { ...(root || {}) }; const [head, ...tail] = path; clone[head] = replaceAt(root?.[head], tail, value); return clone;
}

function blankCopy(value, key = '', nextIndex = 1) {
  if (Array.isArray(value)) return value.map((item) => blankCopy(item, key, nextIndex));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, blankCopy(child, childKey, nextIndex)]));
  if (['sequence', 'run', 'measurementNo'].includes(key)) return nextIndex;
  if (lockedKey.test(key)) return value;
  if (typeof value === 'boolean') return false;
  return '';
}

function StructuredEditor({ value, path = [], onChange, fieldName = '' }) {
  if (Array.isArray(value)) {
    const add = () => { const template = value.at(-1); if (template !== undefined) onChange(path, [...value, blankCopy(template, fieldName, value.length + 1)]); };
    const remove = (index) => onChange(path, value.filter((_item, rowIndex) => rowIndex !== index));
    return <div className="structured-array">{value.map((item, index) => <details key={index} className="nested-record"><summary>{human(fieldName || 'Record')} {index + 1}<span className="record-actions"><button type="button" className="icon-button danger" onClick={(event) => { event.preventDefault(); event.stopPropagation(); remove(index); }} aria-label={`Remove ${human(fieldName || 'record')} ${index + 1}`}><Trash2 size={14} /></button><ChevronRight size={15} /></span></summary><StructuredEditor value={item} path={[...path, index]} onChange={onChange} fieldName="record" /></details>)}{!!value.length && <button type="button" className="button secondary small add-record" onClick={add}><Plus size={14} /> Add another {human(fieldName || 'record').toLowerCase()}</button>}</div>;
  }
  if (value && typeof value === 'object') return <div className="structured-object">{Object.entries(value).filter(([key]) => key !== 'equipmentIds').map(([key, child]) => <div key={key} className={child && typeof child === 'object' ? 'structured-group' : 'structured-field'}>{child && typeof child === 'object' ? <><span className="structured-label">{human(key)}</span><StructuredEditor value={child} path={[...path, key]} onChange={onChange} fieldName={key} /></> : <FieldEditor name={key} value={child} onChange={(next) => onChange([...path, key], next)} />}</div>)}</div>;
  return <FieldEditor name={fieldName} value={value} onChange={(next) => onChange(path, next)} />;
}

function FieldEditor({ name, value, onChange }) {
  if (typeof value === 'boolean') return <label className="check-field"><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} /><span>{human(name)}</span></label>;
  if (name === 'result') return <label>{human(name)}<select value={value || 'NOT_ASSESSED'} onChange={(event) => onChange(event.target.value)}><option value="NOT_ASSESSED">Not assessed</option><option value="PASS">Pass</option><option value="FAIL">Fail</option></select></label>;
  const readOnly = lockedKey.test(name); const Input = longKey.test(name) ? 'textarea' : 'input';
  return <label>{human(name)}<Input type={Input === 'input' && numberKey.test(name) && !readOnly ? 'number' : undefined} step="any" value={value ?? ''} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} /></label>;
}

const equipmentCategories = ['Verification mass standard', 'Temperature / climate chamber', 'Humidity / climate chamber', 'Voltage source / electrical analyser', 'Electrical disturbance generator', 'RF immunity system', 'ESD simulator', 'Tilt / angle fixture', 'Load cycling rig with timer', 'Timer / data logger', 'Pressure / barometer standard', 'Length / displacement gauge', 'Rolling-load / axle test rig', 'Other controlled equipment'];

function EquipmentEditor({ equipment, onChange }) {
  const add = () => onChange([...(equipment || []), { id: `eq-${Date.now()}`, category: 'Verification mass standard', name: '', model: '', serialNumber: '', accuracyClass: '', traceabilityReference: '', purpose: '', calibrationDate: '', calibrationDue: '', uncertainty: '' }]);
  const update = (index, key, value) => onChange(equipment.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const remove = (index) => onChange(equipment.filter((_row, rowIndex) => rowIndex !== index));
  return <section className="panel editor-section"><div className="panel-heading"><div><span className="eyebrow">Traceability</span><h3>Test equipment register</h3><p>Reference weights, chambers and electrical test equipment used in this case.</p></div><button className="button secondary small" onClick={add}>Add equipment</button></div>
    {(equipment || []).map((row, index) => <article className="equipment-row" key={row.id}><div className="equipment-row-heading"><strong>Equipment {index + 1}</strong><button type="button" className="icon-button danger" onClick={() => remove(index)} aria-label={`Remove equipment ${index + 1}`}><Trash2 size={17} /></button></div><div className="form-grid three"><label>Category<select value={row.category || ''} onChange={(event) => update(index, 'category', event.target.value)}>{equipmentCategories.map((category) => <option key={category}>{category}</option>)}</select></label>{Object.keys(row).filter((key) => !['id', 'category'].includes(key)).map((key) => <label key={key}>{human(key)}<input type={key.toLowerCase().includes('date') ? 'date' : undefined} value={row[key] ?? ''} onChange={(event) => update(index, key, event.target.value)} /></label>)}</div></article>)}
    {!equipment?.length && <div className="evidence-empty"><HardDrive /><strong>No equipment recorded</strong><small>Add at least one traceable standard before submission.</small></div>}
    {!!equipment?.length && <p className="procedure-note">Choose the equipment actually used inside each test. MaapSure will reject missing, expired, nonexistent or unsuitable links at submission.</p>}
  </section>;
}

function SectionCard({ definition, result, data, equipment, onChange }) {
  if (!result) return null; const applicable = result.applicability === 'Applicable';
  const selectedEquipment = data?.equipmentIds || [];
  const toggleEquipment = (id) => onChange(['equipmentIds'], selectedEquipment.includes(id) ? selectedEquipment.filter((item) => item !== id) : [...selectedEquipment, id]);
  return <details className={`panel editor-section test-plan-card ${!applicable ? 'system-na' : ''}`}>
    <summary><span className="plan-number">{definition.number}</span><div><strong>{definition.name}</strong><small>{result.summary}</small></div><StatusBadge status={result.outcome} /><ChevronRight size={18} /></summary>
    <div className="plan-body"><div className="applicability-line"><ShieldCheck size={17} /><span><strong>{result.applicability}.</strong> {result.applicabilityReason}</span></div>
      {applicable ? <><p className="procedure-note"><b>Procedure:</b> {definition.procedure} · <b>Requirement:</b> {definition.requirement}. {definition.description}</p>
        {!['requirements', 'checklist'].includes(definition.mode) && <div className="section-trace"><fieldset><legend>Equipment actually used</legend><div className="equipment-choice-list">{equipment.map((item) => <label className="check-field" key={item.id}><input type="checkbox" checked={selectedEquipment.includes(item.id)} onChange={() => toggleEquipment(item.id)} /><span>{item.name || item.id}<small>{item.category}</small></span></label>)}</div></fieldset><label>Evidence / bench-sheet reference<input value={data?.evidenceNote || ''} onChange={(event) => onChange(['evidenceNote'], event.target.value)} /></label></div>}
        {definition.mode !== 'checklist' && <StructuredEditor value={Object.fromEntries(Object.entries(data || {}).filter(([key]) => !['equipmentIds', 'evidenceNote'].includes(key)))} onChange={onChange} />}
      </> : <div className="system-na-note">MaapSure locked this as not applicable from the registered instrument features. The tester cannot freely skip it.</div>}
    </div>
  </details>;
}

function MatrixEditor({ title, rows, values, evidence = [], onChange }) {
  const applicable = rows.filter((row) => row.applicability === 'Applicable');
  return <details className="panel matrix-panel"><summary><div><span className="eyebrow">Clause-by-clause evidence</span><h3>{title}</h3><small>{applicable.filter((row) => row.complete).length}/{applicable.length} applicable rows complete</small></div><ChevronRight /></summary><div className="matrix-list">{rows.map((row) => { const key = row.id || row.clause; const decision = values?.[key] || {}; const selected = Array.isArray(decision.evidenceIds) ? decision.evidenceIds : []; const toggleEvidence = (id) => onChange(key, 'evidenceIds', selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]); return <article key={key} className={row.applicability === 'Applicable' ? '' : 'system-na'}><div className="matrix-requirement"><strong>{row.clause}</strong><span>{row.title || row.text}</span><small>{row.applicabilityReason}</small></div>{row.applicability !== 'Applicable' || row.evidence === 'automatic' ? <StatusBadge status={row.outcome} /> : <div className="matrix-decision-fields"><label>Decision<select value={decision.result || 'NOT_ASSESSED'} onChange={(event) => onChange(key, 'result', event.target.value)}><option value="NOT_ASSESSED">Not assessed</option><option value="PASS">Pass</option><option value="FAIL">Fail</option></select></label><label>Finding / reason<textarea value={decision.notes || ''} onChange={(event) => onChange(key, 'notes', event.target.value)} placeholder="What was examined and what was found?" /></label><fieldset className="matrix-evidence-picker"><legend>Uploaded evidence</legend>{evidence.length ? evidence.map((item) => <label className="check-field" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleEvidence(item.id)} /><span>{item.name}<small>Section {item.sectionId}</small></span></label>) : <small>Upload evidence from the case summary before signing this decision.</small>}</fieldset><label>Examiner name<input value={decision.examinerName || ''} onChange={(event) => onChange(key, 'examinerName', event.target.value)} /></label><label>Examiner role / authority<input value={decision.examinerRole || ''} onChange={(event) => onChange(key, 'examinerRole', event.target.value)} /></label><label>Signed date/time<input type="datetime-local" value={(decision.signedAt || '').slice(0, 16)} onChange={(event) => onChange(key, 'signedAt', event.target.value)} /></label><label>Authority decision reference<input value={decision.authorityDecisionReference || ''} onChange={(event) => onChange(key, 'authorityDecisionReference', event.target.value)} placeholder="Named decision or review reference" /></label></div>}</article>; })}</div></details>;
}

export default function TypeEvaluationEditorPage() {
  const { id } = useParams(); const navigate = useNavigate(); const location = useLocation(); const loadedRef = useRef(false); const timerRef = useRef(null);
  const inputRef = useRef(null); const metaRef = useRef(null); const testRef = useRef(null); const savingRef = useRef(false); const savePromiseRef = useRef(null); const pendingSaveRef = useRef(false); const changeGenerationRef = useRef(0);
  const [test, setTest] = useState(null); const [input, setInput] = useState(null); const [meta, setMeta] = useState(null); const [active, setActive] = useState('core');
  const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false); const [savedAt, setSavedAt] = useState(''); const [error, setError] = useState('');
  const load = () => api(`/api/tests/${id}`).then(({ test: row }) => { const loadedMeta = { inspectorName: row.inspectorName, inspectorId: row.inspectorId, laboratory: row.laboratory, notes: row.notes || '', environment: row.environment || {} }; testRef.current = row; inputRef.current = row.input; metaRef.current = loadedMeta; setTest(row); setInput(row.input); setMeta(loadedMeta); loadedRef.current = true; }).catch((reason) => setError(reason.message));
  useEffect(load, [id]);
  useEffect(() => { const before = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', before); return () => window.removeEventListener('beforeunload', before); }, [dirty]);
  async function save(nextInput, nextMeta) {
    if (!testRef.current) return undefined;
    if (nextInput) inputRef.current = nextInput;
    if (nextMeta) metaRef.current = nextMeta;
    if (savingRef.current) { pendingSaveRef.current = true; return savePromiseRef.current; }
    savingRef.current = true; setSaving(true); setError('');
    const task = (async () => {
      try {
        do {
          pendingSaveRef.current = false;
          const generation = changeGenerationRef.current; const payloadInput = inputRef.current; const payloadMeta = metaRef.current; const currentTest = testRef.current;
          const { test: saved } = await api(`/api/tests/${id}`, { method: 'PATCH', body: JSON.stringify({ expectedVersion: currentTest.recordVersion, input: payloadInput, ...payloadMeta, environment: payloadMeta.environment }) });
          testRef.current = saved; setTest(saved); setSavedAt(new Date().toLocaleTimeString('en-IN'));
          if (generation === changeGenerationRef.current) { inputRef.current = saved.input; setInput(saved.input); setDirty(false); }
          else pendingSaveRef.current = true;
        } while (pendingSaveRef.current);
        return true;
      } catch (reason) { pendingSaveRef.current = false; setError(reason.message); return false; }
      finally { savingRef.current = false; savePromiseRef.current = null; setSaving(false); }
    })();
    savePromiseRef.current = task; return task;
  }
  useEffect(() => { if (!dirty || !loadedRef.current) return undefined; clearTimeout(timerRef.current); timerRef.current = setTimeout(() => save(), 1400); return () => clearTimeout(timerRef.current); }, [dirty, input, meta]);
  const updateInput = (path, value) => { setInput((current) => { const next = replaceAt(current, path, value); inputRef.current = next; return next; }); changeGenerationRef.current += 1; if (savingRef.current) pendingSaveRef.current = true; setDirty(true); };
  const updateMeta = (path, value) => { setMeta((current) => { const next = replaceAt(current, path, value); metaRef.current = next; return next; }); changeGenerationRef.current += 1; if (savingRef.current) pendingSaveRef.current = true; setDirty(true); };
  const updateMatrix = (key, field, value, matrix) => updateInput([matrix, key, field], value);
  const filtered = useMemo(() => REPORT_SECTIONS.filter(groups.find((group) => group.id === active)?.match || (() => true)), [active]);
  async function loadDemo() { if (!window.confirm('Load clearly labeled synthetic SIH demo observations into this draft? This replaces current draft entries.')) return; const demo = createDemoAssessmentInput(test.instrument); inputRef.current = demo; changeGenerationRef.current += 1; setInput(demo); setDirty(true); await save(demo, metaRef.current); }
  if (!test || !input || !meta) return <Loading label={error || 'Opening the saved type-evaluation case...'} />;
  const evaluation = test.evaluation; const editable = ['Draft', 'Returned'].includes(test.status);
  if (!editable) return <div className="panel wizard-panel"><ErrorNotice>{error}</ErrorNotice><h2>This case is locked</h2><p>Submitted and issued cases are viewed from the controlled report page.</p><button className="button primary" onClick={() => navigate(`/tests/${id}`)}>Open controlled report</button></div>;
  return <div className="evaluation-editor">
    {location.state?.justCreated && <div className="success-banner"><Save /><span><strong>Your blank case is already saved.</strong> You can close the browser and resume later.</span></div>}
    <ErrorNotice>{error}</ErrorNotice>
    <div className="editor-toolbar panel"><button className="text-button back" onClick={() => navigate(`/tests/${id}`)}><ArrowLeft /> Case summary</button><div className="save-state"><span className={dirty ? 'dirty-dot' : 'saved-dot'} />{saving ? 'Saving…' : dirty ? 'Unsaved changes' : `Saved${savedAt ? ` at ${savedAt}` : ''}`}</div><div><button className="button secondary" onClick={loadDemo}><Sparkles size={17} /> Load synthetic SIH demo</button><button className="button primary" disabled={saving || !dirty} onClick={() => save()}><Save size={17} /> Save now</button></div></div>
    {input.demoFixture && <div className="warning-banner"><AlertTriangle /><span><strong>Synthetic demonstration observations loaded.</strong> Every report and verification view will identify this as demo data, not a statutory laboratory result.</span></div>}
    <section className="panel coverage-hero"><div><span className="eyebrow">Type evaluation · {test.instrument.applicationNumber}</span><h2>{test.instrument.typeDesignation}</h2><p>{test.instrument.manufacturer} · {test.instrument.serialNumber} · Class {test.instrument.accuracyClass}</p></div><div className="coverage-ring"><strong>{evaluation.coverage.percent}%</strong><span>complete</span></div><dl><div><dt>Report sections</dt><dd>{evaluation.coverage.completedReportSections}/{evaluation.coverage.applicableReportSections}</dd></div><div><dt>Clause families</dt><dd>{evaluation.requirements.filter((row) => row.complete && row.applicability === 'Applicable').length}/{evaluation.coverage.applicableRequirementFamilies}</dd></div><div><dt>Checklist rows</dt><dd>{evaluation.checklist.filter((row) => row.complete && row.applicability === 'Applicable').length}/{evaluation.coverage.applicableDetailedChecklistRows}</dd></div></dl></section>
    <section className="panel editor-section"><div className="panel-heading"><div><span className="eyebrow">Case information</span><h3>Observer and environment</h3></div><StatusBadge status={test.status} /></div><div className="form-grid three"><label>Inspector name<input value={meta.inspectorName} onChange={(e) => updateMeta(['inspectorName'], e.target.value)} /></label><label>Officer ID<input value={meta.inspectorId} onChange={(e) => updateMeta(['inspectorId'], e.target.value)} /></label><label>Laboratory<input value={meta.laboratory} onChange={(e) => updateMeta(['laboratory'], e.target.value)} /></label><label>Temperature (C)<input type="number" value={meta.environment.temperature ?? ''} onChange={(e) => updateMeta(['environment', 'temperature'], e.target.value)} /></label><label>Humidity (%)<input type="number" value={meta.environment.humidity ?? ''} onChange={(e) => updateMeta(['environment', 'humidity'], e.target.value)} /></label><label>Pressure (hPa)<input type="number" value={meta.environment.barometricPressure ?? ''} onChange={(e) => updateMeta(['environment', 'barometricPressure'], e.target.value)} /></label></div></section>
    <EquipmentEditor equipment={input.equipment || []} onChange={(value) => updateInput(['equipment'], value)} />
    <nav className="editor-tabs">{groups.map((group) => <button key={group.id} className={active === group.id ? 'active' : ''} onClick={() => setActive(group.id)}>{group.id === 'core' ? <Gauge /> : group.id === 'electrical' ? <FlaskConical /> : group.id === 'construction' ? <ClipboardCheck /> : <ShieldCheck />}{group.label}</button>)}</nav>
    <div className="test-plan-list">{filtered.filter((definition) => !['construction', 'checklist'].includes(definition.id)).map((definition) => <SectionCard key={definition.id} definition={definition} result={evaluation.sections[definition.id]} data={input.sections?.[definition.id] || {}} equipment={input.equipment || []} onChange={(path, value) => updateInput(['sections', definition.id, ...path], value)} />)}</div>
    {active === 'construction' && <><SectionCard definition={REPORT_SECTIONS.find((row) => row.id === 'construction')} result={evaluation.sections.construction} data={input.sections?.construction || {}} equipment={input.equipment || []} onChange={(path, value) => updateInput(['sections', 'construction', ...path], value)} /><MatrixEditor title="Governed R 76-1 requirement-family matrix" rows={evaluation.requirements} values={input.requirements} evidence={test.evidence || []} onChange={(key, field, value) => updateMatrix(key, field, value, 'requirements')} /><MatrixEditor title="R 76-2 checklist plus additional fail-closed requirement rows" rows={evaluation.checklist} values={input.checklist} evidence={test.evidence || []} onChange={(key, field, value) => updateMatrix(key, field, value, 'checklist')} /></>}
    <section className="panel editor-finish"><div><span className="eyebrow">Submission gate</span><h3>{evaluation.complete ? 'Every digitally mapped applicable item is dispositioned' : `${evaluation.coverage.blockers.length} blockers remain`}</h3><p>{evaluation.complete ? 'Save, attach hashed construction/dossier evidence, then submit for independent authorized review. This does not replace physical testing or statutory judgment.' : evaluation.coverage.blockers.slice(0, 5).join(' · ')}</p></div><button className="button primary" onClick={async () => { if (dirty && await save() === false) return; navigate(`/tests/${id}`); }}>Open case summary <ChevronRight /></button></section>
  </div>;
}
