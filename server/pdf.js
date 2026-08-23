import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const colors = { green: '#173f32', ink: '#17211c', muted: '#66736c', line: '#d9e1dc', pale: '#eef3f0', pass: '#16794a', fail: '#b63d32', amber: '#a96610' };

function header(doc, test, title) {
  doc.roundedRect(44, 38, 42, 42, 9).fill(colors.green);
  doc.font('Helvetica-Bold').fontSize(18).fillColor('white').text('M', 56, 50);
  doc.font('Helvetica-Bold').fontSize(19).fillColor(colors.green).text('MaapSure', 98, 40);
  doc.font('Helvetica').fontSize(7.5).fillColor(colors.muted).text('CONTROLLED LEGAL METROLOGY RECORD', 99, 65);
  doc.font('Helvetica-Bold').fontSize(14).fillColor(colors.ink).text(title, 340, 42, { width: 210, align: 'right' });
  doc.font('Helvetica').fontSize(8).fillColor(colors.muted).text(test.certificateNumber, 340, 63, { width: 210, align: 'right' });
  doc.moveTo(44, 92).lineTo(551, 92).strokeColor(colors.line).stroke();
}

function footer(doc, page) {
  doc.moveTo(44, 765).lineTo(551, 765).strokeColor(colors.line).stroke();
  doc.font('Helvetica').fontSize(7).fillColor(colors.muted).text('Decision-support record. Statutory approval remains with the authorized Legal Metrology authority.', 44, 775, { width: 430 });
  doc.text(`Page ${page}`, 500, 775, { width: 50, align: 'right' });
}

function titleBar(doc, title, y) {
  doc.roundedRect(44, y, 507, 24, 4).fill(colors.pale);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(colors.green).text(title, 54, y + 7);
}

function field(doc, label, value, x, y, width = 230) {
  doc.font('Helvetica').fontSize(7.5).fillColor(colors.muted).text(label.toUpperCase(), x, y, { width });
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(colors.ink).text(String(value ?? 'Not recorded'), x, y + 12, { width });
}

function tableRow(doc, cells, widths, y, options = {}) {
  let x = 44; const height = options.height || 28;
  if (options.header) doc.rect(44, y, widths.reduce((sum, width) => sum + width, 0), height).fill('#f5f7f6');
  doc.font(options.header ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.header ? 7.5 : 7.8).fillColor(options.header ? colors.muted : colors.ink);
  cells.forEach((cell, index) => { doc.text(String(cell ?? ''), x + 5, y + 7, { width: widths[index] - 10, align: index === cells.length - 1 ? 'right' : 'left', ellipsis: true }); x += widths[index]; });
  doc.moveTo(44, y + height).lineTo(551, y + height).strokeColor(colors.line).lineWidth(0.5).stroke();
}

export async function createReportPdf({ test, instrument, verificationUrl }) {
  const qrData = await QRCode.toDataURL(verificationUrl, { margin: 1, width: 180, color: { dark: colors.green } });
  const qrBuffer = Buffer.from(qrData.split(',')[1], 'base64');
  const doc = new PDFDocument({ size: 'A4', margins: { top: 38, bottom: 35, left: 44, right: 44 }, info: { Title: `MaapSure ${test.certificateNumber}`, Author: 'MaapSure controlled reporting system', Subject: test.evaluation.standard } });
  const buffers = []; doc.on('data', (chunk) => buffers.push(chunk));

  header(doc, test, 'Controlled test report');
  const resultColor = test.status === 'Revoked' ? colors.amber : test.evaluation.passed ? colors.pass : colors.fail;
  doc.roundedRect(44, 112, 507, 65, 8).fill(test.status === 'Revoked' ? '#fff3d9' : test.evaluation.passed ? '#e6f5ec' : '#fbeae8');
  doc.font('Helvetica-Bold').fontSize(8).fillColor(resultColor).text('REPORT STATE', 58, 127);
  doc.font('Helvetica-Bold').fontSize(18).fillColor(resultColor).text(test.status.toUpperCase(), 58, 141);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(resultColor).text('TECHNICAL RESULT', 305, 127, { width: 225, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(18).fillColor(resultColor).text(test.evaluation.status, 305, 141, { width: 225, align: 'right' });

  titleBar(doc, 'Instrument and laboratory', 197);
  field(doc, 'Manufacturer', instrument.manufacturer, 54, 233);
  field(doc, 'Model', instrument.model, 305, 233);
  field(doc, 'Serial number', instrument.serialNumber, 54, 274);
  field(doc, 'Accuracy class', `Class ${instrument.accuracyClass}`, 305, 274);
  field(doc, 'Capacity', `${instrument.minCapacity} to ${instrument.maxCapacity} ${instrument.unit}`, 54, 315);
  field(doc, 'Verification interval', `${instrument.verificationInterval} ${instrument.unit}`, 305, 315);
  field(doc, 'Laboratory', test.laboratory, 54, 356);
  field(doc, 'Environment', `${test.temperature} C, ${test.humidity}% RH`, 305, 356);

  titleBar(doc, 'Independent authorization', 401);
  field(doc, 'Test conducted by', `${test.inspectorName} (${test.inspectorId})`, 54, 437);
  field(doc, 'Reviewed and approved by', `${test.approvedBy?.name || 'Not approved'} (${test.approvedBy?.officerId || '-'})`, 305, 437);
  field(doc, 'Submitted', test.submittedAt ? new Date(test.submittedAt).toLocaleString('en-IN') : 'Not submitted', 54, 478);
  field(doc, 'Approved', test.approvedAt ? new Date(test.approvedAt).toLocaleString('en-IN') : 'Not approved', 305, 478);
  field(doc, 'Rules profile', `${test.evaluation.ruleProfileId} v${test.evaluation.ruleVersion}`, 54, 519, 480);

  titleBar(doc, 'Digital integrity', 561);
  doc.image(qrBuffer, 54, 598, { width: 95, height: 95 });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.ink).text('Scan to check the current public record', 172, 604);
  doc.font('Helvetica').fontSize(8).fillColor(colors.muted).text(verificationUrl, 172, 622, { width: 355, link: verificationUrl, underline: true });
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(colors.muted).text('SHA-256 INTEGRITY FINGERPRINT', 172, 653);
  doc.font('Courier').fontSize(7).fillColor(colors.ink).text(test.integrityHash || 'Not issued', 172, 668, { width: 355 });
  footer(doc, 1);

  doc.addPage(); header(doc, test, 'Calculated metrological tests');
  titleBar(doc, 'Weighing performance detail', 112);
  const widths = [105, 95, 90, 90, 127];
  tableRow(doc, ['Applied load', 'Indication', 'Corrected error', 'MPE', 'Result'], widths, 144, { header: true });
  let y = 172;
  for (const item of test.evaluation.sections.performance.results) {
    tableRow(doc, [`${item.load} ${instrument.unit}`, item.indication, item.error, `+/- ${item.mpe}`, item.passed ? 'PASS' : 'FAIL'], widths, y);
    y += 28;
  }
  y += 16; titleBar(doc, 'Automated test summary', y); y += 32;
  const summaryWidths = [150, 95, 190, 72];
  tableRow(doc, ['Test', 'Clause', 'Calculation summary', 'Result'], summaryWidths, y, { header: true, height: 30 }); y += 30;
  for (const item of Object.values(test.evaluation.sections)) {
    if (y > 710) { footer(doc, 2); doc.addPage(); header(doc, test, 'Calculated tests continued'); y = 112; }
    tableRow(doc, [item.name, item.clause, item.summary, item.passed ? 'PASS' : item.complete ? 'FAIL' : 'INCOMPLETE'], summaryWidths, y, { height: 38 }); y += 38;
  }
  footer(doc, 2);

  doc.addPage(); header(doc, test, 'Conditional tests and traceability');
  titleBar(doc, 'Equipment-dependent and applicability decisions', 112);
  const conditionalWidths = [140, 95, 200, 72]; y = 144;
  tableRow(doc, ['Test', 'Applicability', 'Evidence note or reason', 'Result'], conditionalWidths, y, { header: true, height: 30 }); y += 30;
  for (const item of test.evaluation.conditional.results) {
    tableRow(doc, [item.name, item.applicability, item.applicability === 'Applicable' ? item.evidenceNote : item.reason, item.result], conditionalWidths, y, { height: 45 }); y += 45;
  }
  titleBar(doc, 'Evidence and review notes', 635);
  doc.font('Helvetica').fontSize(8).fillColor(colors.ink).text(`Attached evidence: ${test.evidence.length} file(s)`, 54, 670);
  doc.text(`Inspector notes: ${test.notes || 'None'}`, 54, 688, { width: 485 });
  const lastReview = test.reviewHistory?.at(-1);
  doc.text(`Reviewer note: ${lastReview?.comment || 'No review note recorded'}`, 54, 722, { width: 485 });
  footer(doc, 3);

  doc.end();
  return new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(buffers))); doc.on('error', reject); });
}
