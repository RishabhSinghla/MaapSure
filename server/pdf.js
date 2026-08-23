import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { REPORT_SECTIONS } from '../shared/r76Catalog.js';

const colors = { green: '#173f32', ink: '#17211c', muted: '#66736c', line: '#d9e1dc', pale: '#eef3f0', pass: '#16794a', fail: '#b63d32', amber: '#a96610', white: '#ffffff' };
const PAGE = { left: 42, right: 553, top: 104, bottom: 748, width: 511 };

function display(value) {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'Not recorded';
  return String(value);
}

function label(value) {
  return String(value).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function flatten(value, prefix = '', output = []) {
  if (Array.isArray(value)) {
    if (!value.length) output.push([prefix || 'Records', 'None']);
    value.forEach((item, index) => flatten(item, `${prefix}${prefix ? ' ' : ''}[${index + 1}]`, output));
  } else if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, child]) => child !== undefined);
    if (!entries.length && prefix) output.push([prefix, 'None']);
    for (const [key, child] of entries) flatten(child, prefix ? `${prefix} / ${label(key)}` : label(key), output);
  } else output.push([prefix || 'Value', display(value)]);
  return output;
}

function lockedRecord(test, instrument) {
  const submission = test.integrityVersion >= 3 ? test.approvalSnapshot : test.approvalSnapshot?.submission || test.submissionSnapshot || test;
  return {
    ...submission,
    instrumentSnapshot: submission.instrumentSnapshot || instrument,
    evidenceManifest: submission.evidenceManifest || submission.evidence || test.evidence || [],
    reviewHistory: test.approvalSnapshot?.reviewHistory || test.reviewHistory || [],
    approvedAt: test.approvedAt,
    approvedBy: test.approvedBy,
  };
}

function reportOutcome(section) {
  if (section.applicability !== 'Applicable') return 'NOT APPLICABLE';
  if (!section.complete) return 'INCOMPLETE';
  return section.passed ? 'PASS' : 'FAIL';
}

function decisionEvidence(value = {}, fallback = '') {
  return [fallback || value.notes, Array.isArray(value.evidenceIds) && value.evidenceIds.length && `Evidence: ${value.evidenceIds.join(', ')}`, value.examinerName && `Examiner: ${value.examinerName}`, value.examinerRole && `Role: ${value.examinerRole}`, value.signedAt && `Signed: ${value.signedAt}`, value.authorityDecisionReference && `Authority decision: ${value.authorityDecisionReference}`].filter(Boolean).join(' · ');
}

export async function createReportPdf({ test, instrument, verificationUrl }) {
  const record = lockedRecord(test, instrument); const evaluation = record.evaluation || test.evaluation; const dossier = record.instrumentSnapshot || instrument;
  const qrData = await QRCode.toDataURL(verificationUrl, { margin: 1, width: 180, color: { dark: colors.green } });
  const qrBuffer = Buffer.from(qrData.split(',')[1], 'base64');
  const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: 34, bottom: 42, left: PAGE.left, right: 42 }, info: { Title: `MaapSure governed OIML R 76 type-evaluation record ${test.certificateNumber}`, Author: 'MaapSure controlled reporting system', Subject: `${evaluation.standard} / ${evaluation.reportFormat}`, Keywords: 'OIML R 76 type evaluation model approval NAWI' } });
  const buffers = []; doc.on('data', (chunk) => buffers.push(chunk));
  let y = PAGE.top; let chapter = 'Governed type-evaluation record';

  function pageHeader(title = chapter) {
    doc.roundedRect(PAGE.left, 32, 38, 38, 8).fill(colors.green);
    doc.font('Helvetica-Bold').fontSize(16).fillColor(colors.white).text('M', PAGE.left + 13, 43);
    doc.font('Helvetica-Bold').fontSize(16).fillColor(colors.green).text('MaapSure', 90, 35);
    doc.font('Helvetica').fontSize(6.8).fillColor(colors.muted).text('CONTROLLED MODEL-APPROVAL / TYPE-EVALUATION RECORD', 91, 57);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.ink).text(title, 305, 37, { width: 248, align: 'right' });
    doc.font('Helvetica').fontSize(7).fillColor(colors.muted).text(`${test.certificateNumber} · revision ${test.revision}`, 305, 55, { width: 248, align: 'right' });
    doc.moveTo(PAGE.left, 82).lineTo(PAGE.right, 82).strokeColor(colors.line).lineWidth(0.6).stroke();
  }
  function nextPage(title = chapter) { chapter = title; doc.addPage(); pageHeader(title); y = PAGE.top; }
  function ensure(height, title = chapter) { if (y + height > PAGE.bottom) nextPage(title); }
  function heading(title, subtitle = '', level = 1) {
    const titleSize = level === 1 ? 13 : 10; const subtitleHeight = subtitle ? doc.font('Helvetica').fontSize(7.2).heightOfString(subtitle, { width: PAGE.width - 22 }) + 5 : 0;
    const height = 31 + subtitleHeight; ensure(height, title); chapter = title;
    doc.roundedRect(PAGE.left, y, PAGE.width, height, 5).fill(level === 1 ? colors.pale : '#f7f9f8');
    doc.font('Helvetica-Bold').fontSize(titleSize).fillColor(colors.green).text(title, PAGE.left + 11, y + 8, { width: PAGE.width - 22 });
    if (subtitle) doc.font('Helvetica').fontSize(7.2).fillColor(colors.muted).text(subtitle, PAGE.left + 11, y + 24, { width: PAGE.width - 22 });
    y += height + 7;
  }
  function paragraph(text, options = {}) {
    const width = options.width || PAGE.width; doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.size || 7.7);
    const height = doc.heightOfString(display(text), { width, lineGap: 1.5 }) + 7; ensure(height);
    doc.fillColor(options.color || colors.ink).text(display(text), PAGE.left, y, { width, lineGap: 1.5 }); y += height;
  }
  function table(headers, rows, widths, options = {}) {
    const total = widths.reduce((sum, width) => sum + width, 0); const normalized = widths.map((width) => width * PAGE.width / total);
    const drawRow = (cells, isHeader = false, index = 0) => {
      doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHeader ? 6.7 : 6.9);
      const heights = cells.map((cell, cellIndex) => doc.heightOfString(display(cell), { width: normalized[cellIndex] - 10, lineGap: 1 }));
      const height = Math.max(options.minimumRowHeight || 20, Math.max(...heights) + 10); ensure(height);
      if (isHeader || options.striped && index % 2) doc.rect(PAGE.left, y, PAGE.width, height).fill(isHeader ? '#e8efeb' : '#fafbfa');
      let x = PAGE.left;
      cells.forEach((cell, cellIndex) => { doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHeader ? 6.7 : 6.9).fillColor(isHeader ? colors.green : colors.ink).text(display(cell), x + 5, y + 5, { width: normalized[cellIndex] - 10, lineGap: 1 }); x += normalized[cellIndex]; });
      doc.moveTo(PAGE.left, y + height).lineTo(PAGE.right, y + height).strokeColor(colors.line).lineWidth(0.45).stroke(); y += height;
    };
    ensure(22); drawRow(headers, true);
    rows.forEach((row, index) => drawRow(row, false, index)); y += 7;
  }
  function keyValueRows(value, emptyMessage = 'No information recorded.') {
    const rows = flatten(value); if (!rows.length) { paragraph(emptyMessage, { color: colors.muted }); return; }
    table(['Field', 'Recorded value'], rows, [185, 326], { striped: true });
  }

  pageHeader('Controlled governed record');
  const resultColor = test.status === 'Revoked' ? colors.amber : evaluation.passed ? colors.pass : colors.fail;
  doc.roundedRect(PAGE.left, y, PAGE.width, 60, 7).fill(test.status === 'Revoked' ? '#fff3d9' : evaluation.passed ? '#e6f5ec' : '#fbeae8');
  doc.font('Helvetica-Bold').fontSize(7).fillColor(resultColor).text('WORKFLOW STATE', PAGE.left + 13, y + 13);
  doc.font('Helvetica-Bold').fontSize(17).fillColor(resultColor).text(test.status.toUpperCase(), PAGE.left + 13, y + 27);
  doc.font('Helvetica-Bold').fontSize(7).fillColor(resultColor).text('TECHNICAL RESULT', PAGE.left + 275, y + 13, { width: 220, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(15).fillColor(resultColor).text(evaluation.status, PAGE.left + 250, y + 28, { width: 245, align: 'right' }); y += 72;
  if (record.input?.demoFixture) { doc.roundedRect(PAGE.left, y, PAGE.width, 40, 5).fill('#fff7e7'); doc.font('Helvetica-Bold').fontSize(8.5).fillColor(colors.amber).text('SYNTHETIC SIH DEMONSTRATION DATA — NOT A PHYSICAL-LABORATORY OR STATUTORY CERTIFICATE', PAGE.left + 11, y + 10, { width: PAGE.width - 22, align: 'center' }); y += 50; }
  heading('Report identity', `${evaluation.standard} · ${evaluation.reportFormat} · model approval / type evaluation`);
  table(['Field', 'Controlled value'], [
    ['Certificate / report number', record.certificateNumber || test.certificateNumber], ['Application number', dossier.applicationNumber], ['Applicant', dossier.applicant], ['Manufacturer', dossier.manufacturer], ['Type designation', dossier.typeDesignation || dossier.model], ['Identification / specimen', dossier.serialNumber], ['Laboratory', record.laboratory], ['Rules profile', `${evaluation.ruleProfileId} v${evaluation.ruleVersion}`], ['Rules catalog SHA-256', record.ruleSnapshot?.contentHash], ['Executable engine SHA-256', record.ruleSnapshot?.engineArtifactHash], ['Digital disposition progress', `${evaluation.coverage.completedChecks}/${evaluation.coverage.totalChecks} applicable mapped checks (${evaluation.coverage.percent}%)`],
  ], [180, 331], { striped: true });
  heading('Independent authorization');
  table(['Role', 'Identity', 'Date / action'], [
    ['Observer', `${record.inspectorName} (${record.inspectorId})`, record.createdAt], ['Submitter', `${record.inspectorName} (${record.inspectorId})`, record.submittedAt], ['Independent reviewer', `${test.approvedBy?.name || 'Not approved'} (${test.approvedBy?.officerId || '-'})`, test.approvedAt], ['Current state', test.status, test.revokedAt ? `${test.revokedAt} · ${test.revocationReason}` : 'No revocation recorded'],
  ], [115, 215, 181], { striped: true });
  heading('Public verification and database consistency');
  ensure(112); doc.image(qrBuffer, PAGE.left, y, { width: 94, height: 94 });
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(colors.ink).text('Scan or open the URL to verify current status', PAGE.left + 111, y + 3, { width: 390 });
  doc.font('Helvetica').fontSize(7).fillColor(colors.green).text(verificationUrl, PAGE.left + 111, y + 20, { width: 390, link: verificationUrl, underline: true });
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(colors.muted).text('ISSUED-CONTENT SHA-256', PAGE.left + 111, y + 45);
  doc.font('Courier').fontSize(6).fillColor(colors.ink).text(test.integrityHash || 'Not issued', PAGE.left + 111, y + 57, { width: 390 });
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(colors.muted).text('CURRENT-STATUS SHA-256', PAGE.left + 111, y + 76);
  doc.font('Courier').fontSize(6).fillColor(colors.ink).text(test.statusIntegrityHash || 'Not issued', PAGE.left + 111, y + 88, { width: 390 }); y += 108;

  nextPage('Type dossier and traceability');
  heading('Submitted type dossier', 'The issued report uses this locked snapshot, not the mutable instrument register.');
  const { features = {}, ...identity } = dossier; keyValueRows(identity);
  heading('Instrument feature questionnaire', 'These declarations drive automatic applicability and locked not-applicable decisions.'); keyValueRows(features);
  heading('Test environment'); keyValueRows(record.environment || {});
  heading('Test-equipment and calibration register', 'Equipment identifiers are also linked inside each applicable test section.');
  if (record.input?.equipment?.length) record.input.equipment.forEach((item, index) => { heading(`Equipment ${index + 1}: ${item.name || item.id}`, '', 2); keyValueRows(item); }); else paragraph('No equipment recorded.', { color: colors.fail, bold: true });

  nextPage('R 76-2 report-section manifest');
  heading('R 76-2 ordered digital section manifest', 'All distinct branches under tests 7, 12, 13 and 15 are separately represented; physical method validity remains subject to authorized laboratory review.');
  table(['No.', 'Test or examination', 'Procedure / requirement', 'Applicability', 'Outcome'], REPORT_SECTIONS.map((definition) => { const section = evaluation.sections[definition.id] || {}; return [definition.number, definition.name, `${definition.procedure} / ${definition.requirement}`, `${section.applicability}: ${section.applicabilityReason || ''}`, reportOutcome(section)]; }), [35, 138, 125, 150, 63], { striped: true });

  for (const definition of REPORT_SECTIONS.filter((item) => !['requirements', 'checklist'].includes(item.mode))) {
    const section = evaluation.sections[definition.id] || {}; nextPage(`${definition.number} · ${definition.name}`);
    heading(`${definition.number} · ${definition.name}`, `${definition.procedure} · requirement ${definition.requirement}`);
    table(['Applicability', 'Completion', 'Outcome'], [[`${section.applicability}: ${section.applicabilityReason || ''}`, section.complete ? 'Complete' : 'Incomplete', reportOutcome(section)]], [285, 105, 121]);
    paragraph(section.summary || 'No evaluation summary recorded.', { bold: true });
    heading('Procedure and pass basis', definition.description, 2); paragraph(`${definition.procedure}. ${definition.requirement}. ${definition.description}`);
    heading('Recorded observations and evidence links', '', 2); keyValueRows(record.input?.sections?.[definition.id] || {});
    heading('Server-calculated result record', 'Values below were freshly derived by the locked rules profile.', 2);
    const derived = Object.fromEntries(Object.entries(section).filter(([key]) => !['id', 'number', 'name', 'procedure', 'requirement', 'description', 'applicability', 'applicabilityReason'].includes(key)));
    keyValueRows(derived);
  }

  nextPage('Construction and documentation examination');
  heading('16 · Examination of construction', 'Administrative dossier, construction, markings, modules, interfaces and software conformity evidence.');
  keyValueRows(record.input?.sections?.construction || {});

  nextPage('Governed R 76-1 requirement-family matrix');
  heading('R 76-1 normative clause-family disposition', 'R 76-2 itself warns that its checklist is a summary; this separate fail-closed matrix records additional disposition paths and does not replace R 76-1.');
  table(['Clause', 'Requirement family', 'Applicability and reason', 'Evidence / authority disposition', 'Outcome'], (evaluation.requirements || []).map((row) => { const value = record.input?.requirements?.[row.clause] || {}; return [row.clause, row.title, `${row.applicability}: ${row.applicabilityReason}`, decisionEvidence(value, row.note), row.outcome]; }), [45, 128, 155, 120, 63], { striped: true });

  nextPage('Detailed checklist and supplement');
  heading('17 · R 76-2 checklist plus additional fail-closed rows', 'Every digitally mapped row is retained with its applicability reason, observation and named disposition. R 76-1 remains the controlling recommendation.');
  table(['ID / clause', 'Requirement', 'Source', 'Applicability', 'Evidence / authority disposition', 'Outcome'], (evaluation.checklist || []).map((row) => { const key = row.id || row.clause; const value = record.input?.checklist?.[key] || {}; return [key, row.text || row.title, row.source || '', `${row.applicability}: ${row.applicabilityReason}`, decisionEvidence(value, row.note), row.outcome]; }), [61, 157, 54, 104, 82, 53], { striped: true });

  nextPage('Evidence, review and lineage');
  heading('Evidence manifest with byte-level hashes');
  if (record.evidenceManifest.length) table(['File', 'Section', 'Purpose', 'Size', 'Uploaded', 'SHA-256'], record.evidenceManifest.map((item) => [item.name, item.sectionId, item.note, `${item.size ?? 0} bytes`, `${item.uploadedAt || ''} · ${item.uploadedBy || ''}`, item.fileSha256]), [100, 52, 105, 50, 84, 120], { striped: true }); else paragraph('No evidence files are present.', { color: colors.fail, bold: true });
  heading('Review history');
  if (record.reviewHistory.length) table(['Decision', 'Reviewer', 'Date', 'Comment'], record.reviewHistory.map((item) => [item.decision, `${item.reviewer?.name || ''} (${item.reviewer?.officerId || ''})`, item.at, item.comment]), [62, 135, 105, 209], { striped: true }); else paragraph('No review history recorded.');
  heading('Revision and record controls'); keyValueRows({ rootRecordId: record.rootId, recordId: record.id, parentTestId: test.parentTestId, revision: test.revision, recordVersion: test.recordVersion, rulesCatalogHash: record.ruleSnapshot?.contentHash, executableEngineHash: record.ruleSnapshot?.engineArtifactHash, issuedContentHash: test.integrityHash, currentStatusHash: test.statusIntegrityHash, currentStatus: test.status, revokedAt: test.revokedAt, revocationReason: test.revocationReason, integrityNotice: 'SHA-256 provides internal consistency checking. Government deployment should add an external HSM-backed signature or WORM anchor.' });
  heading('Authority notice');
  paragraph('This system provides governed calculation, completeness, traceability and report-generation support for OIML R 76 model approval / type evaluation. Statutory interpretation, witness of physical tests, approval and legal acceptance remain with the responsible Legal Metrology authority and its authorized experts.', { bold: true, color: colors.green });

  const pageRange = doc.bufferedPageRange();
  for (let pageIndex = pageRange.start; pageIndex < pageRange.start + pageRange.count; pageIndex += 1) {
    doc.switchToPage(pageIndex); doc.moveTo(PAGE.left, 772).lineTo(PAGE.right, 772).strokeColor(colors.line).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(6.4).fillColor(colors.muted).text(record.input?.demoFixture ? 'SYNTHETIC SIH DEMONSTRATION — NOT A STATUTORY CERTIFICATE' : 'Controlled decision-support record; statutory authority remains with the responsible Legal Metrology authority.', PAGE.left, 782, { width: 410 });
    doc.text(`Page ${pageIndex - pageRange.start + 1} of ${pageRange.count}`, 465, 782, { width: 88, align: 'right' });
  }
  return new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(buffers))); doc.on('error', reject); doc.end(); });
}
