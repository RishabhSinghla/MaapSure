const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
const resultClass = (passed) => passed ? 'pass' : 'fail';

export function createEditableReport({ test, instrument, verificationUrl }) {
  const automaticRows = Object.values(test.evaluation.sections).map((item) => `
    <tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.clause)}</td><td>${escapeHtml(item.summary)}</td><td class="${resultClass(item.passed)}">${item.passed ? 'PASS' : item.complete ? 'FAIL' : 'INCOMPLETE'}</td></tr>`).join('');
  const conditionalRows = test.evaluation.conditional.results.map((item) => `
    <tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.applicability)}</td><td>${escapeHtml(item.applicability === 'Applicable' ? item.evidenceNote : item.reason)}</td><td class="${resultClass(item.passed)}">${escapeHtml(item.result)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(test.certificateNumber)}</title>
  <style>body{font-family:Arial,sans-serif;color:#17211c;margin:36px;line-height:1.35}h1{color:#173f32;margin-bottom:4px}h2{margin-top:28px;color:#173f32;border-bottom:2px solid #173f32;padding-bottom:5px}.meta{color:#66736c;font-size:11px}.banner{padding:15px;background:#eef5f1;border-left:5px solid #173f32;margin:20px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 30px}.field{padding:7px 0;border-bottom:1px solid #ddd}.field b{display:block;font-size:10px;color:#66736c;text-transform:uppercase}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #cfd9d3;padding:7px;text-align:left}th{background:#edf3ef}.pass{color:#16794a;font-weight:bold}.fail{color:#b63d32;font-weight:bold}.hash{font-family:monospace;font-size:9px;word-break:break-all}.foot{margin-top:30px;padding-top:12px;border-top:1px solid #ccc;color:#66736c;font-size:9px}</style></head><body>
  <h1>MaapSure controlled test report</h1><div class="meta">Editable working copy generated from the approved digital record</div>
  <div class="banner"><b>${escapeHtml(test.status.toUpperCase())} · TECHNICAL RESULT ${escapeHtml(test.evaluation.status)}</b><br>Certificate ${escapeHtml(test.certificateNumber)} · Revision ${escapeHtml(test.revision)}</div>
  <h2>Instrument and authorization</h2><div class="grid">
  <div class="field"><b>Manufacturer</b>${escapeHtml(instrument.manufacturer)}</div><div class="field"><b>Model</b>${escapeHtml(instrument.model)}</div>
  <div class="field"><b>Serial number</b>${escapeHtml(instrument.serialNumber)}</div><div class="field"><b>Accuracy class</b>${escapeHtml(instrument.accuracyClass)}</div>
  <div class="field"><b>Capacity</b>${escapeHtml(instrument.minCapacity)} to ${escapeHtml(instrument.maxCapacity)} ${escapeHtml(instrument.unit)}</div><div class="field"><b>Verification interval</b>${escapeHtml(instrument.verificationInterval)} ${escapeHtml(instrument.unit)}</div>
  <div class="field"><b>Tester</b>${escapeHtml(test.inspectorName)} (${escapeHtml(test.inspectorId)})</div><div class="field"><b>Independent reviewer</b>${escapeHtml(test.approvedBy?.name)} (${escapeHtml(test.approvedBy?.officerId)})</div>
  <div class="field"><b>Laboratory</b>${escapeHtml(test.laboratory)}</div><div class="field"><b>Approved</b>${escapeHtml(new Date(test.approvedAt).toLocaleString('en-IN'))}</div></div>
  <h2>Automatically calculated tests</h2><table><thead><tr><th>Test</th><th>Clause</th><th>Calculation summary</th><th>Result</th></tr></thead><tbody>${automaticRows}</tbody></table>
  <h2>Conditional and equipment-dependent tests</h2><table><thead><tr><th>Test</th><th>Applicability</th><th>Evidence or reason</th><th>Result</th></tr></thead><tbody>${conditionalRows}</tbody></table>
  <h2>Control and verification</h2><div class="field"><b>Rules profile</b>${escapeHtml(test.evaluation.ruleProfileId)} · version ${escapeHtml(test.evaluation.ruleVersion)}</div>
  <div class="field"><b>Public verification</b>${escapeHtml(verificationUrl)}</div><div class="field"><b>SHA-256 integrity fingerprint</b><span class="hash">${escapeHtml(test.integrityHash)}</span></div>
  <div class="foot">This editable file is a convenience copy. Verify the fingerprint and current report state on the public verification page. Statutory authority remains with the authorized Legal Metrology authority.</div>
  </body></html>`;
}
