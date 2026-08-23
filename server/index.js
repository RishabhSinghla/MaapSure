import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import {
  appendAudit, computeTestIntegrity, createId, ensureStore, readStore, updateStore, uploadDir,
  verifyAuditChain, verifyPassword,
} from './store.js';
import { evaluateTest, validateInstrument, oimlReference, RULE_PROFILE } from '../shared/oimlEngine.js';
import { createReportPdf } from './pdf.js';
import { createEditableReport } from './word.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, '..');
const distDir = path.join(rootDir, 'dist');
const port = Number(process.env.PORT || (process.env.NODE_ENV === 'development' ? 4000 : 4173));
const insecureDefaultSecret = 'maapsure-local-demo-secret-change-before-production';
const jwtSecret = process.env.JWT_SECRET || insecureDefaultSecret;
const production = process.env.NODE_ENV === 'production';
if (production && jwtSecret === insecureDefaultSecret) console.warn('SECURITY WARNING: set JWT_SECRET before any public deployment.');

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(uploadDir, { fallthrough: false, dotfiles: 'deny', immutable: true, maxAge: '1y' }));

function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  try {
    req.user = jwt.verify(token, jwtSecret, { issuer: 'maapsure', audience: 'maapsure-lab' });
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Please sign in again.', requestId: req.requestId });
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (req.user?.role === 'ADMIN' || roles.includes(req.user?.role)) return next();
    return res.status(403).json({ error: 'Your role is not allowed to perform this action.', requestId: req.requestId });
  };
}

const loginAttempts = new Map();
function loginRateLimit(req, res, next) {
  const key = req.ip || 'local'; const now = Date.now(); const entry = loginAttempts.get(key) || { count: 0, since: now };
  if (now - entry.since > 15 * 60 * 1000) { entry.count = 0; entry.since = now; }
  if (entry.count >= 10) return res.status(429).json({ error: 'Too many sign-in attempts. Try again after 15 minutes.' });
  req.loginEntry = entry; req.loginKey = key; next();
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '')}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.mimetype)),
});

async function fileMatchesDeclaredType(file) {
  const handle = await fs.open(file.path, 'r');
  const buffer = Buffer.alloc(12);
  await handle.read(buffer, 0, 12, 0); await handle.close();
  const signatures = {
    'application/pdf': buffer.subarray(0, 5).toString() === '%PDF-',
    'image/jpeg': buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
    'image/png': buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/webp': buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP',
  };
  return Boolean(signatures[file.mimetype]);
}

const safeUser = (user) => ({
  id: user.id, email: user.email, name: user.name, role: user.role, roleLabel: user.roleLabel,
  initials: user.initials, officerId: user.officerId, active: user.active,
});
const actor = (req) => ({ id: req.user.id, name: req.user.name, role: req.user.role });
const addInstrument = (database, test) => ({ ...test, instrument: database.instruments.find((item) => item.id === test.instrumentId) });

app.get('/api/health', async (_req, res) => {
  const database = await readStore(); const ledger = verifyAuditChain(database.audit);
  res.status(ledger.valid ? 200 : 503).json({
    status: ledger.valid ? 'ok' : 'integrity-failure', product: 'MaapSure', schemaVersion: database.schemaVersion,
    ruleProfile: database.settings.activeRuleProfileId, auditLedger: ledger, time: new Date().toISOString(),
    securityMode: jwtSecret === insecureDefaultSecret ? 'DEMO - SET JWT_SECRET' : 'CONFIGURED',
  });
});

app.post('/api/auth/login', loginRateLimit, async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim(); const database = await readStore();
  const user = database.users.find((candidate) => candidate.email === email && candidate.active);
  if (!user || !verifyPassword(req.body.password, user)) {
    req.loginEntry.count += 1; loginAttempts.set(req.loginKey, req.loginEntry);
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  loginAttempts.delete(req.loginKey);
  const visible = safeUser(user); const token = jwt.sign(visible, jwtSecret, { expiresIn: '8h', issuer: 'maapsure', audience: 'maapsure-lab' });
  await updateStore((latest) => appendAudit(latest, { action: 'User signed in', targetType: 'User', targetId: user.id, actor: visible }));
  res.json({ token, user: visible });
});

app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: req.user }));

app.get('/api/dashboard', authenticate, async (_req, res) => {
  const database = await readStore();
  const approved = database.tests.filter((test) => test.status === 'Approved');
  const passed = approved.filter((test) => test.evaluation?.passed).length;
  const recent = [...database.tests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6).map((test) => addInstrument(database, test));
  const monthKeys = Array.from({ length: 6 }, (_, index) => { const date = new Date(); date.setMonth(date.getMonth() - (5 - index)); return { key: `${date.getFullYear()}-${date.getMonth()}`, month: date.toLocaleString('en-IN', { month: 'short' }), tests: 0, passed: 0 }; });
  for (const test of approved) { const date = new Date(test.approvedAt); const bucket = monthKeys.find((item) => item.key === `${date.getFullYear()}-${date.getMonth()}`); if (bucket) { bucket.tests += 1; if (test.evaluation?.passed) bucket.passed += 1; } }
  res.json({
    stats: { totalTests: approved.length, passRate: approved.length ? Math.round((passed / approved.length) * 100) : 0, activeInstruments: database.instruments.filter((item) => item.status === 'Active').length, pendingReview: database.tests.filter((item) => item.status === 'Submitted').length },
    breakdown: { passed, failed: approved.length - passed, total: approved.length }, recent, monthly: monthKeys.map(({ key: _key, ...item }) => item),
  });
});

app.get('/api/instruments', authenticate, async (_req, res) => {
  const database = await readStore();
  res.json({ instruments: [...database.instruments].sort((a, b) => a.manufacturer.localeCompare(b.manufacturer)) });
});

app.post('/api/instruments', authenticate, requireRoles('TESTER'), async (req, res) => {
  const candidate = {
    id: createId('ins'), manufacturer: String(req.body.manufacturer || '').trim(), model: String(req.body.model || '').trim(),
    serialNumber: String(req.body.serialNumber || '').trim(), accuracyClass: req.body.accuracyClass || 'III',
    maxCapacity: Number(req.body.maxCapacity), minCapacity: Number(req.body.minCapacity), verificationInterval: Number(req.body.verificationInterval),
    actualScaleInterval: Number(req.body.actualScaleInterval || req.body.verificationInterval), unit: req.body.unit || 'kg',
    location: String(req.body.location || '').trim(), status: 'Active', createdAt: new Date().toISOString(), createdBy: req.user.id,
  };
  const validation = validateInstrument(candidate);
  if (!validation.valid) return res.status(400).json({ error: validation.errors.join(' '), validation });
  await updateStore((database) => {
    if (database.instruments.some((item) => item.serialNumber.toLowerCase() === candidate.serialNumber.toLowerCase())) {
      const error = new Error('An instrument with this serial number already exists.'); error.status = 409; throw error;
    }
    database.instruments.push(candidate);
    appendAudit(database, { action: 'Instrument registered', targetType: 'Instrument', targetId: candidate.id, actor: actor(req), details: { serialNumber: candidate.serialNumber } });
  });
  res.status(201).json({ instrument: candidate, validation });
});

app.get('/api/tests', authenticate, async (req, res) => {
  const database = await readStore();
  let tests = database.tests;
  if (req.query.queue === 'review') tests = tests.filter((test) => test.status === 'Submitted');
  res.json({ tests: [...tests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((test) => addInstrument(database, test)) });
});

app.post('/api/tests/evaluate', authenticate, requireRoles('TESTER'), async (req, res) => {
  const database = await readStore(); const instrument = database.instruments.find((item) => item.id === req.body.instrumentId);
  if (!instrument) return res.status(404).json({ error: 'Instrument not found.' });
  try { res.json({ evaluation: evaluateTest(req.body.input || {}, instrument), instrument, ruleProfile: RULE_PROFILE }); }
  catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/tests', authenticate, requireRoles('TESTER'), async (req, res) => {
  const database = await readStore(); const instrument = database.instruments.find((item) => item.id === req.body.instrumentId);
  if (!instrument) return res.status(404).json({ error: 'Instrument not found.' });
  const evaluation = evaluateTest(req.body.input || {}, instrument);
  const sequence = database.settings.sequence || 1; const year = new Date().getFullYear(); const createdAt = new Date().toISOString();
  const test = {
    id: createId('test'), instrumentId: instrument.id, certificateNumber: `DRAFT-${year}-${String(sequence).padStart(5, '0')}`,
    verificationCode: `MS${String(year).slice(-2)}${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`, status: 'Draft', revision: 1,
    inspectorName: String(req.body.inspectorName || req.user.name).trim(), inspectorId: String(req.body.inspectorId || req.user.officerId || '').trim(),
    createdBy: req.user.id, laboratory: String(req.body.laboratory || instrument.location || database.settings.laboratoryName).trim(),
    temperature: Number(req.body.temperature), humidity: Number(req.body.humidity), notes: String(req.body.notes || '').trim(),
    input: req.body.input, evaluation, evidence: [], reviewHistory: [], createdAt, updatedAt: createdAt, ruleProfileId: database.settings.activeRuleProfileId,
  };
  if (!test.inspectorName || !test.inspectorId || !test.laboratory || !Number.isFinite(test.temperature) || test.temperature < -50 || test.temperature > 80 || !Number.isFinite(test.humidity) || test.humidity < 0 || test.humidity > 100) {
    return res.status(400).json({ error: 'Inspector, officer ID, laboratory, temperature (-50 to 80 C) and humidity (0 to 100%) are required.' });
  }
  await updateStore((latest) => {
    latest.tests.push(test); latest.settings.sequence = sequence + 1;
    appendAudit(latest, { action: 'Test draft created', targetType: 'Test', targetId: test.id, actor: actor(req), details: { technicalResult: evaluation.status, ruleProfileId: test.ruleProfileId } });
  });
  res.status(201).json({ test: { ...test, instrument } });
});

app.get('/api/tests/:id', authenticate, async (req, res) => {
  const database = await readStore(); const test = database.tests.find((item) => item.id === req.params.id);
  if (!test) return res.status(404).json({ error: 'Test report not found.' });
  const integrityValid = test.integrityHash ? computeTestIntegrity(test) === test.integrityHash : null;
  res.json({ test: addInstrument(database, test), reference: oimlReference, integrityValid });
});

app.post('/api/tests/:id/evidence', authenticate, requireRoles('TESTER'), upload.single('evidence'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a JPG, PNG, WebP or PDF file up to 8 MB.' });
  if (!(await fileMatchesDeclaredType(req.file))) { await fs.unlink(req.file.path); return res.status(400).json({ error: 'The file content does not match its declared type.' }); }
  try {
    const evidence = { id: createId('evidence'), name: path.basename(req.file.originalname).slice(0, 120), url: `/uploads/${req.file.filename}`, type: req.file.mimetype, size: req.file.size, uploadedAt: new Date().toISOString(), uploadedBy: req.user.id };
    const test = await updateStore((database) => {
      const found = database.tests.find((item) => item.id === req.params.id);
      if (!found) { const error = new Error('Test report not found.'); error.status = 404; throw error; }
      if (!['Draft', 'Returned'].includes(found.status)) { const error = new Error('Evidence is locked after submission. Create a correction revision if changes are needed.'); error.status = 409; throw error; }
      if (found.createdBy !== req.user.id && req.user.role !== 'ADMIN') { const error = new Error('Only the assigned tester can add evidence.'); error.status = 403; throw error; }
      found.evidence.push(evidence); found.updatedAt = evidence.uploadedAt;
      appendAudit(database, { action: 'Evidence attached', targetType: 'Test', targetId: found.id, actor: actor(req), details: { evidenceId: evidence.id, type: evidence.type, size: evidence.size } });
      return found;
    });
    res.status(201).json({ evidence, test });
  } catch (error) { await fs.unlink(req.file.path).catch(() => {}); throw error; }
});

app.post('/api/tests/:id/submit', authenticate, requireRoles('TESTER'), async (req, res) => {
  const test = await updateStore((database) => {
    const found = database.tests.find((item) => item.id === req.params.id);
    if (!found) { const error = new Error('Test report not found.'); error.status = 404; throw error; }
    if (!['Draft', 'Returned'].includes(found.status)) { const error = new Error('Only a draft or returned test can be submitted.'); error.status = 409; throw error; }
    if (found.createdBy !== req.user.id && req.user.role !== 'ADMIN') { const error = new Error('Only the assigned tester can submit this test.'); error.status = 403; throw error; }
    if (!found.evaluation.complete) { const error = new Error('Every required and conditional test section must be completed before submission.'); error.status = 400; throw error; }
    if (!found.evidence.length) { const error = new Error('Attach at least one photograph or supporting PDF before submission.'); error.status = 400; throw error; }
    found.status = 'Submitted'; found.submittedAt = new Date().toISOString(); found.updatedAt = found.submittedAt;
    appendAudit(database, { action: 'Test submitted for independent review', targetType: 'Test', targetId: found.id, actor: actor(req), details: { technicalResult: found.evaluation.status, revision: found.revision } });
    return found;
  });
  res.json({ test });
});

app.post('/api/tests/:id/review', authenticate, requireRoles('REVIEWER'), async (req, res) => {
  const decision = String(req.body.decision || '').toUpperCase(); const comment = String(req.body.comment || '').trim();
  if (!['APPROVE', 'RETURN'].includes(decision)) return res.status(400).json({ error: 'Decision must be APPROVE or RETURN.' });
  if (comment.length < 5) return res.status(400).json({ error: 'Enter a meaningful review note of at least 5 characters.' });
  const test = await updateStore((database) => {
    const found = database.tests.find((item) => item.id === req.params.id);
    if (!found) { const error = new Error('Test report not found.'); error.status = 404; throw error; }
    if (found.status !== 'Submitted') { const error = new Error('Only a submitted test can be reviewed.'); error.status = 409; throw error; }
    if (found.createdBy === req.user.id) { const error = new Error('Four-eyes control: the tester cannot approve their own work.'); error.status = 403; throw error; }
    const at = new Date().toISOString(); found.reviewHistory ||= [];
    found.reviewHistory.push({ decision, comment, reviewer: { id: req.user.id, name: req.user.name, officerId: req.user.officerId }, at });
    if (decision === 'RETURN') {
      found.status = 'Returned'; found.updatedAt = at;
      appendAudit(database, { action: 'Test returned for correction', targetType: 'Test', targetId: found.id, actor: actor(req), details: { comment, revision: found.revision } });
    } else {
      if (!found.evaluation.complete) { const error = new Error('An incomplete technical record cannot be approved.'); error.status = 400; throw error; }
      found.status = 'Approved'; found.certificateNumber = found.certificateNumber.replace(/^DRAFT-/, 'MS-'); found.approvedAt = at;
      found.approvedBy = { id: req.user.id, name: req.user.name, officerId: req.user.officerId || '' }; found.updatedAt = at;
      found.integrityHash = computeTestIntegrity(found);
      appendAudit(database, { action: 'Test independently approved', targetType: 'Test', targetId: found.id, actor: actor(req), details: { technicalResult: found.evaluation.status, integrityHash: found.integrityHash, comment } });
    }
    return found;
  });
  res.json({ test });
});

app.post('/api/tests/:id/revoke', authenticate, requireRoles('REVIEWER'), async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (reason.length < 10) return res.status(400).json({ error: 'A revocation reason of at least 10 characters is required.' });
  const test = await updateStore((database) => {
    const found = database.tests.find((item) => item.id === req.params.id);
    if (!found || found.status !== 'Approved') { const error = new Error('Only an approved report can be revoked.'); error.status = 409; throw error; }
    found.status = 'Revoked'; found.revokedAt = new Date().toISOString(); found.revokedBy = req.user.id; found.revocationReason = reason;
    appendAudit(database, { action: 'Approved report revoked', targetType: 'Test', targetId: found.id, actor: actor(req), details: { reason, integrityHash: found.integrityHash } });
    return found;
  });
  res.json({ test });
});

app.post('/api/tests/:id/revise', authenticate, requireRoles('TESTER'), async (req, res) => {
  const revised = await updateStore((database) => {
    const original = database.tests.find((item) => item.id === req.params.id);
    if (!original) { const error = new Error('Test report not found.'); error.status = 404; throw error; }
    if (!['Returned', 'Revoked'].includes(original.status)) { const error = new Error('A correction revision can only be created from a returned or revoked record.'); error.status = 409; throw error; }
    const createdAt = new Date().toISOString();
    const copy = { ...structuredClone(original), id: createId('test'), status: 'Draft', revision: (original.revision || 1) + 1, parentTestId: original.id, certificateNumber: `${original.certificateNumber.replace(/^MS-/, 'DRAFT-')}-R${(original.revision || 1) + 1}`, verificationCode: `MS${String(new Date().getFullYear()).slice(-2)}${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`, createdBy: req.user.id, inspectorName: req.user.name, inspectorId: req.user.officerId || original.inspectorId, evidence: [], reviewHistory: [], createdAt, updatedAt: createdAt };
    delete copy.submittedAt; delete copy.approvedAt; delete copy.approvedBy; delete copy.integrityHash; delete copy.revokedAt; delete copy.revokedBy; delete copy.revocationReason;
    database.tests.push(copy);
    appendAudit(database, { action: 'Correction revision created', targetType: 'Test', targetId: copy.id, actor: actor(req), details: { parentTestId: original.id, revision: copy.revision } });
    return copy;
  });
  res.status(201).json({ test: revised });
});

function verificationUrl(req, test) {
  const configured = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  return `${configured || `${req.protocol}://${req.get('host')}`}/verify/${test.verificationCode}`;
}

function requireIssuedReport(test, res) {
  if (!test) { res.status(404).json({ error: 'Test report not found.' }); return false; }
  if (!['Approved', 'Revoked'].includes(test.status)) { res.status(409).json({ error: 'Only an approved or revoked report can be exported.' }); return false; }
  return true;
}

app.get('/api/tests/:id/report.pdf', authenticate, async (req, res) => {
  const database = await readStore(); const test = database.tests.find((item) => item.id === req.params.id);
  if (!requireIssuedReport(test, res)) return;
  const instrument = database.instruments.find((item) => item.id === test.instrumentId);
  const pdf = await createReportPdf({ test, instrument, verificationUrl: verificationUrl(req, test) });
  res.type('pdf').setHeader('Content-Disposition', `attachment; filename="${test.certificateNumber}.pdf"`); res.send(pdf);
});

app.get('/api/tests/:id/report.doc', authenticate, async (req, res) => {
  const database = await readStore(); const test = database.tests.find((item) => item.id === req.params.id);
  if (!requireIssuedReport(test, res)) return;
  const instrument = database.instruments.find((item) => item.id === test.instrumentId);
  const document = createEditableReport({ test, instrument, verificationUrl: verificationUrl(req, test) });
  res.type('application/msword').setHeader('Content-Disposition', `attachment; filename="${test.certificateNumber}.doc"`); res.send(document);
});

app.get('/api/tests/:id/qr.png', async (req, res) => {
  const database = await readStore(); const test = database.tests.find((item) => item.id === req.params.id);
  if (!test || !['Approved', 'Revoked'].includes(test.status)) return res.status(404).json({ error: 'No issued report is available.' });
  const image = await QRCode.toBuffer(verificationUrl(req, test), { margin: 1, width: 320, color: { dark: '#173f32' } });
  res.type('png').send(image);
});

app.get('/api/public/verify/:code', async (req, res) => {
  const database = await readStore(); const test = database.tests.find((item) => item.verificationCode.toLowerCase() === req.params.code.toLowerCase());
  if (!test || !['Approved', 'Revoked'].includes(test.status)) return res.status(404).json({ valid: false, error: 'No issued MaapSure report matches this verification code.' });
  const instrument = database.instruments.find((item) => item.id === test.instrumentId); const integrityValid = computeTestIntegrity(test) === test.integrityHash;
  res.status(integrityValid ? 200 : 409).json({
    valid: integrityValid && test.status === 'Approved', authentic: integrityValid, revoked: test.status === 'Revoked',
    report: {
      certificateNumber: test.certificateNumber, verificationCode: test.verificationCode, status: test.evaluation.status, workflowStatus: test.status,
      approvedAt: test.approvedAt, laboratory: test.laboratory, inspectorName: test.inspectorName, approvedBy: test.approvedBy,
      standard: test.evaluation.standard, reportFormat: test.evaluation.reportFormat, ruleVersion: test.evaluation.ruleVersion,
      integrityHash: test.integrityHash, revocationReason: test.revocationReason,
      instrument: { manufacturer: instrument.manufacturer, model: instrument.model, serialNumber: instrument.serialNumber, accuracyClass: instrument.accuracyClass, maxCapacity: instrument.maxCapacity, unit: instrument.unit },
    },
  });
});

app.get('/api/rules', authenticate, async (_req, res) => {
  const database = await readStore();
  res.json({ activeRuleProfileId: database.settings.activeRuleProfileId, profiles: database.ruleProfiles, changeRequests: database.ruleChangeRequests || [], reference: oimlReference });
});

app.post('/api/rules/change-requests', authenticate, requireRoles('ADMIN'), async (req, res) => {
  const title = String(req.body.title || '').trim(); const reason = String(req.body.reason || '').trim(); const source = String(req.body.source || '').trim();
  if (title.length < 5 || reason.length < 10 || source.length < 5) return res.status(400).json({ error: 'Title, reason and authoritative source reference are required.' });
  const changeRequest = { id: createId('rule-change'), title, reason, source, status: 'Pending expert validation', createdAt: new Date().toISOString(), createdBy: req.user.id };
  await updateStore((database) => { database.ruleChangeRequests ||= []; database.ruleChangeRequests.push(changeRequest); appendAudit(database, { action: 'Rule change proposed', targetType: 'RuleProfile', targetId: RULE_PROFILE.id, actor: actor(req), details: { changeRequestId: changeRequest.id, title, source } }); });
  res.status(201).json({ changeRequest });
});

app.get('/api/audit', authenticate, requireRoles('REVIEWER', 'AUDITOR'), async (_req, res) => {
  const database = await readStore(); res.json({ integrity: verifyAuditChain(database.audit), events: [...database.audit].reverse() });
});

app.get('/api/admin/users', authenticate, requireRoles('ADMIN'), async (_req, res) => {
  const database = await readStore(); res.json({ users: database.users.map(safeUser) });
});

app.get('/api/admin/export', authenticate, requireRoles('ADMIN'), async (_req, res) => {
  const database = await readStore(); const exported = { ...database, users: database.users.map(safeUser), exportedAt: new Date().toISOString() };
  res.type('json').setHeader('Content-Disposition', 'attachment; filename="maapsure-controlled-export.json"'); res.send(JSON.stringify(exported, null, 2));
});

app.use(express.static(distDir));
app.get('/{*splat}', async (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  try { await fs.access(path.join(distDir, 'index.html')); res.sendFile(path.join(distDir, 'index.html')); }
  catch { res.status(404).send('Build the MaapSure web app first with: npm run build'); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'The file is larger than 8 MB.' : error.message });
  res.status(error.status || 500).json({ error: error.message || 'Something went wrong.' });
});

await ensureStore();
app.listen(port, () => console.log(`MaapSure is running at http://localhost:${port}`));
