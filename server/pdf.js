import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const green = '#173f32';
const mint = '#d9f4e7';
const ink = '#17211c';
const muted = '#66736c';
const line = '#d9e1dc';

function addField(doc, label, value, x, y, width = 240) {
  doc.font('Helvetica').fontSize(8).fillColor(muted).text(label.toUpperCase(), x, y, { width });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(ink).text(String(value ?? 'Not recorded'), x, y + 12, { width });
}

function sectionTitle(doc, title, y) {
  doc.roundedRect(44, y, 507, 24, 4).fill('#eef3f0');
  doc.font('Helvetica-Bold').fontSize(10).fillColor(green).text(title, 54, y + 7);
}

function row(doc, values, widths, y, header = false) {
  let x = 44;
  doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 8 : 8.5).fillColor(header ? muted : ink);
  values.forEach((value, index) => {
    doc.text(String(value), x + 6, y + 6, { width: widths[index] - 12, align: index > 0 ? 'right' : 'left' });
    x += widths[index];
  });
  doc.moveTo(44, y + 21).lineTo(551, y + 21).strokeColor(line).lineWidth(0.5).stroke();
}

export async function createReportPdf({ test, instrument, verificationUrl }) {
  const qrData = await QRCode.toDataURL(verificationUrl, { margin: 1, width: 180, color: { dark: green } });
  const qrBuffer = Buffer.from(qrData.split(',')[1], 'base64');
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 44, right: 44 }, info: { Title: `MaapSure ${test.certificateNumber}` } });

  const buffers = [];
  doc.on('data', (chunk) => buffers.push(chunk));

  doc.roundedRect(44, 40, 44, 44, 10).fill(green);
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#ffffff').text('M', 57, 52);
  doc.font('Helvetica-Bold').fontSize(20).fillColor(green).text('MaapSure', 100, 44);
  doc.font('Helvetica').fontSize(8.5).fillColor(muted).text('DIGITAL LEGAL METROLOGY', 101, 69);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(ink).text('Test Report', 410, 45, { width: 140, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(muted).text(test.certificateNumber, 390, 68, { width: 160, align: 'right' });

  const statusColor = test.evaluation.passed ? '#16794a' : '#b63d32';
  doc.roundedRect(44, 105, 507, 54, 8).fill(test.evaluation.passed ? '#e6f5ec' : '#fbeae8');
  doc.font('Helvetica-Bold').fontSize(9).fillColor(statusColor).text('OVERALL RESULT', 58, 118);
  doc.font('Helvetica-Bold').fontSize(22).fillColor(statusColor).text(test.evaluation.status, 58, 132);
  doc.font('Helvetica').fontSize(8.5).fillColor(muted).text('Evaluated using OIML R 76-1:2006 core checks', 250, 126, { width: 282, align: 'right' });

  sectionTitle(doc, 'Instrument and test information', 177);
  addField(doc, 'Manufacturer', instrument.manufacturer, 54, 212);
  addField(doc, 'Model', instrument.model, 305, 212);
  addField(doc, 'Serial number', instrument.serialNumber, 54, 250);
  addField(doc, 'Accuracy class', instrument.accuracyClass, 305, 250);
  addField(doc, 'Capacity', `${instrument.minCapacity} to ${instrument.maxCapacity} ${instrument.unit}`, 54, 288);
  addField(doc, 'Verification interval', `${instrument.verificationInterval} ${instrument.unit}`, 305, 288);
  addField(doc, 'Inspector', `${test.inspectorName} (${test.inspectorId})`, 54, 326);
  addField(doc, 'Laboratory', test.laboratory, 305, 326);
  addField(doc, 'Environment', `${test.temperature} C, ${test.humidity}% RH`, 54, 364);
  addField(doc, 'Finalized', new Date(test.finalizedAt).toLocaleString('en-IN'), 305, 364);

  sectionTitle(doc, 'Weighing performance', 407);
  row(doc, ['Applied load', 'Indication', 'Error', 'MPE', 'Result'], [130, 100, 90, 90, 97], 437, true);
  let y = 458;
  test.evaluation.sections.performance.results.forEach((item) => {
    row(doc, [`${item.load} ${instrument.unit}`, item.indication, item.error, `+/- ${item.mpe}`, item.passed ? 'PASS' : 'FAIL'], [130, 100, 90, 90, 97], y);
    y += 22;
  });

  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(15).fillColor(green).text('Supporting checks', 44, 44);
  sectionTitle(doc, 'Test summaries', 76);
  const summaries = [
    test.evaluation.sections.repeatability,
    test.evaluation.sections.eccentricity,
    test.evaluation.sections.zeroReturn,
  ];
  y = 110;
  summaries.forEach((section) => {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(ink).text(section.name, 54, y);
    doc.font('Helvetica').fontSize(9).fillColor(muted).text(section.summary, 54, y + 16, { width: 380 });
    doc.roundedRect(465, y - 2, 70, 22, 11).fill(section.passed ? '#e2f3e9' : '#f9e4e1');
    doc.font('Helvetica-Bold').fontSize(8).fillColor(section.passed ? '#16794a' : '#b63d32').text(section.passed ? 'PASS' : 'FAIL', 465, y + 5, { width: 70, align: 'center' });
    y += 56;
  });

  sectionTitle(doc, 'Explainable diagnostic review', y + 2);
  y += 40;
  test.evaluation.diagnostic.findings.forEach((finding) => {
    doc.circle(58, y + 5, 3).fill(finding.severity === 'high' ? '#b63d32' : finding.severity === 'medium' ? '#c47b18' : '#16794a');
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(ink).text(finding.title, 70, y);
    doc.font('Helvetica').fontSize(8.5).fillColor(muted).text(finding.detail, 70, y + 14, { width: 450 });
    y += 48;
  });

  y = Math.max(y + 10, 410);
  sectionTitle(doc, 'Digital verification', y);
  doc.image(qrBuffer, 54, y + 38, { width: 100, height: 100 });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text('Scan to verify this report', 175, y + 52);
  doc.font('Helvetica').fontSize(8.5).fillColor(muted).text(`Verification code: ${test.verificationCode}`, 175, y + 72);
  doc.text(verificationUrl, 175, y + 90, { width: 340, link: verificationUrl, underline: true });

  const disclaimerY = 744;
  doc.moveTo(44, disclaimerY - 10).lineTo(551, disclaimerY - 10).strokeColor(line).stroke();
  doc.font('Helvetica').fontSize(7.5).fillColor(muted).text('Prototype decision-support report. Final legal approval and stamping remain with the authorized Legal Metrology authority.', 44, disclaimerY, { width: 507, align: 'center' });

  doc.end();
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
  });
}
