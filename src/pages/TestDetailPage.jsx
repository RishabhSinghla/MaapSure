import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, Download, ExternalLink, FileCheck2, FileText, Info, Printer, QrCode, RotateCcw, Send, ShieldCheck, Sparkles, Upload, XCircle } from 'lucide-react';
import { api, downloadFile } from '../lib/api.js';
import { ErrorNotice, Loading, StatusBadge, TestResultIcon } from '../components/UI.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function TestDetailPage() {
  const { id } = useParams(); const { user } = useAuth(); const navigate = useNavigate(); const location = useLocation(); const fileRef = useRef(null);
  const [data, setData] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [reviewNote, setReviewNote] = useState('');
  const load = () => api(`/api/tests/${id}`).then(setData).catch((reason) => setError(reason.message));
  useEffect(load, [id]);

  async function uploadEvidence(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const body = new FormData(); body.append('evidence', file); setBusy(true); setError('');
    try { await api(`/api/tests/${id}/evidence`, { method: 'POST', body }); await load(); }
    catch (reason) { setError(reason.message); } finally { setBusy(false); event.target.value = ''; }
  }
  async function action(path, options = {}) {
    setBusy(true); setError('');
    try { const result = await api(`/api/tests/${id}/${path}`, { method: 'POST', ...options }); if (result.test?.id && result.test.id !== id) navigate(`/tests/${result.test.id}`, { state: { justCreated: true } }); else await load(); }
    catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }
  async function review(decision) { await action('review', { body: JSON.stringify({ decision, comment: reviewNote }) }); setReviewNote(''); }
  async function revoke() { const reason = window.prompt('Enter the formal reason for revoking this approved report:'); if (reason) await action('revoke', { body: JSON.stringify({ reason }) }); }

  if (!data) return <Loading label={error || 'Opening controlled test record...'} />;
  const { test, integrityValid } = data; const { instrument, evaluation } = test;
  const issued = ['Approved', 'Revoked'].includes(test.status); const editable = ['Draft', 'Returned'].includes(test.status);
  const canTest = ['TESTER', 'ADMIN'].includes(user.role); const canReview = ['REVIEWER', 'ADMIN'].includes(user.role);

  return (
    <div className="report-detail">
      {location.state?.justCreated && <div className="success-banner"><FileCheck2 /><span><strong>Controlled draft saved.</strong> Attach evidence, then submit it for independent review.</span></div>}
      <ErrorNotice>{error}</ErrorNotice>
      <div className="detail-actions"><button className="text-button back" onClick={() => navigate('/tests')}><ArrowLeft size={17} /> All records</button><div><button className="button secondary" onClick={() => window.print()}><Printer size={17} /> Print</button>{issued && <><button className="button secondary" onClick={() => downloadFile(`/api/tests/${test.id}/report.doc`, `${test.certificateNumber}.doc`)}><FileText size={17} /> Editable Word</button><button className="button primary" onClick={() => downloadFile(`/api/tests/${test.id}/report.pdf`, `${test.certificateNumber}.pdf`)}><Download size={17} /> Official PDF</button></>}</div></div>

      <section className="workflow-strip panel">
        {['Draft', 'Submitted', 'Approved'].map((status, index) => {
          const activeIndex = test.status === 'Returned' ? 0 : test.status === 'Revoked' ? 2 : ['Draft', 'Submitted', 'Approved'].indexOf(test.status);
          return <div key={status} className={index <= activeIndex ? 'done' : ''}><span>{index < activeIndex ? '✓' : index + 1}</span><strong>{status}</strong></div>;
        })}
        <StatusBadge status={test.status} />
      </section>

      <section className="certificate-head panel">
        <div className="certificate-id"><span className="eyebrow">{issued ? 'Issued test report' : 'Controlled working record'}</span><h2>{test.certificateNumber}</h2><p>Revision {test.revision} · Rules v{evaluation.ruleVersion}</p></div>
        <div className={`certificate-result ${evaluation.passed ? 'passed' : 'failed'}`}><TestResultIcon passed={evaluation.passed} size="large" /><div><small>Technical result</small><strong>{evaluation.status}</strong><span>{evaluation.complete ? 'All required sections complete' : 'Completion required'}</span></div></div>
        {issued && <div className="certificate-qr"><img src={`/api/tests/${test.id}/qr.png`} alt="Verification QR code" /><span><QrCode size={15} /> Public verification</span></div>}
      </section>

      {(editable || test.status === 'Submitted' || test.status === 'Approved') && <section className="panel control-panel">
        <div><span className="eyebrow">Four-eyes control</span><h3>{editable ? 'Ready the draft for review' : test.status === 'Submitted' ? 'Independent officer review required' : 'This record is approved and locked'}</h3>
          <p>{editable ? `${test.evidence.length} evidence file(s) attached. Every section must be complete and at least one file is required.` : test.status === 'Submitted' ? 'The reviewer must be a different person from the tester. Approval permanently locks the readings and evidence.' : 'Changes require revocation and a new correction revision; silent editing is blocked.'}</p></div>
        <div className="control-actions">
          {editable && canTest && <button className="button primary" disabled={busy} onClick={() => action('submit')}><Send size={17} /> Submit for review</button>}
          {test.status === 'Submitted' && canReview && <div className="review-box"><textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Mandatory reviewer note" /><div><button className="button secondary" disabled={busy} onClick={() => review('RETURN')}><XCircle size={16} /> Return</button><button className="button primary" disabled={busy} onClick={() => review('APPROVE')}><CheckCircle2 size={16} /> Approve and lock</button></div></div>}
          {test.status === 'Approved' && canReview && <button className="button danger-button" disabled={busy} onClick={revoke}>Revoke with reason</button>}
          {['Returned', 'Revoked'].includes(test.status) && canTest && <button className="button secondary" disabled={busy} onClick={() => action('revise')}><RotateCcw size={17} /> Create correction revision</button>}
        </div>
      </section>}

      <div className="report-columns">
        <div className="report-main">
          <section className="panel detail-section"><div className="panel-heading"><div><span className="eyebrow">Test subject</span><h3>Instrument information</h3></div><StatusBadge status={instrument.status} /></div><dl className="detail-list"><div><dt>Manufacturer</dt><dd>{instrument.manufacturer}</dd></div><div><dt>Model</dt><dd>{instrument.model}</dd></div><div><dt>Serial number</dt><dd>{instrument.serialNumber}</dd></div><div><dt>Accuracy class</dt><dd>Class {instrument.accuracyClass}</dd></div><div><dt>Capacity</dt><dd>{instrument.minCapacity} to {instrument.maxCapacity} {instrument.unit}</dd></div><div><dt>Verification interval</dt><dd>{instrument.verificationInterval} {instrument.unit}</dd></div></dl></section>

          <section className="panel detail-section"><div className="panel-heading"><div><span className="eyebrow">Clause 3.5.1, Table 6</span><h3>Weighing performance</h3></div><StatusBadge status={evaluation.sections.performance.passed ? 'PASS' : 'FAIL'} /></div><div className="table-scroll"><table className="calculation-table"><thead><tr><th>Applied load</th><th>Indication</th><th>Corrected error</th><th>Maximum permitted</th><th>Result</th></tr></thead><tbody>{evaluation.sections.performance.results.map((row) => <tr key={row.id}><td>{row.load} {instrument.unit}</td><td>{row.indication} {instrument.unit}</td><td className={row.passed ? '' : 'bad-value'}>{row.error > 0 ? '+' : ''}{row.error}</td><td>+/- {row.mpe}</td><td><StatusBadge status={row.passed ? 'PASS' : 'FAIL'} /></td></tr>)}</tbody></table></div></section>

          <section className="panel detail-section"><div className="panel-heading"><div><span className="eyebrow">Deterministic calculations</span><h3>Complete automated test suite</h3></div></div><div className="support-checks">{Object.values(evaluation.sections).map((section) => <article key={section.name}><TestResultIcon passed={section.passed} /><div><strong>{section.name}</strong><p>{section.summary}</p><small>Clause {section.clause}</small></div><StatusBadge status={section.passed ? 'PASS' : section.complete ? 'FAIL' : 'INCOMPLETE'} /></article>)}</div></section>

          <section className="panel detail-section"><div className="panel-heading"><div><span className="eyebrow">OIML R 76-2 applicability control</span><h3>Conditional and equipment-dependent tests</h3></div><StatusBadge status={evaluation.conditional.passed ? 'PASS' : evaluation.conditional.complete ? 'FAIL' : 'INCOMPLETE'} /></div><div className="table-scroll"><table><thead><tr><th>Test</th><th>Applicability</th><th>Evidence or reason</th><th>Result</th></tr></thead><tbody>{evaluation.conditional.results.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.clause}</small></td><td>{item.applicability}</td><td>{item.applicability === 'Applicable' ? item.evidenceNote : item.reason}</td><td><StatusBadge status={item.result} /></td></tr>)}</tbody></table></div></section>

          <section className="panel detail-section"><div className="panel-heading"><div><span className="eyebrow"><Sparkles size={14} /> Explainable assistance</span><h3>Diagnostic findings</h3></div><span className={`risk-pill ${evaluation.diagnostic.risk.toLowerCase()}`}>{evaluation.diagnostic.risk} risk</span></div><div className="finding-list">{evaluation.diagnostic.findings.map((finding) => <article key={finding.title}><i className={finding.severity} /><div><strong>{finding.title}</strong><p>{finding.detail}</p></div></article>)}</div><div className="method-note"><Info size={17} /><span>{evaluation.diagnostic.method}</span></div></section>

          <section className="panel detail-section"><div className="panel-heading"><div><span className="eyebrow">Inspection evidence</span><h3>Photographs and documents</h3></div>{editable && canTest && <><button className="button secondary small" onClick={() => fileRef.current?.click()} disabled={busy}><Camera size={16} /> {busy ? 'Uploading...' : 'Capture or upload'}</button><input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" onChange={uploadEvidence} /></>}</div>{test.evidence.length ? <div className="evidence-grid">{test.evidence.map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer">{item.type.startsWith('image/') ? <img src={item.url} alt={item.name} /> : <span><Upload /></span>}<strong>{item.name}</strong><small>{new Date(item.uploadedAt).toLocaleString('en-IN')}</small></a>)}</div> : <div className="evidence-empty"><span><Camera /></span><strong>No evidence attached yet</strong><small>Evidence is mandatory before submission.</small></div>}</section>
        </div>

        <aside className="report-aside">
          <section className="panel aside-card"><span className="eyebrow">Test conducted by</span><div className="inspector-profile"><span>{test.inspectorName.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><div><strong>{test.inspectorName}</strong><small>{test.inspectorId}</small></div></div><dl><div><dt>Laboratory</dt><dd>{test.laboratory}</dd></div><div><dt>Created</dt><dd>{new Date(test.createdAt).toLocaleString('en-IN')}</dd></div><div><dt>Environment</dt><dd>{test.temperature} C, {test.humidity}% RH</dd></div>{test.approvedBy && <div><dt>Independent reviewer</dt><dd>{test.approvedBy.name} ({test.approvedBy.officerId})</dd></div>}</dl></section>
          {issued && <section className="panel aside-card verify-card"><span className="verify-shield"><ShieldCheck /></span><h3>{integrityValid ? 'Integrity verified' : 'Integrity warning'}</h3><p>The SHA-256 fingerprint {integrityValid ? 'matches the locked readings, evidence and authorization.' : 'does not match this record. Do not rely on this report.'}</p><code className="hash-code">{test.integrityHash}</code><a className="button primary full" href={`/verify/${test.verificationCode}`} target="_blank" rel="noreferrer">Open public verification <ExternalLink size={16} /></a></section>}
          {test.reviewHistory?.length > 0 && <section className="panel aside-card"><span className="eyebrow">Review history</span>{test.reviewHistory.map((review) => <div className="review-history" key={review.at}><strong>{review.decision}</strong><small>{review.reviewer.name} · {new Date(review.at).toLocaleString('en-IN')}</small><p>{review.comment}</p></div>)}</section>}
          {test.notes && <section className="panel aside-card"><span className="eyebrow">Inspector notes</span><p className="inspector-note">{test.notes}</p></section>}
        </aside>
      </div>
    </div>
  );
}
