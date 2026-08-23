import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import {
  appendAudit, computeStatusIntegrity, computeTestIntegrity, createApprovalSnapshot, createId, createInstrumentSnapshot,
  createRuleSnapshot, createSubmissionSnapshot, ensureStore, readStore, updateStore, uploadDir,
  verifyAuditChain, hashPassword, verifyPassword, verifyTestIntegrity, digest,
} from './store.js';
import { createBlankAssessmentInput, evaluateTest, validateInstrument, oimlReference, RULE_PROFILE } from '../shared/oimlEngine.js';
import { normalizeInstrument, REPORT_SECTIONS } from '../shared/r76Catalog.js';
import { createReportPdf } from './pdf.js';
import { createEditableReport } from './word.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, '..');
const distDir = path.join(rootDir, 'dist');
const port = Number(process.env.PORT || (process.env.NODE_ENV === 'development' ? 4000 : 4173));
const insecureDefaultSecret = 'maapsure-local-demo-secret-change-before-production';
const jwtSecret = process.env.JWT_SECRET || insecureDefaultSecret;
const production = process.env.NODE_ENV === 'production';
const demoMode = !production && process.env.MAAPSURE_DEMO_MODE !== 'false';
if (production && (jwtSecret === insecureDefaultSecret || jwtSecret.length < 32)) throw new Error('Production startup blocked: configure a private JWT_SECRET of at least 32 characters.');
if (production && process.env.MAAPSURE_DEMO_MODE === 'true') throw new Error('Production startup blocked: MAAPSURE_DEMO_MODE cannot be enabled in production.');
if (production) {
  try { const publicBase = new URL(process.env.PUBLIC_BASE_URL); if (publicBase.protocol !== 'https:' || publicBase.username || publicBase.password || publicBase.pathname !== '/' || publicBase.search || publicBase.hash) throw new Error(); }
  catch { throw new Error('Production startup blocked: PUBLIC_BASE_URL must be the trusted HTTPS origin, for example https://maapsure.gov.in/.'); }
}

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
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; style-src-attr 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(express.json({ limit: '10mb' }));

const JSON_LIMITS = Object.freeze({ maxDepth: 16, maxArrayItems: 500, maxObjectKeys: 500, maxStringLength: 20000, maxNodes: 50000 });
const forbiddenJsonKeys = new Set(['__proto__', 'prototype', 'constructor']);
function validateJsonValue(value, depth = 0, state = { nodes: 0 }) {
  state.nodes += 1;
  if (state.nodes > JSON_LIMITS.maxNodes) throw new Error('JSON payload contains too many values.');
  if (depth > JSON_LIMITS.maxDepth) throw new Error('JSON payload is nested too deeply.');
  if (typeof value === 'string') {
    if (value.length > JSON_LIMITS.maxStringLength) throw new Error('A text value exceeds the 20,000 character limit.');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > JSON_LIMITS.maxArrayItems) throw new Error('An array exceeds the 500 item limit.');
    value.forEach((item) => validateJsonValue(item, depth + 1, state));
    return;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length > JSON_LIMITS.maxObjectKeys) throw new Error('An object exceeds the 500 field limit.');
    for (const key of keys) {
      if (forbiddenJsonKeys.has(key)) throw new Error('JSON payload contains a prohibited field name.');
      validateJsonValue(value[key], depth + 1, state);
    }
  }
}
app.use('/api', (req, res, next) => {
  if (!req.is('application/json') || req.body === undefined) return next();
  try { validateJsonValue(req.body); return next(); }
  catch (error) { return res.status(413).json({ error: error.message, requestId: req.requestId }); }
});

async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  let claims;
  try {
    claims = jwt.verify(token, jwtSecret, { issuer: 'maapsure', audience: 'maapsure-lab' });
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.', requestId: req.requestId });
  }
  try {
    const database = await readStore(); const current = database.users.find((user) => user.id === claims.id && user.active);
    if (!current) return res.status(401).json({ error: 'This account is no longer active. Please contact the laboratory administrator.', requestId: req.requestId });
    req.user = safeUser(current);
    return next();
  } catch (error) { return next(error); }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (req.user?.role === 'ADMIN' || roles.includes(req.user?.role)) return next();
    return res.status(403).json({ error: 'Your role is not allowed to perform this action.', requestId: req.requestId });
  };
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;
const MAX_LOGIN_KEYS = 5000;
const loginAttempts = new Map();
const dummyPasswordUser = hashPassword('maapsure-dummy-password-work-factor');
function pruneLoginAttempts(now) {
  for (const [key, entry] of loginAttempts) if (now - entry.since >= LOGIN_WINDOW_MS) loginAttempts.delete(key);
  while (loginAttempts.size >= MAX_LOGIN_KEYS) loginAttempts.delete(loginAttempts.keys().next().value);
}
function loginRateLimit(req, res, next) {
  const now = Date.now(); pruneLoginAttempts(now);
  const email = String(req.body?.email || '').toLowerCase().trim().slice(0, 254);
  const key = `${String(req.ip || 'local').slice(0, 128)}|${email || 'unknown'}`;
  const entry = loginAttempts.get(key) || { count: 0, since: now };
  if (entry.count >= MAX_LOGIN_ATTEMPTS) return res.status(429).json({ error: 'Too many sign-in attempts. Try again after 15 minutes.' });
  req.loginEntry = entry; req.loginKey = key; next();
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '')}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 2, fieldSize: 4096, parts: 4 },
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

async function hashFile(filePath) {
  return createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
}

function evidenceFilePath(storageKey) {
  const key = String(storageKey || '');
  if (!key || path.basename(key) !== key || key === '.' || key === '..') throw Object.assign(new Error('Evidence storage key is invalid.'), { status: 409 });
  return path.join(uploadDir, key);
}

async function verifyEvidenceFiles(test) {
  for (const evidence of test.evidence || []) {
    if (!evidence.storageKey) continue;
    const actual = await hashFile(evidenceFilePath(evidence.storageKey));
    if (actual !== evidence.fileSha256) throw Object.assign(new Error(`Evidence integrity failed for ${evidence.name}.`), { status: 409 });
  }
}

function assertExecutableRuleSnapshot(found) {
  const currentRule = createRuleSnapshot();
  if (!found.ruleSnapshot || found.ruleSnapshot.id !== currentRule.id || found.ruleSnapshot.version !== currentRule.version || found.ruleSnapshot.engineArtifactHash !== currentRule.engineArtifactHash || found.ruleSnapshot.contentHash !== currentRule.contentHash) {
    throw Object.assign(new Error('The locked rules snapshot does not match the published executable profile. Run a governed rules migration and re-evaluation.'), { status: 409 });
  }
  return currentRule;
}

const EQUIPMENT_KIND_MATCHERS = Object.freeze({
  mass: /mass|weight|verification standard/i,
  temperature: /temperature|climate|environment/i,
  electrical: /electrical|emc|disturbance|voltage|power/i,
  time: /time|timer|clock|cycle/i,
  angle: /angle|tilt|level/i,
  pressure: /pressure|barometer/i,
  length: /length|displacement|dimension/i,
  rolling: /rolling|vehicle|axle/i,
});
function requiredEquipmentKinds(definition) {
  if (definition.id === 'eccentricityRolling') return ['rolling'];
  const kinds = ['mass'];
  if (definition.mode === 'disturbance' || definition.id === 'voltageVariation') kinds.push('electrical');
  if (['weighingPerformance', 'temperatureZero', 'dampHeatInitial', 'dampHeatHigh', 'dampHeatFinal'].includes(definition.id)) kinds.push('temperature');
  if (['zeroReturn', 'creep', 'warmUp', 'spanStability', 'enduranceFinal'].includes(definition.id)) kinds.push('time');
  if (definition.id === 'warmUp') kinds.push('electrical');
  if (definition.id === 'spanStability') kinds.push('pressure');
  if (definition.id === 'tilting') kinds.push('angle');
  if (definition.id === 'sensitivity') kinds.push('length');
  return [...new Set(kinds)];
}

async function assertCaseReadyForControl(found) {
  assertExecutableRuleSnapshot(found);
  const instrumentValidation = validateControlledDossier(found.instrumentSnapshot);
  if (!instrumentValidation.valid) throw Object.assign(new Error(`The locked type dossier is invalid: ${instrumentValidation.errors.join(' ')}`), { status: 400 });
  found.evaluation = evaluateTest(found.input || {}, found.instrumentSnapshot, RULE_PROFILE);
  if (!found.evaluation.complete) throw Object.assign(new Error(`Complete all applicable R 76 work before submission. ${found.evaluation.coverage.blockers.slice(0, 3).join(' | ')}`), { status: 400 });
  const env = found.environment || {}; const present = (value) => value !== '' && value !== null && value !== undefined && String(value).trim() !== '';
  const temperature = Number(env.temperature); const humidity = Number(env.humidity); const pressure = Number(env.barometricPressure);
  if (!found.inspectorName || !found.inspectorId || !found.laboratory || !present(env.temperature) || !Number.isFinite(temperature) || temperature < -50 || temperature > 80 || !present(env.humidity) || !Number.isFinite(humidity) || humidity < 0 || humidity > 100 || !present(env.barometricPressure) || !Number.isFinite(pressure) || pressure < 800 || pressure > 1100) {
    throw Object.assign(new Error('Inspector, officer ID, laboratory, temperature (-50 to 80 C), humidity (0 to 100%) and barometric pressure (800 to 1100 hPa) are required.'), { status: 400 });
  }
  const equipment = found.input?.equipment || [];
  const requiredEquipmentFields = ['id', 'category', 'name', 'serialNumber', 'traceabilityReference', 'purpose', 'calibrationDate', 'calibrationDue', 'uncertainty'];
  const incompleteEquipment = equipment.find((item) => requiredEquipmentFields.some((field) => !String(item?.[field] ?? '').trim()));
  if (!equipment.length || incompleteEquipment) throw Object.assign(new Error('Every equipment item needs identity, category, serial/inventory number, purpose, traceability reference, calibration dates and uncertainty.'), { status: 400 });
  const now = new Date();
  for (const item of equipment) {
    const calibrationDate = new Date(item.calibrationDate); const calibrationDue = new Date(item.calibrationDue);
    if (Number.isNaN(calibrationDate.getTime()) || Number.isNaN(calibrationDue.getTime()) || calibrationDue <= calibrationDate) throw Object.assign(new Error(`Calibration dates are invalid for ${item.name || item.id}.`), { status: 400 });
    if (calibrationDue < now) throw Object.assign(new Error(`Calibration expired for ${item.name || item.id}.`), { status: 400 });
  }
  const equipmentIds = new Set(equipment.map((item) => item.id));
  const invalidLink = REPORT_SECTIONS.filter((definition) => !['requirements', 'checklist'].includes(definition.mode) && found.evaluation.sections[definition.id]?.applicability === 'Applicable').find((definition) => {
    const ids = found.input?.sections?.[definition.id]?.equipmentIds || []; return !ids.length || ids.some((id) => !equipmentIds.has(id));
  });
  if (invalidLink) throw Object.assign(new Error(`Section ${invalidLink.number} must link only to equipment in the controlled register.`), { status: 400 });
  if (!found.input?.demoFixture) {
    const byId = new Map(equipment.map((item) => [item.id, item]));
    const incompatible = REPORT_SECTIONS.filter((definition) => !['requirements', 'checklist'].includes(definition.mode) && found.evaluation.sections[definition.id]?.applicability === 'Applicable').find((definition) => {
      const linked = (found.input?.sections?.[definition.id]?.equipmentIds || []).map((id) => byId.get(id)).filter(Boolean);
      return requiredEquipmentKinds(definition).some((kind) => !linked.some((item) => EQUIPMENT_KIND_MATCHERS[kind].test(String(item.category || ''))));
    });
    if (incompatible) throw Object.assign(new Error(`Section ${incompatible.number} has incompatible equipment links. Required categories: ${requiredEquipmentKinds(incompatible).join(', ')}.`), { status: 400 });
  }
  if (!found.evidence?.length || !found.evidence.some((item) => item.sectionId === 'construction' && String(item.note || '').trim().length >= 5)) throw Object.assign(new Error('Attach at least one hashed dossier/construction evidence file linked to section 16 with a meaningful purpose note.'), { status: 400 });
  if (found.evidence.some((item) => !item.fileSha256 || !item.sectionId || String(item.note || '').trim().length < 5)) throw Object.assign(new Error('Every evidence item needs a section link, byte hash and meaningful purpose note.'), { status: 400 });
  if (!found.input?.demoFixture) {
    const storedEvidenceIds = new Set(found.evidence.map((item) => item.id));
    const manualRows = [
      ...(found.evaluation.requirements || []).filter((item) => item.applicability === 'Applicable' && item.evidence !== 'automatic'),
      ...(found.evaluation.checklist || []).filter((item) => item.applicability === 'Applicable'),
    ];
    const unbound = manualRows.find((item) => !Array.isArray(item.evidenceIds) || !item.evidenceIds.length || item.evidenceIds.some((id) => !storedEvidenceIds.has(id)));
    if (unbound) throw Object.assign(new Error(`Manual decision ${unbound.clause || unbound.id} cites evidence that is not attached to this case.`), { status: 400 });
  }
  await verifyEvidenceFiles(found);
  if (production && found.input?.demoFixture && process.env.ALLOW_SYNTHETIC_DEMO !== 'true') throw Object.assign(new Error('Synthetic demo observations cannot be submitted in production.'), { status: 400 });
}

const safeUser = (user) => ({
  id: user.id, email: user.email, name: user.name, role: user.role, roleLabel: user.roleLabel,
  initials: user.initials, officerId: user.officerId, active: user.active,
});
const actor = (req) => ({ id: req.user.id, name: req.user.name, role: req.user.role });
function projectIssuedTest(test) {
  if (!['Approved', 'Revoked'].includes(test.status) || Number(test.integrityVersion || 0) < 3) return test;
  const integrity = verifyTestIntegrity(test);
  if (!integrity.snapshotValid || !test.approvalSnapshot) {
    return {
      id: test.id, rootId: test.rootId, instrumentId: test.instrumentId, status: test.status, revision: test.revision,
      recordVersion: test.recordVersion, coverageMode: test.coverageMode, integrityVersion: test.integrityVersion,
      integrityHash: test.integrityHash, statusIntegrityHash: test.statusIntegrityHash, integrityFailure: true,
      certificateNumber: 'INTEGRITY FAILURE', verificationCode: test.verificationCode,
      evaluation: { complete: false, passed: false, status: 'INTEGRITY FAILURE', coverage: { percent: 0 } },
      instrumentSnapshot: null, createdAt: test.createdAt, updatedAt: test.updatedAt,
    };
  }
  const issued = test.approvalSnapshot;
  return {
    ...test, ...issued, status: test.status, recordVersion: test.recordVersion, updatedAt: test.updatedAt,
    coverageMode: test.coverageMode, integrityVersion: test.integrityVersion, integrityHash: test.integrityHash,
    statusIntegrityHash: test.statusIntegrityHash, revokedAt: test.revokedAt, revokedBy: test.revokedBy,
    revocationReason: test.revocationReason, evidence: issued.evidenceManifest || [], integrityFailure: !integrity.valid,
  };
}
const addInstrument = (database, test) => {
  const projected = projectIssuedTest(test);
  if (projected.integrityFailure && !projected.instrumentSnapshot) return { ...projected, instrument: { manufacturer: 'Integrity failure', model: 'Issued snapshot unavailable', serialNumber: '-', accuracyClass: '-', maxCapacity: '-', unit: '' } };
  const instrument = projected.instrumentSnapshot || database.instruments.find((item) => item.id === projected.instrumentId);
  return { ...projected, instrument: instrument || { manufacturer: 'Integrity failure', model: 'Record unavailable', serialNumber: '-', accuracyClass: '-', maxCapacity: '-', unit: '' } };
};

const DOSSIER_STRING_FIELDS = Object.freeze([
  'applicationNumber', 'applicant', 'applicantAddress', 'manufacturer', 'model', 'typeDesignation', 'serialNumber',
  'accuracyClass', 'unit', 'softwareVersion', 'softwareIdentification', 'moduleModel', 'moduleCertificate',
  'loadCellModel', 'loadCellCertificate', 'interfacesDescription', 'submittedDocumentIndex', 'location',
]);
const DOSSIER_NUMERIC_FIELDS = Object.freeze([
  'maxCapacity', 'minCapacity', 'verificationInterval', 'actualScaleInterval', 'temperatureMin', 'temperatureMax',
]);
const sameNumber = (left, right) => Number.isFinite(Number(left)) && Number.isFinite(Number(right)) && Math.abs(Number(left) - Number(right)) <= 1e-10;
const dossierText = (value) => String(value ?? '').trim();
function normalizeConnectedEquipment(value) {
  if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item.trim() : item).filter((item) => typeof item !== 'string' || item.length > 0);
  if (typeof value === 'string') return value.trim();
  if (value === undefined || value === null) return '';
  throw Object.assign(new Error('connectedEquipment must be descriptive text or an array.'), { status: 400 });
}
function hasConnectedEquipment(value) {
  if (Array.isArray(value)) return value.length > 0;
  return dossierText(value).length >= 3;
}
function validateControlledDossier(rawInstrument) {
  const instrument = normalizeInstrument(rawInstrument); const base = validateInstrument(instrument); const errors = [...base.errors];
  const features = instrument.features || {}; const ranges = Array.isArray(features.ranges) ? features.ranges : [];
  if (features.questionnaireConfirmed !== true) errors.push('Confirm that every instrument-feature question was answered from the submitted dossier.');
  if (!dossierText(instrument.typeDesignation)) errors.push('Type designation is required.');
  if (!dossierText(instrument.location)) errors.push('Laboratory or dossier location is required.');
  if (!dossierText(instrument.submittedDocumentIndex)) errors.push('Submitted document index is required.');
  if (!ranges.length) errors.push('At least one controlled weighing range is required.');
  else {
    const first = ranges[0];
    if (!sameNumber(first.min, instrument.minCapacity) || !sameNumber(first.max, instrument.maxCapacity) || !sameNumber(first.e, instrument.verificationInterval) || !sameNumber(first.d, instrument.actualScaleInterval)) {
      errors.push('Range 1 must exactly match the headline Min, Max, e and d values.');
    }
    const ids = new Set(); let previousMaximum = Number.POSITIVE_INFINITY;
    for (const [index, range] of ranges.entries()) {
      const id = dossierText(range?.id || `range-${index + 1}`);
      if (ids.has(id)) errors.push(`Range ${index + 1} has a duplicate identifier.`); ids.add(id);
      const minimum = Number(range?.min); const maximum = Number(range?.max); const e = Number(range?.e); const d = Number(range?.d);
      if (![minimum, maximum, e, d].every(Number.isFinite)) continue;
      if (index > 0 && maximum >= previousMaximum) errors.push(`Range ${index + 1} Max must be below the preceding range Max; keep Range 1 as the headline/full range.`);
      if (index > 0 && (minimum < Number(first.min) || maximum > Number(first.max))) errors.push(`Range ${index + 1} must stay within the headline Range 1 limits.`);
      previousMaximum = maximum;
    }
  }
  if (features.rangeType === 'single' && ranges.length !== 1) errors.push('A single-range dossier cannot contain additional ranges.');
  if (['multipleRange', 'multiInterval'].includes(features.rangeType) && ranges.length < 2) errors.push(`${features.rangeType === 'multipleRange' ? 'Multiple-range' : 'Multi-interval'} dossiers require at least two declared ranges.`);
  if (features.softwareControlled) {
    if (!dossierText(instrument.softwareVersion)) errors.push('Software version is required for a software-controlled instrument.');
    if (!dossierText(instrument.softwareIdentification)) errors.push('Software identification or checksum is required for a software-controlled instrument.');
  }
  const submittedModule = features.hasSeparatelyTestedModules || dossierText(features.moduleType || 'complete') !== 'complete';
  if (submittedModule) {
    if (!dossierText(instrument.moduleModel)) errors.push('Module model or family is required for a submitted or separately tested module.');
    if (!dossierText(instrument.moduleCertificate)) errors.push('Module certificate or test reference is required for a submitted or separately tested module.');
    const fraction = Number(instrument.moduleErrorFraction);
    if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) errors.push('Module error fraction pi must be greater than 0 and no more than 1.');
  }
  if (instrument.moduleErrorFraction !== null && instrument.moduleErrorFraction !== undefined && instrument.moduleErrorFraction !== '') {
    const fraction = Number(instrument.moduleErrorFraction);
    if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) errors.push('Any recorded module error fraction pi must be greater than 0 and no more than 1.');
  }
  const hasAnyLoadCellDetail = dossierText(instrument.loadCellModel) || dossierText(instrument.loadCellCertificate);
  if (features.moduleType === 'weighingModule' || hasAnyLoadCellDetail) {
    if (!dossierText(instrument.loadCellModel) || !dossierText(instrument.loadCellCertificate)) errors.push('Load-cell model and certificate must be recorded together.');
  }
  if (features.ioLines && dossierText(instrument.interfacesDescription).length < 3) errors.push('Describe the interfaces and legally relevant data flow when I/O lines are declared.');
  if (features.multipleComponents && !hasConnectedEquipment(instrument.connectedEquipment)) errors.push('Describe the connected equipment when selectable components are declared.');
  return { ...base, valid: errors.length === 0, errors };
}

app.get('/api/health', async (_req, res) => {
  const database = await readStore(); const ledger = verifyAuditChain(database.audit);
  res.status(ledger.valid ? 200 : 503).json({
    status: ledger.valid ? 'ok' : 'integrity-failure', product: 'MaapSure', schemaVersion: database.schemaVersion,
    ruleProfile: database.settings.activeRuleProfileId, auditLedger: ledger, time: new Date().toISOString(),
    securityMode: jwtSecret === insecureDefaultSecret ? 'DEMO - SET JWT_SECRET' : 'CONFIGURED', ruleContentHash: createRuleSnapshot().contentHash,
    r76Coverage: { reportSections: REPORT_SECTIONS.length, detailedChecklistRows: oimlReference.detailedChecklistCount },
  });
});

app.post('/api/auth/login', loginRateLimit, async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim(); const database = await readStore();
  const user = database.users.find((candidate) => candidate.email === email && candidate.active);
  const passwordValid = verifyPassword(req.body.password, user || dummyPasswordUser);
  if (!user || !passwordValid) {
    req.loginEntry.count += 1; loginAttempts.delete(req.loginKey); loginAttempts.set(req.loginKey, req.loginEntry);
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
  const approvedRecords = database.tests.filter((test) => test.status === 'Approved');
  const approved = approvedRecords.map(projectIssuedTest).filter((test) => !test.integrityFailure);
  const passed = approved.filter((test) => test.evaluation?.passed).length; const failed = approved.filter((test) => !test.evaluation?.passed).length;
  const recent = [...database.tests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6).map((test) => addInstrument(database, test));
  const monthKeys = Array.from({ length: 6 }, (_, index) => { const date = new Date(); date.setMonth(date.getMonth() - (5 - index)); return { key: `${date.getFullYear()}-${date.getMonth()}`, month: date.toLocaleString('en-IN', { month: 'short' }), tests: 0, passed: 0 }; });
  for (const test of approved) { const date = new Date(test.approvedAt); const bucket = monthKeys.find((item) => item.key === `${date.getFullYear()}-${date.getMonth()}`); if (bucket) { bucket.tests += 1; if (test.evaluation?.passed) bucket.passed += 1; } }
  res.json({
    stats: { totalTests: approvedRecords.length, passRate: approved.length ? Math.round((passed / approved.length) * 100) : 0, activeInstruments: database.instruments.filter((item) => item.status === 'Active').length, pendingReview: database.tests.filter((item) => item.status === 'Submitted').length, integrityFailures: approvedRecords.length - approved.length },
    breakdown: { passed, failed, total: approved.length }, recent, monthly: monthKeys.map(({ key: _key, ...item }) => item),
  });
});

app.get('/api/instruments', authenticate, async (_req, res) => {
  const database = await readStore();
  res.json({ instruments: [...database.instruments].sort((a, b) => a.manufacturer.localeCompare(b.manufacturer)) });
});

app.post('/api/instruments', authenticate, requireRoles('TESTER'), async (req, res) => {
  if (req.body.features !== undefined && (!req.body.features || typeof req.body.features !== 'object' || Array.isArray(req.body.features))) return res.status(400).json({ error: 'features must be an object.' });
  if (req.body.loadCell !== undefined && (!req.body.loadCell || typeof req.body.loadCell !== 'object' || Array.isArray(req.body.loadCell))) return res.status(400).json({ error: 'loadCell must be an object.' });
  if (req.body.interfaces !== undefined && !Array.isArray(req.body.interfaces)) return res.status(400).json({ error: 'interfaces must be an array.' });
  const moduleErrorFraction = req.body.moduleErrorFraction === '' || req.body.moduleErrorFraction === null || req.body.moduleErrorFraction === undefined ? null : Number(req.body.moduleErrorFraction);
  const candidate = normalizeInstrument({
    id: createId('ins'), assessmentType: 'TYPE_EVALUATION', applicationNumber: String(req.body.applicationNumber || '').trim(),
    applicant: String(req.body.applicant || '').trim(), applicantAddress: String(req.body.applicantAddress || '').trim(),
    manufacturer: String(req.body.manufacturer || '').trim(), model: String(req.body.model || '').trim(), typeDesignation: String(req.body.typeDesignation || req.body.model || '').trim(),
    serialNumber: String(req.body.serialNumber || '').trim(), accuracyClass: req.body.accuracyClass || 'III',
    maxCapacity: Number(req.body.maxCapacity), minCapacity: Number(req.body.minCapacity), verificationInterval: Number(req.body.verificationInterval),
    actualScaleInterval: Number(req.body.actualScaleInterval || req.body.verificationInterval), unit: req.body.unit || 'kg',
    temperatureMin: Number(req.body.temperatureMin), temperatureMax: Number(req.body.temperatureMax), softwareVersion: String(req.body.softwareVersion || '').trim(),
    softwareIdentification: dossierText(req.body.softwareIdentification), moduleModel: dossierText(req.body.moduleModel),
    moduleCertificate: dossierText(req.body.moduleCertificate), moduleErrorFraction,
    loadCellModel: dossierText(req.body.loadCellModel), loadCellCertificate: dossierText(req.body.loadCellCertificate),
    interfacesDescription: dossierText(req.body.interfacesDescription), submittedDocumentIndex: dossierText(req.body.submittedDocumentIndex),
    loadCell: req.body.loadCell || {}, interfaces: Array.isArray(req.body.interfaces) ? req.body.interfaces : [], connectedEquipment: normalizeConnectedEquipment(req.body.connectedEquipment),
    features: req.body.features || {}, location: String(req.body.location || '').trim(), status: 'Active', dossierVersion: 1, revisionHistory: [], createdAt: new Date().toISOString(), createdBy: req.user.id,
  });
  const validation = validateControlledDossier(candidate);
  if (!validation.valid) return res.status(400).json({ error: validation.errors.join(' '), validation });
  await updateStore((database) => {
    if (database.instruments.some((item) => item.serialNumber.toLowerCase() === candidate.serialNumber.toLowerCase())) {
      const error = new Error('An instrument with this serial number already exists.'); error.status = 409; throw error;
    }
    if (database.instruments.some((item) => item.applicationNumber?.toLowerCase() === candidate.applicationNumber.toLowerCase())) {
      const error = new Error('A type dossier with this application number already exists.'); error.status = 409; throw error;
    }
    database.instruments.push(candidate);
    appendAudit(database, { action: 'Type dossier registered', targetType: 'Instrument', targetId: candidate.id, actor: actor(req), details: { serialNumber: candidate.serialNumber, applicationNumber: candidate.applicationNumber, featureProfile: candidate.features } });
  });
  res.status(201).json({ instrument: candidate, validation });
});

app.patch('/api/instruments/:id', authenticate, requireRoles('TESTER'), async (req, res) => {
  const revisionReason = String(req.body.revisionReason || '').trim();
  if (revisionReason.length < 10) return res.status(400).json({ error: 'Explain the dossier revision in at least 10 characters.' });
  const result = await updateStore((database) => {
    const found = database.instruments.find((item) => item.id === req.params.id);
    if (!found) throw Object.assign(new Error('Instrument dossier not found.'), { status: 404 });
    const currentVersion = Number(found.dossierVersion || 1);
    if (req.body.expectedVersion === undefined) throw Object.assign(new Error('expectedVersion is required for every controlled dossier revision.'), { status: 428, currentVersion });
    if (Number(req.body.expectedVersion) !== currentVersion) throw Object.assign(new Error(`This dossier changed after it was opened. Reload version ${currentVersion}.`), { status: 409, currentVersion });

    const candidateSource = structuredClone(found);
    for (const field of DOSSIER_STRING_FIELDS) if (req.body[field] !== undefined) candidateSource[field] = String(req.body[field]).trim();
    for (const field of DOSSIER_NUMERIC_FIELDS) if (req.body[field] !== undefined) candidateSource[field] = Number(req.body[field]);
    if (req.body.moduleErrorFraction !== undefined) candidateSource.moduleErrorFraction = req.body.moduleErrorFraction === '' || req.body.moduleErrorFraction === null ? null : Number(req.body.moduleErrorFraction);
    if (req.body.interfaces !== undefined) {
      if (!Array.isArray(req.body.interfaces)) throw Object.assign(new Error('interfaces must be an array.'), { status: 400 });
      candidateSource.interfaces = req.body.interfaces;
    }
    if (req.body.connectedEquipment !== undefined) candidateSource.connectedEquipment = normalizeConnectedEquipment(req.body.connectedEquipment);
    for (const field of ['features', 'loadCell']) if (req.body[field] !== undefined) {
      if (!req.body[field] || typeof req.body[field] !== 'object' || Array.isArray(req.body[field])) throw Object.assign(new Error(`${field} must be an object.`), { status: 400 });
      candidateSource[field] = req.body[field];
    }
    const candidate = normalizeInstrument(candidateSource); const validation = validateControlledDossier(candidate);
    if (!validation.valid) throw Object.assign(new Error(validation.errors.join(' ')), { status: 400, validation });
    if (database.instruments.some((item) => item.id !== found.id && String(item.serialNumber || '').toLowerCase() === candidate.serialNumber.toLowerCase())) throw Object.assign(new Error('An instrument with this serial number already exists.'), { status: 409 });
    if (database.instruments.some((item) => item.id !== found.id && String(item.applicationNumber || '').toLowerCase() === candidate.applicationNumber.toLowerCase())) throw Object.assign(new Error('A type dossier with this application number already exists.'), { status: 409 });

    const controlledFields = [...DOSSIER_STRING_FIELDS, ...DOSSIER_NUMERIC_FIELDS, 'moduleErrorFraction', 'interfaces', 'connectedEquipment', 'features', 'loadCell'];
    const changedFields = controlledFields.filter((field) => req.body[field] !== undefined && JSON.stringify(found[field]) !== JSON.stringify(candidate[field]));
    if (!changedFields.length) throw Object.assign(new Error('No dossier field changed. A revision is created only when controlled data changes.'), { status: 400 });
    const { revisionHistory: _history, ...previousSnapshot } = structuredClone(found); const revisedAt = new Date().toISOString();
    const historyEntry = { id: createId('dossier-revision'), fromVersion: currentVersion, toVersion: currentVersion + 1, reason: revisionReason, revisedAt, revisedBy: actor(req), changedFields, previousSnapshot, previousFingerprint: digest(previousSnapshot) };
    const revisionHistory = [...(found.revisionHistory || []), historyEntry];
    Object.assign(found, candidate, { dossierVersion: currentVersion + 1, revisionHistory, updatedAt: revisedAt, updatedBy: req.user.id });
    const frozenCaseCount = database.tests.filter((test) => test.instrumentId === found.id).length;
    appendAudit(database, { action: 'Instrument dossier revised with frozen-history preservation', targetType: 'Instrument', targetId: found.id, actor: actor(req), details: { fromVersion: currentVersion, toVersion: found.dossierVersion, revisionReason, changedFields, previousFingerprint: historyEntry.previousFingerprint, frozenCaseCount } });
    return { instrument: found, revision: historyEntry, frozenCaseCount, validation };
  });
  res.json(result);
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

async function createTypeEvaluation(req, res) {
  const created = await updateStore((database) => {
    const instrument = database.instruments.find((item) => item.id === req.body.instrumentId); if (!instrument) throw Object.assign(new Error('Instrument not found.'), { status: 404 });
    const dossierValidation = validateControlledDossier(instrument);
    if (!dossierValidation.valid) throw Object.assign(new Error(`Revise and confirm the instrument dossier before opening a case. ${dossierValidation.errors.join(' ')}`), { status: 400, validation: dossierValidation });
    const input = req.body.input || createBlankAssessmentInput(instrument); const evaluation = evaluateTest(input, instrument); const sequence = database.settings.sequence || 1; const year = new Date().getFullYear(); const createdAt = new Date().toISOString();
    const test = {
      id: createId('test'), rootId: null, instrumentId: instrument.id, assessmentType: 'TYPE_EVALUATION', coverageMode: 'FULL_R76', certificateNumber: `DRAFT-${year}-${String(sequence).padStart(5, '0')}`,
      verificationCode: `MS${String(year).slice(-2)}${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`, status: 'Draft', revision: 1, recordVersion: 1,
      inspectorName: String(req.body.inspectorName || req.user.name).trim(), inspectorId: String(req.body.inspectorId || req.user.officerId || '').trim(),
      createdBy: req.user.id, contributors: [req.user.id], laboratory: String(req.body.laboratory || instrument.location || database.settings.laboratoryName).trim(),
      environment: { temperature: req.body.temperature === undefined ? '' : Number(req.body.temperature), humidity: req.body.humidity === undefined ? '' : Number(req.body.humidity), barometricPressure: req.body.barometricPressure === undefined ? '' : Number(req.body.barometricPressure) },
      notes: String(req.body.notes || '').trim(), input, evaluation, evidence: [], reviewHistory: [], createdAt, updatedAt: createdAt,
      instrumentSnapshot: createInstrumentSnapshot(instrument), ruleSnapshot: createRuleSnapshot(), ruleProfileId: database.settings.activeRuleProfileId,
    };
    test.rootId = test.id; database.tests.push(test); database.settings.sequence = sequence + 1;
    appendAudit(database, { action: 'Type-evaluation case created', targetType: 'Test', targetId: test.id, actor: actor(req), details: { applicationNumber: instrument.applicationNumber, technicalResult: evaluation.status, ruleProfileId: test.ruleProfileId, draftSequence: sequence } });
    return { test, instrument };
  });
  res.status(201).json({ test: { ...created.test, instrument: created.instrument } });
}

app.post('/api/tests', authenticate, requireRoles('TESTER'), createTypeEvaluation);
app.post('/api/type-evaluations', authenticate, requireRoles('TESTER'), createTypeEvaluation);

app.patch('/api/tests/:id', authenticate, requireRoles('TESTER'), async (req, res) => {
  const saved = await updateStore((database) => {
    const found = database.tests.find((item) => item.id === req.params.id);
    if (!found) throw Object.assign(new Error('Type-evaluation case not found.'), { status: 404 });
    if (!['Draft', 'Returned'].includes(found.status)) throw Object.assign(new Error('Only draft or returned work can be edited.'), { status: 409 });
    if (found.createdBy !== req.user.id && req.user.role !== 'ADMIN') throw Object.assign(new Error('Only the assigned tester can edit this case.'), { status: 403 });
    if (req.body.expectedVersion === undefined) throw Object.assign(new Error('expectedVersion is required for every controlled edit.'), { status: 428, currentVersion: found.recordVersion });
    if (Number(req.body.expectedVersion) !== found.recordVersion) throw Object.assign(new Error(`This case changed in another tab. Reload version ${found.recordVersion}.`), { status: 409, currentVersion: found.recordVersion });
    assertExecutableRuleSnapshot(found);
    for (const field of ['inspectorName', 'inspectorId', 'laboratory', 'notes']) if (req.body[field] !== undefined) found[field] = String(req.body[field]).trim();
    if (req.body.environment) found.environment = { ...found.environment, ...req.body.environment };
    if (req.body.input) found.input = req.body.input;
    found.contributors ||= [found.createdBy]; if (!found.contributors.includes(req.user.id)) found.contributors.push(req.user.id);
    found.evaluation = evaluateTest(found.input || {}, found.instrumentSnapshot, RULE_PROFILE); found.updatedAt = new Date().toISOString(); found.recordVersion += 1;
    appendAudit(database, { action: 'Type-evaluation draft saved', targetType: 'Test', targetId: found.id, actor: actor(req), details: { recordVersion: found.recordVersion, coveragePercent: found.evaluation.coverage.percent } });
    return found;
  });
  res.json({ test: saved });
});

app.patch('/api/tests/:id/sections/:sectionId', authenticate, requireRoles('TESTER'), async (req, res) => {
  if (!REPORT_SECTIONS.some((item) => item.id === req.params.sectionId)) return res.status(404).json({ error: 'Unknown R 76 report section.' });
  const saved = await updateStore((database) => {
    const found = database.tests.find((item) => item.id === req.params.id);
    if (!found) throw Object.assign(new Error('Type-evaluation case not found.'), { status: 404 });
    if (!['Draft', 'Returned'].includes(found.status)) throw Object.assign(new Error('This case is locked.'), { status: 409 });
    if (found.createdBy !== req.user.id && req.user.role !== 'ADMIN') throw Object.assign(new Error('Only the assigned tester can edit this case.'), { status: 403 });
    if (req.body.expectedVersion === undefined) throw Object.assign(new Error('expectedVersion is required for every section save.'), { status: 428, currentVersion: found.recordVersion });
    if (Number(req.body.expectedVersion) !== found.recordVersion) throw Object.assign(new Error(`This section changed in another tab. Reload version ${found.recordVersion}.`), { status: 409, currentVersion: found.recordVersion });
    assertExecutableRuleSnapshot(found);
    found.input ||= {}; found.input.sections ||= {}; found.input.sections[req.params.sectionId] = req.body.section || {};
    found.contributors ||= [found.createdBy]; if (!found.contributors.includes(req.user.id)) found.contributors.push(req.user.id);
    found.evaluation = evaluateTest(found.input, found.instrumentSnapshot, RULE_PROFILE); found.updatedAt = new Date().toISOString(); found.recordVersion += 1;
    appendAudit(database, { action: 'R 76 section autosaved', targetType: 'Test', targetId: found.id, actor: actor(req), details: { sectionId: req.params.sectionId, recordVersion: found.recordVersion, outcome: found.evaluation.sections[req.params.sectionId]?.outcome } }); return found;
  });
  res.json({ test: saved, section: saved.evaluation.sections[req.params.sectionId] });
});

app.get('/api/tests/:id', authenticate, async (req, res) => {
  const database = await readStore(); const test = database.tests.find((item) => item.id === req.params.id);
  if (!test) return res.status(404).json({ error: 'Test report not found.' });
  const integrity = verifyTestIntegrity(test);
  if (test.integrityVersion >= 3 && ['Approved', 'Revoked'].includes(test.status) && !integrity.valid) return res.status(409).json({ error: 'The issued record failed its content or current-status integrity check. Its mutable projection will not be displayed.', integrity });
  res.json({ test: addInstrument(database, test), reference: oimlReference, integrityValid: integrity.valid, integrity });
});

app.post('/api/tests/:id/evidence', authenticate, requireRoles('TESTER'), upload.single('evidence'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a JPG, PNG, WebP or PDF file up to 8 MB.' });
  if (!(await fileMatchesDeclaredType(req.file))) { await fs.unlink(req.file.path); return res.status(400).json({ error: 'The file content does not match its declared type.' }); }
  try {
    const sectionId = String(req.body.sectionId || 'construction');
    if (!REPORT_SECTIONS.some((item) => item.id === sectionId)) throw Object.assign(new Error('Choose the R 76 section this evidence supports.'), { status: 400 });
    const note = String(req.body.note || '').trim(); if (note.length < 5) throw Object.assign(new Error('Explain what this evidence proves in at least five characters.'), { status: 400 });
    const evidence = { id: createId('evidence'), name: path.basename(req.file.originalname).slice(0, 120), storageKey: req.file.filename, type: req.file.mimetype, size: req.file.size, fileSha256: await hashFile(req.file.path), sectionId, note, uploadedAt: new Date().toISOString(), uploadedBy: req.user.id };
    const test = await updateStore((database) => {
      const found = database.tests.find((item) => item.id === req.params.id);
      if (!found) { const error = new Error('Test report not found.'); error.status = 404; throw error; }
      if (!['Draft', 'Returned'].includes(found.status)) { const error = new Error('Evidence is locked after submission. Create a correction revision if changes are needed.'); error.status = 409; throw error; }
      if (found.createdBy !== req.user.id && req.user.role !== 'ADMIN') { const error = new Error('Only the assigned tester can add evidence.'); error.status = 403; throw error; }
      found.contributors ||= [found.createdBy]; if (!found.contributors.includes(req.user.id)) found.contributors.push(req.user.id);
      found.evidence.push(evidence); found.updatedAt = evidence.uploadedAt; found.recordVersion += 1;
      appendAudit(database, { action: 'Hashed evidence attached', targetType: 'Test', targetId: found.id, actor: actor(req), details: { evidenceId: evidence.id, sectionId, type: evidence.type, size: evidence.size, fileSha256: evidence.fileSha256 } });
      return found;
    });
    res.status(201).json({ evidence, test });
  } catch (error) { await fs.unlink(req.file.path).catch(() => {}); throw error; }
});

app.get('/api/evidence/:id', authenticate, async (req, res) => {
  const database = await readStore(); let evidence;
  for (const test of database.tests) { evidence = test.evidence?.find((item) => item.id === req.params.id); if (evidence) break; }
  if (!evidence?.storageKey) return res.status(404).json({ error: 'Evidence file not found.' });
  const filePath = evidenceFilePath(evidence.storageKey); const actual = await hashFile(filePath);
  if (actual !== evidence.fileSha256) return res.status(409).json({ error: 'Evidence integrity check failed.' });
  res.type(evidence.type).setHeader('Content-Disposition', `attachment; filename="${evidence.name.replace(/["\r\n]/g, '')}"`); res.sendFile(filePath);
});

app.post('/api/tests/:id/submit', authenticate, requireRoles('TESTER'), async (req, res) => {
  const test = await updateStore(async (database) => {
    const found = database.tests.find((item) => item.id === req.params.id);
    if (!found) { const error = new Error('Test report not found.'); error.status = 404; throw error; }
    if (!['Draft', 'Returned'].includes(found.status)) { const error = new Error('Only a draft or returned test can be submitted.'); error.status = 409; throw error; }
    if (found.createdBy !== req.user.id && req.user.role !== 'ADMIN') { const error = new Error('Only the assigned tester can submit this test.'); error.status = 403; throw error; }
    if (req.body.expectedVersion === undefined || Number(req.body.expectedVersion) !== found.recordVersion) throw Object.assign(new Error(`Reload the latest saved version ${found.recordVersion} before submission.`), { status: 409, currentVersion: found.recordVersion });
    await assertCaseReadyForControl(found);
    found.status = 'Submitted'; found.submittedAt = new Date().toISOString(); found.updatedAt = found.submittedAt; found.recordVersion += 1;
    found.submissionSnapshot = createSubmissionSnapshot(found); found.submissionHistory ||= []; found.submissionHistory.push(found.submissionSnapshot);
    appendAudit(database, { action: 'Complete type evaluation submitted for independent review', targetType: 'Test', targetId: found.id, actor: actor(req), details: { technicalResult: found.evaluation.status, revision: found.revision, recordVersion: found.recordVersion, ruleHash: found.ruleSnapshot.contentHash, coverage: found.evaluation.coverage } });
    return found;
  });
  res.json({ test });
});

app.post('/api/tests/:id/review', authenticate, requireRoles('REVIEWER'), async (req, res) => {
  const decision = String(req.body.decision || '').toUpperCase(); const comment = String(req.body.comment || '').trim();
  if (!['APPROVE', 'RETURN'].includes(decision)) return res.status(400).json({ error: 'Decision must be APPROVE or RETURN.' });
  if (comment.length < 5) return res.status(400).json({ error: 'Enter a meaningful review note of at least 5 characters.' });
  const test = await updateStore(async (database) => {
    const found = database.tests.find((item) => item.id === req.params.id);
    if (!found) { const error = new Error('Test report not found.'); error.status = 404; throw error; }
    if (found.status !== 'Submitted') { const error = new Error('Only a submitted test can be reviewed.'); error.status = 409; throw error; }
    const contributors = found.contributors || [found.createdBy]; if (contributors.includes(req.user.id)) { const error = new Error('Four-eyes control: anyone who created or edited this record cannot review or approve it.'); error.status = 403; throw error; }
    const at = new Date().toISOString(); found.reviewHistory ||= [];
    found.reviewHistory.push({ decision, comment, reviewer: { id: req.user.id, name: req.user.name, officerId: req.user.officerId }, at });
    if (decision === 'RETURN') {
      found.status = 'Returned'; found.updatedAt = at; found.recordVersion += 1;
      appendAudit(database, { action: 'Test returned for correction', targetType: 'Test', targetId: found.id, actor: actor(req), details: { comment, revision: found.revision } });
    } else {
      if (!found.submissionSnapshot || digest(createSubmissionSnapshot(found)) !== digest(found.submissionSnapshot)) throw Object.assign(new Error('The live submitted record no longer matches its immutable submission snapshot. Approval is blocked.'), { status: 409 });
      await assertCaseReadyForControl(found);
      found.status = 'Approved'; found.certificateNumber = found.certificateNumber.replace(/^DRAFT-/, 'MS-'); found.approvedAt = at;
      found.approvedBy = { id: req.user.id, name: req.user.name, officerId: req.user.officerId || '' }; found.updatedAt = at; found.recordVersion += 1;
      found.approvalSnapshot = createApprovalSnapshot(found); found.integrityVersion = 3; found.integrityHash = computeTestIntegrity(found); found.statusIntegrityHash = computeStatusIntegrity(found);
      appendAudit(database, { action: 'Type evaluation independently approved', targetType: 'Test', targetId: found.id, actor: actor(req), details: { technicalResult: found.evaluation.status, integrityHash: found.integrityHash, statusIntegrityHash: found.statusIntegrityHash, comment, recordVersion: found.recordVersion } });
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
    found.status = 'Revoked'; found.revokedAt = new Date().toISOString(); found.revokedBy = req.user.id; found.revocationReason = reason; found.updatedAt = found.revokedAt; found.recordVersion += 1; found.statusIntegrityHash = computeStatusIntegrity(found);
    appendAudit(database, { action: 'Approved report revoked', targetType: 'Test', targetId: found.id, actor: actor(req), details: { reason, integrityHash: found.integrityHash, statusIntegrityHash: found.statusIntegrityHash, recordVersion: found.recordVersion } });
    return found;
  });
  res.json({ test });
});

app.post('/api/tests/:id/revise', authenticate, requireRoles('TESTER'), async (req, res) => {
  const revised = await updateStore((database) => {
    const original = database.tests.find((item) => item.id === req.params.id);
    if (!original) { const error = new Error('Test report not found.'); error.status = 404; throw error; }
    if (original.status !== 'Revoked') { const error = new Error('Edit and resubmit a returned case directly. A new correction revision is created only from a revoked issued report.'); error.status = 409; throw error; }
    const rootId = original.rootId || original.id; const activeSuccessor = database.tests.find((item) => item.rootId === rootId && item.id !== original.id && ['Draft', 'Returned', 'Submitted', 'Approved'].includes(item.status));
    if (activeSuccessor) throw Object.assign(new Error(`Revision ${activeSuccessor.revision} already exists for this report lineage.`), { status: 409 });
    const createdAt = new Date().toISOString();
    const copy = { ...structuredClone(original), id: createId('test'), rootId, status: 'Draft', revision: (original.revision || 1) + 1, recordVersion: 1, parentTestId: original.id, certificateNumber: `${original.certificateNumber.replace(/^MS-/, 'DRAFT-')}-R${(original.revision || 1) + 1}`, verificationCode: `MS${String(new Date().getFullYear()).slice(-2)}${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`, createdBy: req.user.id, contributors: [req.user.id], inspectorName: req.user.name, inspectorId: req.user.officerId || original.inspectorId, evidence: (original.evidence || []).map((item) => ({ ...item, carriedForwardFrom: original.id })), reviewHistory: [], submissionHistory: [], createdAt, updatedAt: createdAt };
    for (const field of ['submittedAt', 'approvedAt', 'approvedBy', 'integrityHash', 'statusIntegrityHash', 'approvalSnapshot', 'submissionSnapshot', 'revokedAt', 'revokedBy', 'revocationReason']) delete copy[field];
    database.tests.push(copy);
    appendAudit(database, { action: 'Correction revision created', targetType: 'Test', targetId: copy.id, actor: actor(req), details: { parentTestId: original.id, revision: copy.revision } });
    return copy;
  });
  res.status(201).json({ test: revised });
});

function verificationUrl(req, test) {
  const configured = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (production && !configured) throw new Error('PUBLIC_BASE_URL is required in production.');
  return `${configured || `${req.protocol}://${req.get('host')}`}/verify/${test.verificationCode}`;
}

function requireIssuedReport(test, res) {
  if (!test) { res.status(404).json({ error: 'Test report not found.' }); return false; }
  if (!['Approved', 'Revoked'].includes(test.status)) { res.status(409).json({ error: 'Only an approved or revoked report can be exported.' }); return false; }
  if (test.coverageMode === 'LEGACY_PARTIAL') { res.status(409).json({ error: 'This preserved legacy report predates the governed type-evaluation profile. Export it through the legacy archive; MaapSure will not place old observations into the current R 76 template.' }); return false; }
  const integrity = verifyTestIntegrity(test); if (!integrity.valid) { res.status(409).json({ error: 'The issued record failed its content or current-status integrity check. Export is blocked.', integrity }); return false; }
  return true;
}

app.get('/api/tests/:id/report.pdf', authenticate, async (req, res) => {
  const database = await readStore(); const test = database.tests.find((item) => item.id === req.params.id);
  if (!requireIssuedReport(test, res)) return;
  const instrument = test.instrumentSnapshot || database.instruments.find((item) => item.id === test.instrumentId);
  const pdf = await createReportPdf({ test, instrument, verificationUrl: verificationUrl(req, test) });
  res.type('pdf').setHeader('Content-Disposition', `attachment; filename="${test.certificateNumber}.pdf"`); res.send(pdf);
});

app.get('/api/tests/:id/report.doc', authenticate, async (req, res) => {
  const database = await readStore(); const test = database.tests.find((item) => item.id === req.params.id);
  if (!requireIssuedReport(test, res)) return;
  const instrument = test.instrumentSnapshot || database.instruments.find((item) => item.id === test.instrumentId);
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
  const integrity = verifyTestIntegrity(test);
  if (!integrity.valid) return res.json({ valid: false, authentic: false, integrity, error: 'The issued record failed its content or current-status integrity check.' });
  const issued = test.integrityVersion >= 3 ? test.approvalSnapshot : test; const instrument = issued.instrumentSnapshot || test.instrumentSnapshot || database.instruments.find((item) => item.id === test.instrumentId);
  res.json({
    valid: integrity.valid && test.status === 'Approved', authentic: integrity.valid, revoked: test.status === 'Revoked', integrity,
    report: {
      certificateNumber: issued.certificateNumber, verificationCode: issued.verificationCode, status: issued.evaluation.status, workflowStatus: test.status,
      approvedAt: issued.approvedAt, laboratory: issued.laboratory, inspectorName: issued.inspectorName, approvedBy: issued.approvedBy,
      standard: issued.evaluation.standard, reportFormat: issued.evaluation.reportFormat, ruleVersion: issued.evaluation.ruleVersion,
      integrityHash: test.integrityHash, statusIntegrityHash: test.statusIntegrityHash, revocationReason: test.revocationReason,
      assessmentType: issued.assessmentType, coverageMode: test.coverageMode, coverage: issued.evaluation.coverage, syntheticDemo: Boolean(issued.input?.demoFixture),
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
  res.status(error.status || 500).json({ error: error.message || 'Something went wrong.', currentVersion: error.currentVersion });
});

await ensureStore();
if (production) {
  const database = await readStore();
  const knownDemoCredentials = new Map([
    ['admin@maapsure.in', 'Demo@123'], ['inspector@maapsure.in', 'Inspect@123'],
    ['reviewer@maapsure.in', 'Review@123'], ['auditor@maapsure.in', 'Audit@123'],
  ]);
  const unsafeAccount = database.users.find((user) => user.active && knownDemoCredentials.has(String(user.email || '').toLowerCase()) && verifyPassword(knownDemoCredentials.get(String(user.email).toLowerCase()), user));
  if (unsafeAccount) throw new Error(`Production startup blocked: replace or disable the demonstration credential for ${unsafeAccount.email}.`);
}
app.listen(port, () => console.log(`MaapSure is running at http://localhost:${port}`));
