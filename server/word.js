import { REPORT_SECTIONS } from '../shared/r76Catalog.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const display = (value) => value === null || value === undefined || value === '' ? 'Not recorded' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value);
const human = (value) => String(value).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, (letter) => letter.toUpperCase());

function flatten(value, prefix = '', output = []) {
  if (Array.isArray(value)) {
    if (!value.length) output.push([prefix || 'Records', 'None']);
    value.forEach((item, index) => flatten(item, `${prefix}${prefix ? ' ' : ''}[${index + 1}]`, output));
  } else if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, child]) => child !== undefined);
    if (!entries.length && prefix) output.push([prefix, 'None']);
    entries.forEach(([key, child]) => flatten(child, prefix ? `${prefix} / ${human(key)}` : human(key), output));
  } else output.push([prefix || 'Value', display(value)]);
  return output;
}

function rows(items, widths = '') {
  return `<table${widths ? ` class="${widths}"` : ''}><thead><tr><th>Field</th><th>Recorded value</th></tr></thead><tbody>${flatten(items).map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}</tbody></table>`;
}

function outcome(section = {}) {
  if (section.applicability !== 'Applicable') return 'NOT APPLICABLE';
  if (!section.complete) return 'INCOMPLETE';
  return section.passed ? 'PASS' : 'FAIL';
}

function decisionEvidence(value = {}, fallback = '') {
  return [fallback || value.notes, Array.isArray(value.evidenceIds) && value.evidenceIds.length && `Evidence: ${value.evidenceIds.join(', ')}`, value.examinerName && `Examiner: ${value.examinerName}`, value.examinerRole && `Role: ${value.examinerRole}`, value.signedAt && `Signed: ${value.signedAt}`, value.authorityDecisionReference && `Authority decision: ${value.authorityDecisionReference}`].filter(Boolean).join(' · ');
}

function lockedRecord(test, instrument) {
  const submission = test.integrityVersion >= 3 ? test.approvalSnapshot : test.approvalSnapshot?.submission || test.submissionSnapshot || test;
  return { ...submission, instrumentSnapshot: submission.instrumentSnapshot || instrument, evidenceManifest: submission.evidenceManifest || submission.evidence || test.evidence || [], reviewHistory: test.approvalSnapshot?.reviewHistory || test.reviewHistory || [] };
}

export function createEditableReport({ test, instrument, verificationUrl }) {
  const record = lockedRecord(test, instrument); const evaluation = record.evaluation || test.evaluation; const dossier = record.instrumentSnapshot || instrument; const { features = {}, ...identity } = dossier;
  const sectionManifest = REPORT_SECTIONS.map((definition) => { const section = evaluation.sections[definition.id] || {}; return `<tr><td>${escapeHtml(definition.number)}</td><td>${escapeHtml(definition.name)}</td><td>${escapeHtml(`${definition.procedure} / ${definition.requirement}`)}</td><td>${escapeHtml(`${section.applicability}: ${section.applicabilityReason || ''}`)}</td><td class="${outcome(section) === 'PASS' ? 'pass' : outcome(section) === 'FAIL' ? 'fail' : ''}">${escapeHtml(outcome(section))}</td></tr>`; }).join('');
  const sectionDetails = REPORT_SECTIONS.filter((item) => !['requirements', 'checklist'].includes(item.mode)).map((definition) => { const section = evaluation.sections[definition.id] || {}; const derived = Object.fromEntries(Object.entries(section).filter(([key]) => !['id', 'number', 'name', 'procedure', 'requirement', 'description', 'applicability', 'applicabilityReason'].includes(key))); return `<section class="new-page"><h2>${escapeHtml(definition.number)} · ${escapeHtml(definition.name)}</h2><div class="notice"><b>${escapeHtml(outcome(section))}</b> · ${escapeHtml(section.applicability)} — ${escapeHtml(section.applicabilityReason)}<br>${escapeHtml(section.summary)}</div><h3>Procedure and pass basis</h3><p>${escapeHtml(`${definition.procedure}. ${definition.requirement}. ${definition.description}`)}</p><h3>Recorded observations and evidence links</h3>${rows(record.input?.sections?.[definition.id] || {})}<h3>Server-calculated result record</h3>${rows(derived)}</section>`; }).join('');
  const requirements = (evaluation.requirements || []).map((row) => { const value = record.input?.requirements?.[row.clause] || {}; return `<tr><td>${escapeHtml(row.clause)}</td><td>${escapeHtml(row.title)}</td><td>${escapeHtml(`${row.applicability}: ${row.applicabilityReason}`)}</td><td>${escapeHtml(decisionEvidence(value, row.note))}</td><td>${escapeHtml(row.outcome)}</td></tr>`; }).join('');
  const checklist = (evaluation.checklist || []).map((row) => { const key = row.id || row.clause; const value = record.input?.checklist?.[key] || {}; return `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(row.text || row.title)}</td><td>${escapeHtml(row.source || '')}</td><td>${escapeHtml(`${row.applicability}: ${row.applicabilityReason}`)}</td><td>${escapeHtml(decisionEvidence(value, row.note))}</td><td>${escapeHtml(row.outcome)}</td></tr>`; }).join('');
  const equipment = (record.input?.equipment || []).map((item, index) => `<h3>Equipment ${index + 1}: ${escapeHtml(item.name || item.id)}</h3>${rows(item)}`).join('') || '<p>No equipment recorded.</p>';
  const evidence = (record.evidenceManifest || []).map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.sectionId)}</td><td>${escapeHtml(item.note)}</td><td>${escapeHtml(item.size)}</td><td class="hash">${escapeHtml(item.fileSha256)}</td></tr>`).join('');
  const reviews = (record.reviewHistory || []).map((item) => `<tr><td>${escapeHtml(item.decision)}</td><td>${escapeHtml(`${item.reviewer?.name || ''} (${item.reviewer?.officerId || ''})`)}</td><td>${escapeHtml(item.at)}</td><td>${escapeHtml(item.comment)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(test.certificateNumber)} uncontrolled editable copy</title>
  <style>@page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;color:#17211c;margin:0;line-height:1.35;font-size:10pt}h1{color:#173f32;margin:0 0 4px}h2{margin:24px 0 8px;color:#173f32;border-bottom:2px solid #173f32;padding-bottom:5px;page-break-after:avoid}h3{margin:18px 0 6px;color:#315f4d;page-break-after:avoid}.meta{color:#66736c;font-size:9pt}.banner{padding:14px;background:#fff3cd;border:2px solid #a96610;margin:18px 0;font-size:11pt}.demo{padding:12px;background:#fff0dc;color:#8a5110;font-weight:bold;text-align:center}.notice{padding:10px;background:#eef5f1;border-left:5px solid #173f32;margin:10px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 25px}table{width:100%;border-collapse:collapse;font-size:8pt;margin:6px 0 14px;page-break-inside:auto}tr{page-break-inside:avoid}th,td{border:1px solid #cfd9d3;padding:5px;text-align:left;vertical-align:top;word-break:break-word}th{background:#edf3ef;color:#173f32}.pass{color:#16794a;font-weight:bold}.fail{color:#b63d32;font-weight:bold}.hash{font-family:monospace;font-size:7pt;word-break:break-all}.new-page{page-break-before:always}.foot{margin-top:30px;padding-top:12px;border-top:1px solid #ccc;color:#66736c;font-size:8pt}</style></head><body>
  <h1>MaapSure governed OIML R 76 type-evaluation record</h1><div class="meta">UNCONTROLLED EDITABLE COPY · verify against the issued digital record</div>
  <div class="banner"><b>${escapeHtml(test.status.toUpperCase())} · TECHNICAL RESULT ${escapeHtml(evaluation.status)}</b><br>Report ${escapeHtml(test.certificateNumber)} · revision ${escapeHtml(test.revision)} · ${escapeHtml(evaluation.standard)} / ${escapeHtml(evaluation.reportFormat)}</div>
  ${record.input?.demoFixture ? '<div class="demo">SYNTHETIC SIH DEMONSTRATION DATA — NOT A PHYSICAL-LABORATORY OR STATUTORY CERTIFICATE</div>' : ''}
  <h2>Report identity and authorization</h2>${rows({ certificateNumber: record.certificateNumber || test.certificateNumber, applicationNumber: dossier.applicationNumber, applicant: dossier.applicant, laboratory: record.laboratory, observer: `${record.inspectorName} (${record.inspectorId})`, submittedAt: record.submittedAt, independentReviewer: `${test.approvedBy?.name || ''} (${test.approvedBy?.officerId || ''})`, approvedAt: test.approvedAt, rulesProfile: `${evaluation.ruleProfileId} v${evaluation.ruleVersion}`, rulesCatalogSha256: record.ruleSnapshot?.contentHash, executableEngineSha256: record.ruleSnapshot?.engineArtifactHash, digitalDispositionProgress: `${evaluation.coverage.completedChecks}/${evaluation.coverage.totalChecks} (${evaluation.coverage.percent}%)` })}
  <h2>Submitted type dossier</h2>${rows(identity)}<h2>Instrument feature questionnaire</h2>${rows(features)}<h2>Environment</h2>${rows(record.environment || {})}<h2>Test-equipment and calibration register</h2>${equipment}
  <section class="new-page"><h2>R 76-2 ordered digital report-section manifest</h2><p>Physical method validity remains subject to authorized laboratory review.</p><table><thead><tr><th>No.</th><th>Test or examination</th><th>Procedure / requirement</th><th>Applicability</th><th>Outcome</th></tr></thead><tbody>${sectionManifest}</tbody></table></section>
  ${sectionDetails}
  <section class="new-page"><h2>16 · Examination of construction</h2>${rows(record.input?.sections?.construction || {})}</section>
  <section class="new-page"><h2>Governed R 76-1 requirement-family matrix</h2><p>R 76-2 states that its checklist is a summary. This fail-closed matrix records additional disposition paths and does not replace R 76-1.</p><table><thead><tr><th>Clause</th><th>Requirement</th><th>Applicability</th><th>Evidence / authority disposition</th><th>Outcome</th></tr></thead><tbody>${requirements}</tbody></table></section>
  <section class="new-page"><h2>17 · Detailed R 76-2 checklist plus additional fail-closed rows</h2><table><thead><tr><th>ID / clause</th><th>Requirement</th><th>Source</th><th>Applicability</th><th>Evidence / authority disposition</th><th>Outcome</th></tr></thead><tbody>${checklist}</tbody></table></section>
  <section class="new-page"><h2>Evidence manifest with byte hashes</h2><table><thead><tr><th>File</th><th>Section</th><th>Purpose</th><th>Size</th><th>SHA-256</th></tr></thead><tbody>${evidence}</tbody></table><h2>Review history</h2><table><thead><tr><th>Decision</th><th>Reviewer</th><th>Date</th><th>Comment</th></tr></thead><tbody>${reviews}</tbody></table><h2>Digital consistency and lineage</h2>${rows({ publicVerification: verificationUrl, rootRecordId: record.rootId, recordId: record.id, revision: test.revision, recordVersion: test.recordVersion, rulesCatalogSha256: record.ruleSnapshot?.contentHash, executableEngineSha256: record.ruleSnapshot?.engineArtifactHash, issuedContentSha256: test.integrityHash, currentStatusSha256: test.statusIntegrityHash, currentStatus: test.status, revokedAt: test.revokedAt, revocationReason: test.revocationReason, integrityNotice: 'SHA-256 provides internal consistency checking. Government deployment should add an external HSM-backed signature or WORM anchor.' })}</section>
  <div class="foot"><b>Authority notice:</b> This editable file is not the issued record. MaapSure provides governed calculation, completeness, traceability and reporting support. Statutory interpretation, witness of physical tests, approval and legal acceptance remain with the responsible Legal Metrology authority.</div>
  </body></html>`;
}
