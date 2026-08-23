import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Check, Download, ExternalLink, FileCheck2, Info, Printer, QrCode, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { api, downloadFile } from '../lib/api.js';
import { ErrorNotice, Loading, StatusBadge, TestResultIcon } from '../components/UI.jsx';

export default function TestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fileRef = useRef(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = () => api(`/api/tests/${id}`).then(setData).catch((reason) => setError(reason.message));
  useEffect(load, [id]);
  async function uploadEvidence(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const body = new FormData(); body.append('evidence', file); setUploading(true); setError('');
    try { await api(`/api/tests/${id}/evidence`, { method: 'POST', body }); await load(); }
    catch (reason) { setError(reason.message); } finally { setUploading(false); event.target.value = ''; }
  }
  if (!data) return <Loading label={error || 'Opening test report...'} />;
  const { test, reference } = data;
  const { instrument, evaluation } = test;

  return (
    <div className="report-detail">
      {location.state?.justCreated && <div className="success-banner"><FileCheck2 /><span><strong>Report created successfully.</strong> Its calculations, certificate and public verification page are ready.</span></div>}
      <ErrorNotice>{error}</ErrorNotice>
      <div className="detail-actions"><button className="text-button back" onClick={() => navigate('/tests')}><ArrowLeft size={17} /> All reports</button><div><button className="button secondary" onClick={() => window.print()}><Printer size={17} /> Print view</button><button className="button primary" onClick={() => downloadFile(`/api/tests/${test.id}/report.pdf`, `${test.certificateNumber}.pdf`)}><Download size={17} /> Download PDF</button></div></div>

      <section className="certificate-head panel">
        <div className="certificate-id"><span className="eyebrow">Digital test report</span><h2>{test.certificateNumber}</h2><p>Verification code {test.verificationCode}</p></div>
        <div className={`certificate-result ${evaluation.passed ? 'passed' : 'failed'}`}><TestResultIcon passed={evaluation.passed} size="large" /><div><small>Overall result</small><strong>{evaluation.status}</strong><span>{evaluation.passed ? 'Within tested limits' : 'Adjustment required'}</span></div></div>
        <div className="certificate-qr"><img src={`/api/tests/${test.id}/qr.png`} alt="Verification QR code" /><span><QrCode size={15} /> Scan to verify</span></div>
      </section>

      <div className="report-columns">
        <div className="report-main">
          <section className="panel detail-section"><div className="panel-heading"><div><span className="eyebrow">Test subject</span><h3>Instrument information</h3></div><StatusBadge status={instrument.status} /></div><dl className="detail-list"><div><dt>Manufacturer</dt><dd>{instrument.manufacturer}</dd></div><div><dt>Model</dt><dd>{instrument.model}</dd></div><div><dt>Serial number</dt><dd>{instrument.serialNumber}</dd></div><div><dt>Accuracy class</dt><dd>Class {instrument.accuracyClass}</dd></div><div><dt>Capacity</dt><dd>{instrument.minCapacity} to {instrument.maxCapacity} {instrument.unit}</dd></div><div><dt>Verification interval</dt><dd>{instrument.verificationInterval} {instrument.unit}</dd></div></dl></section>

          <section className="panel detail-section"><div className="panel-heading"><div><span className="eyebrow">Clause {reference.clauses.mpe}</span><h3>Weighing performance</h3></div><StatusBadge status={evaluation.sections.performance.passed ? 'PASS' : 'FAIL'} /></div><div className="table-scroll"><table className="calculation-table"><thead><tr><th>Applied load</th><th>Indication</th><th>Error</th><th>Maximum permitted</th><th>Result</th></tr></thead><tbody>{evaluation.sections.performance.results.map((row) => <tr key={row.id}><td>{row.load} {instrument.unit}</td><td>{row.indication} {instrument.unit}</td><td className={row.passed ? '' : 'bad-value'}>{row.error > 0 ? '+' : ''}{row.error}</td><td>+/- {row.mpe}</td><td><StatusBadge status={row.passed ? 'PASS' : 'FAIL'} /></td></tr>)}</tbody></table></div></section>

          <section className="panel detail-section"><div className="panel-heading"><div><span className="eyebrow">Supporting checks</span><h3>Metrological checks</h3></div></div><div className="support-checks">{[
            [evaluation.sections.repeatability, reference.clauses.repeatability], [evaluation.sections.eccentricity, reference.clauses.eccentricity], [evaluation.sections.zeroReturn, reference.clauses.zeroReturn],
          ].map(([section, clause]) => <article key={section.name}><TestResultIcon passed={section.passed} /><div><strong>{section.name}</strong><p>{section.summary}</p><small>OIML clause {clause}</small></div><StatusBadge status={section.passed ? 'PASS' : 'FAIL'} /></article>)}</div></section>

          <section className="panel detail-section"><div className="panel-heading"><div><span className="eyebrow"><Sparkles size={14} /> Explainable review</span><h3>Diagnostic findings</h3></div><span className={`risk-pill ${evaluation.diagnostic.risk.toLowerCase()}`}>{evaluation.diagnostic.risk} risk</span></div><div className="finding-list">{evaluation.diagnostic.findings.map((finding) => <article key={finding.title}><i className={finding.severity} /><div><strong>{finding.title}</strong><p>{finding.detail}</p></div></article>)}</div><div className="method-note"><Info size={17} /><span>{evaluation.diagnostic.method}</span></div></section>

          <section className="panel detail-section"><div className="panel-heading"><div><span className="eyebrow">Inspection evidence</span><h3>Photographs and documents</h3></div><button className="button secondary small" onClick={() => fileRef.current?.click()} disabled={uploading}><Camera size={16} /> {uploading ? 'Uploading...' : 'Capture or upload'}</button><input ref={fileRef} hidden type="file" accept="image/*,.pdf" capture="environment" onChange={uploadEvidence} /></div>{test.evidence.length ? <div className="evidence-grid">{test.evidence.map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer">{item.type.startsWith('image/') ? <img src={item.url} alt={item.name} /> : <span><Upload /></span>}<strong>{item.name}</strong><small>{new Date(item.uploadedAt).toLocaleString('en-IN')}</small></a>)}</div> : <button className="evidence-empty" onClick={() => fileRef.current?.click()}><span><Camera /></span><strong>Add the instrument plate or test setup</strong><small>On a phone, this opens the camera directly.</small></button>}</section>
        </div>

        <aside className="report-aside">
          <section className="panel aside-card"><span className="eyebrow">Test conducted by</span><div className="inspector-profile"><span>{test.inspectorName.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><div><strong>{test.inspectorName}</strong><small>{test.inspectorId}</small></div></div><dl><div><dt>Laboratory</dt><dd>{test.laboratory}</dd></div><div><dt>Date and time</dt><dd>{new Date(test.finalizedAt).toLocaleString('en-IN')}</dd></div><div><dt>Environment</dt><dd>{test.temperature} C, {test.humidity}% RH</dd></div></dl></section>
          <section className="panel aside-card verify-card"><span className="verify-shield"><ShieldCheck /></span><h3>Digitally verifiable</h3><p>This report has a unique public record. Anyone can confirm the result without signing in.</p><a className="button primary full" href={`/verify/${test.verificationCode}`} target="_blank" rel="noreferrer">Open verification <ExternalLink size={16} /></a></section>
          {test.notes && <section className="panel aside-card"><span className="eyebrow">Inspector notes</span><p className="inspector-note">{test.notes}</p></section>}
        </aside>
      </div>
    </div>
  );
}
