import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { createId, ensureStore, readStore, updateStore, uploadDir } from './store.js';
import { evaluateTest, validateInstrument, oimlReference } from '../shared/oimlEngine.js';
import { createReportPdf } from './pdf.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, '..');
const distDir = path.join(rootDir, 'dist');
const port = Number(process.env.PORT || (process.env.NODE_ENV === 'development' ? 4000 : 4173));
const jwtSecret = process.env.JWT_SECRET || 'maapsure-local-demo-secret-change-before-production';
const app = express();

const demoUsers = [
  { id: 'user-admin', email: 'admin@maapsure.in', password: 'Demo@123', name: 'Dr. Kavita Rao', role: 'Laboratory Admin', initials: 'KR' },
  { id: 'user-inspector', email: 'inspector@maapsure.in', password: 'Inspect@123', name: 'Arjun Sharma', role: 'Legal Metrology Officer', initials: 'AS' },
];

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(uploadDir));

function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, callback) => callback(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-')}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, /^image\//.test(file.mimetype) || file.mimetype === 'application/pdf'),
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok', product: 'MaapSure', time: new Date().toISOString() }));

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const user = demoUsers.find((candidate) => candidate.email === email && candidate.password === req.body.password);
  if (!user) return res.status(401).json({ error: 'Incorrect email or password.' });
  const safeUser = { id: user.id, email: user.email, name: user.name, role: user.role, initials: user.initials };
  const token = jwt.sign(safeUser, jwtSecret, { expiresIn: '12h' });
  res.json({ token, user: safeUser });
});

app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: req.user }));

app.get('/api/dashboard', authenticate, async (_req, res) => {
  const database = await readStore();
  const finalized = database.tests.filter((test) => test.status === 'Finalized');
  const passed = finalized.filter((test) => test.evaluation?.passed).length;
  const failed = finalized.length - passed;
  const historicalTotal = 97;
  const historicalPassed = 94;
  const recent = [...database.tests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6).map((test) => ({
    ...test,
    instrument: database.instruments.find((instrument) => instrument.id === test.instrumentId),
  }));
  const monthly = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    const month = date.toLocaleString('en-IN', { month: 'short' });
    const base = [12, 18, 16, 24, 29, finalized.length + 31][index];
    return { month, tests: base, passed: Math.max(0, base - [1, 2, 1, 3, 2, failed][index]) };
  });
  res.json({
    stats: {
      totalTests: finalized.length + historicalTotal,
      passRate: Math.round(((passed + historicalPassed) / (finalized.length + historicalTotal)) * 100),
      activeInstruments: database.instruments.filter((instrument) => instrument.status === 'Active').length,
      timeSavedHours: (finalized.length + historicalTotal) * 1.6,
    },
    breakdown: { passed, failed, total: finalized.length }, recent, monthly,
  });
});

app.get('/api/instruments', authenticate, async (_req, res) => {
  const database = await readStore();
  res.json({ instruments: [...database.instruments].sort((a, b) => a.manufacturer.localeCompare(b.manufacturer)) });
});

app.post('/api/instruments', authenticate, async (req, res) => {
  const candidate = {
    id: createId('ins'), manufacturer: String(req.body.manufacturer || '').trim(), model: String(req.body.model || '').trim(),
    serialNumber: String(req.body.serialNumber || '').trim(), accuracyClass: req.body.accuracyClass || 'III',
    maxCapacity: Number(req.body.maxCapacity), minCapacity: Number(req.body.minCapacity), verificationInterval: Number(req.body.verificationInterval),
    actualScaleInterval: Number(req.body.actualScaleInterval || req.body.verificationInterval), unit: req.body.unit || 'kg',
    location: String(req.body.location || '').trim(), status: 'Active', createdAt: new Date().toISOString(),
  };
  const validation = validateInstrument(candidate);
  if (!validation.valid) return res.status(400).json({ error: validation.errors.join(' '), validation });
  await updateStore((database) => {
    if (database.instruments.some((instrument) => instrument.serialNumber.toLowerCase() === candidate.serialNumber.toLowerCase())) {
      const error = new Error('An instrument with this serial number already exists.');
      error.status = 409;
      throw error;
    }
    database.instruments.push(candidate);
    database.audit.push({ id: createId('audit'), action: 'Instrument created', targetId: candidate.id, userId: req.user.id, at: candidate.createdAt });
  });
  res.status(201).json({ instrument: candidate, validation });
});

app.get('/api/tests', authenticate, async (_req, res) => {
  const database = await readStore();
  const tests = [...database.tests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((test) => ({
    ...test, instrument: database.instruments.find((instrument) => instrument.id === test.instrumentId),
  }));
  res.json({ tests });
});

app.post('/api/tests/evaluate', authenticate, async (req, res) => {
  const database = await readStore();
  const instrument = database.instruments.find((candidate) => candidate.id === req.body.instrumentId);
  if (!instrument) return res.status(404).json({ error: 'Instrument not found.' });
  try {
    res.json({ evaluation: evaluateTest(req.body.input || {}, instrument), instrument });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/tests', authenticate, async (req, res) => {
  const database = await readStore();
  const instrument = database.instruments.find((candidate) => candidate.id === req.body.instrumentId);
  if (!instrument) return res.status(404).json({ error: 'Instrument not found.' });
  const evaluation = evaluateTest(req.body.input || {}, instrument);
  const sequence = database.settings.sequence || 1;
  const year = new Date().getFullYear();
  const test = {
    id: createId('test'), instrumentId: instrument.id, certificateNumber: `MS-${year}-${String(sequence).padStart(5, '0')}`,
    verificationCode: `MS${String(year).slice(-2)}${Math.random().toString(36).slice(2, 8).toUpperCase()}`, status: 'Finalized',
    inspectorName: String(req.body.inspectorName || req.user.name), inspectorId: String(req.body.inspectorId || 'LMO-DEMO'),
    laboratory: String(req.body.laboratory || instrument.location || database.settings.laboratoryName),
    temperature: Number(req.body.temperature || 25), humidity: Number(req.body.humidity || 50), notes: String(req.body.notes || ''),
    input: req.body.input, evaluation, evidence: [], createdAt: new Date().toISOString(), finalizedAt: new Date().toISOString(),
  };
  await updateStore((latest) => {
    latest.tests.push(test);
    latest.settings.sequence = sequence + 1;
    latest.audit.push({ id: createId('audit'), action: 'Test finalized', targetId: test.id, result: evaluation.status, userId: req.user.id, at: test.finalizedAt });
  });
  res.status(201).json({ test: { ...test, instrument } });
});

app.get('/api/tests/:id', authenticate, async (req, res) => {
  const database = await readStore();
  const test = database.tests.find((candidate) => candidate.id === req.params.id);
  if (!test) return res.status(404).json({ error: 'Test report not found.' });
  res.json({ test: { ...test, instrument: database.instruments.find((instrument) => instrument.id === test.instrumentId) }, reference: oimlReference });
});

app.post('/api/tests/:id/evidence', authenticate, upload.single('evidence'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a photograph or PDF first.' });
  const evidence = { id: createId('evidence'), name: req.file.originalname, url: `/uploads/${req.file.filename}`, type: req.file.mimetype, uploadedAt: new Date().toISOString() };
  const test = await updateStore((database) => {
    const found = database.tests.find((candidate) => candidate.id === req.params.id);
    if (!found) {
      const error = new Error('Test report not found.'); error.status = 404; throw error;
    }
    found.evidence.push(evidence);
    database.audit.push({ id: createId('audit'), action: 'Evidence uploaded', targetId: found.id, userId: req.user.id, at: evidence.uploadedAt });
    return found;
  });
  res.status(201).json({ evidence, test });
});

function verificationUrl(req, test) {
  const configured = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  return `${configured || `${req.protocol}://${req.get('host')}`}/verify/${test.verificationCode}`;
}

app.get('/api/tests/:id/report.pdf', authenticate, async (req, res) => {
  const database = await readStore();
  const test = database.tests.find((candidate) => candidate.id === req.params.id);
  if (!test) return res.status(404).json({ error: 'Test report not found.' });
  const instrument = database.instruments.find((candidate) => candidate.id === test.instrumentId);
  const pdf = await createReportPdf({ test, instrument, verificationUrl: verificationUrl(req, test) });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${test.certificateNumber}.pdf"`);
  res.send(pdf);
});

app.get('/api/tests/:id/qr.png', async (req, res) => {
  const database = await readStore();
  const test = database.tests.find((candidate) => candidate.id === req.params.id);
  if (!test) return res.status(404).json({ error: 'Test report not found.' });
  const image = await QRCode.toBuffer(verificationUrl(req, test), { margin: 1, width: 320, color: { dark: '#173f32' } });
  res.type('png').send(image);
});

app.get('/api/public/verify/:code', async (req, res) => {
  const database = await readStore();
  const test = database.tests.find((candidate) => candidate.verificationCode.toLowerCase() === req.params.code.toLowerCase());
  if (!test) return res.status(404).json({ valid: false, error: 'No MaapSure report matches this verification code.' });
  const instrument = database.instruments.find((candidate) => candidate.id === test.instrumentId);
  res.json({
    valid: true,
    report: {
      certificateNumber: test.certificateNumber, verificationCode: test.verificationCode, status: test.evaluation.status,
      finalizedAt: test.finalizedAt, laboratory: test.laboratory, inspectorName: test.inspectorName,
      standard: test.evaluation.standard, instrument: { manufacturer: instrument.manufacturer, model: instrument.model, serialNumber: instrument.serialNumber, accuracyClass: instrument.accuracyClass, maxCapacity: instrument.maxCapacity, unit: instrument.unit },
    },
  });
});

app.use(express.static(distDir));
app.get('/{*splat}', async (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  try {
    await fs.access(path.join(distDir, 'index.html'));
    res.sendFile(path.join(distDir, 'index.html'));
  } catch {
    res.status(404).send('Build the MaapSure web app first with: npm run build');
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.message || 'Something went wrong.' });
});

await ensureStore();
app.listen(port, () => console.log(`MaapSure is running at http://localhost:${port}`));
