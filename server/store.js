import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { createDemoAssessmentInput, evaluateTest, RULE_PROFILE } from '../shared/oimlEngine.js';
import { REPORT_SECTIONS, REQUIREMENT_FAMILIES, normalizeInstrument } from '../shared/r76Catalog.js';
import { ALL_CHECKLIST_REQUIREMENTS } from '../shared/r76Checklist.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const dataDir = process.env.MAAPSURE_DATA_DIR ? path.resolve(process.env.MAAPSURE_DATA_DIR) : path.resolve(currentDir, '../data');
export const uploadDir = path.join(dataDir, 'uploads');
export const backupDir = path.join(dataDir, 'backups');
const databasePath = path.join(dataDir, 'database.json');
let updateQueue = Promise.resolve();
const demoMode = process.env.NODE_ENV !== 'production' && process.env.MAAPSURE_DEMO_MODE !== 'false';

const nowMinus = (days) => new Date(Date.now() - 86400000 * days).toISOString();
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
export const digest = (value) => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
const ENGINE_ARTIFACT_HASH = digest(readFileSync(path.resolve(currentDir, '../shared/oimlEngine.js'), 'utf8'));

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, passwordHash: scryptSync(String(password), salt, 64).toString('hex') };
}

export function verifyPassword(password, user) {
  if (!user?.salt || !user?.passwordHash) return false;
  const actual = scryptSync(String(password), user.salt, 64); const expected = Buffer.from(user.passwordHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function seedUsers() {
  return [
    { id: 'user-admin', email: 'admin@maapsure.in', name: 'Dr. Kavita Rao', role: 'ADMIN', roleLabel: 'Laboratory Administrator', initials: 'KR', active: true, ...hashPassword('Demo@123') },
    { id: 'user-tester', email: 'inspector@maapsure.in', name: 'Arjun Sharma', role: 'TESTER', roleLabel: 'Legal Metrology Tester', initials: 'AS', officerId: 'LMO-0186', active: true, ...hashPassword('Inspect@123') },
    { id: 'user-reviewer', email: 'reviewer@maapsure.in', name: 'Meera Nair', role: 'REVIEWER', roleLabel: 'Reviewing Officer', initials: 'MN', officerId: 'LMO-0214', active: true, ...hashPassword('Review@123') },
    { id: 'user-auditor', email: 'auditor@maapsure.in', name: 'Vikram Sen', role: 'AUDITOR', roleLabel: 'Read-only Auditor', initials: 'VS', active: true, ...hashPassword('Audit@123') },
  ];
}

function seedInstruments() {
  const common = {
    assessmentType: 'TYPE_EVALUATION', temperatureMin: -10, temperatureMax: 40, status: 'Active', dossierVersion: 1, revisionHistory: [], createdAt: nowMinus(7),
    softwareVersion: 'DEMO-1.0', softwareIdentification: 'SYNTHETIC-DEMO-SOFTWARE-FINGERPRINT',
    interfacesDescription: 'Synthetic I/O and legally relevant data-flow declaration for the SIH demonstration dossier.',
    connectedEquipment: '', submittedDocumentIndex: 'Synthetic application, drawings, manual, markings, component list, software description and interface declaration.',
  };
  return [
    normalizeInstrument({ ...common, id: 'ins-retail-30', applicationNumber: 'LM-MA-2026-0418', applicant: 'Apex Weighing Systems Pvt Ltd', applicantAddress: 'New Delhi, India', manufacturer: 'Apex Weighing Systems', model: 'RetailPro 30', typeDesignation: 'RetailPro 30 family', serialNumber: 'AWS-RP30-24091', accuracyClass: 'III', maxCapacity: 30, minCapacity: 0.2, verificationInterval: 0.01, actualScaleInterval: 0.01, unit: 'kg', location: 'Model Approval Lab, New Delhi', softwareVersion: 'RP30-3.2.1', features: { indicatingMode: 'self', digitalIndication: true, electronic: true, rangeType: 'single', ranges: [{ id: 'range-1', min: 0.2, max: 30, e: 0.01, d: 0.01 }], loadReceptorType: 'platform', supportPoints: 4, installedFixed: false, levelIndicator: true, hasZeroSetting: true, zeroTracking: true, hasTare: true, tareType: 'subtractive', presetTare: true, hasPrinter: true, hasDataStorage: true, directSales: true, priceComputing: true, priceLabeling: true, softwareControlled: true, moduleType: 'complete', mainsPower: true, nominalVoltage: 230, minVoltage: 195.5, maxVoltage: 253, frequencyHz: 50, ioLines: true, questionnaireConfirmed: true } }),
    normalizeInstrument({ ...common, id: 'ins-platform-150', applicationNumber: 'LM-MA-2026-0420', applicant: 'Bharat Scale Works', manufacturer: 'Bharat Scale Works', model: 'PlatMax 150', typeDesignation: 'PlatMax industrial platform', serialNumber: 'BSW-PM-18377', accuracyClass: 'III', maxCapacity: 150, minCapacity: 1, verificationInterval: 0.05, actualScaleInterval: 0.05, unit: 'kg', location: 'Regional Lab, Jaipur', features: { indicatingMode: 'self', digitalIndication: true, electronic: true, rangeType: 'single', ranges: [{ id: 'range-1', min: 1, max: 150, e: 0.05, d: 0.05 }], loadReceptorType: 'platform', supportPoints: 4, installedFixed: true, hasZeroSetting: true, zeroTracking: true, hasTare: true, hasDataStorage: true, softwareControlled: true, mainsPower: true, nominalVoltage: 230, minVoltage: 195.5, maxVoltage: 253, frequencyHz: 50, ioLines: true, questionnaireConfirmed: true } }),
    normalizeInstrument({ ...common, id: 'ins-bridge-60t', applicationNumber: 'LM-MA-2026-0421', applicant: 'National Industrial Weighing Ltd', manufacturer: 'National Industrial Weighing', model: 'RoadMaster 60T', typeDesignation: 'RoadMaster modular weighbridge', serialNumber: 'NIW-RM-60214', accuracyClass: 'III', maxCapacity: 60000, minCapacity: 400, verificationInterval: 20, actualScaleInterval: 20, unit: 'kg', location: 'Heavy Capacity Lab, Gurugram', features: { indicatingMode: 'self', digitalIndication: true, electronic: true, rangeType: 'single', ranges: [{ id: 'range-1', min: 400, max: 60000, e: 20, d: 20 }], loadReceptorType: 'rolling-only', supportPoints: 8, rollingLoad: true, bidirectionalRolling: true, installedFixed: true, hasZeroSetting: true, zeroTracking: true, hasTare: false, hasPrinter: true, hasDataStorage: true, softwareControlled: true, mainsPower: true, nominalVoltage: 230, minVoltage: 195.5, maxVoltage: 253, frequencyHz: 50, ioLines: true, questionnaireConfirmed: true } }),
  ];
}

export function createRuleSnapshot() {
  const content = { profile: RULE_PROFILE, reportSections: REPORT_SECTIONS, requirementFamilies: REQUIREMENT_FAMILIES, detailedChecklist: ALL_CHECKLIST_REQUIREMENTS, engineArtifactHash: ENGINE_ARTIFACT_HASH };
  return { id: RULE_PROFILE.id, version: RULE_PROFILE.version, standard: RULE_PROFILE.standard, reportFormat: RULE_PROFILE.reportFormat, engineArtifactHash: ENGINE_ARTIFACT_HASH, contentHash: digest(content), sources: ['OIML R 76-1:2006', 'OIML R 76-2:2007'], evaluatorPolicy: 'Exact engine artifact required; mismatches are blocked pending governed migration.' };
}

export function createInstrumentSnapshot(instrument) { return structuredClone(normalizeInstrument(instrument)); }

export function createSubmissionSnapshot(test) {
  return {
    id: test.id, rootId: test.rootId || test.id, revision: test.revision, recordVersion: test.recordVersion,
    applicationNumber: test.instrumentSnapshot?.applicationNumber, assessmentType: test.assessmentType,
    certificateNumber: test.certificateNumber, verificationCode: test.verificationCode,
    inspectorName: test.inspectorName, inspectorId: test.inspectorId, laboratory: test.laboratory,
    environment: test.environment, notes: test.notes, input: test.input, evaluation: test.evaluation,
    instrumentSnapshot: test.instrumentSnapshot, ruleSnapshot: test.ruleSnapshot,
    evidenceManifest: test.evidence, createdAt: test.createdAt, submittedAt: test.submittedAt,
  };
}

export function createApprovalSnapshot(test) {
  return {
    id: test.id, rootId: test.rootId || test.id, revision: test.revision, applicationNumber: test.instrumentSnapshot?.applicationNumber,
    assessmentType: test.assessmentType, certificateNumber: test.certificateNumber, verificationCode: test.verificationCode,
    inspectorName: test.inspectorName, inspectorId: test.inspectorId, laboratory: test.laboratory, environment: test.environment, notes: test.notes,
    input: test.input, evaluation: test.evaluation, instrumentSnapshot: test.instrumentSnapshot, ruleSnapshot: test.ruleSnapshot,
    evidenceManifest: test.evidence, createdAt: test.createdAt, submittedAt: test.submittedAt, approvedAt: test.approvedAt,
    approvedBy: test.approvedBy, reviewHistory: test.reviewHistory, outcome: test.evaluation.status,
  };
}

export function computeTestIntegrity(test) { return digest(test.approvalSnapshot || createApprovalSnapshot(test)); }
export function computeStatusIntegrity(test) { return digest({ issuedFingerprint: test.integrityHash, workflowStatus: test.status, revokedAt: test.revokedAt || null, revokedBy: test.revokedBy || null, revocationReason: test.revocationReason || null }); }

function legacyIntegrity(test) {
  return digest({
    id: test.id, instrumentId: test.instrumentId, certificateNumber: test.certificateNumber, verificationCode: test.verificationCode,
    inspectorName: test.inspectorName, inspectorId: test.inspectorId, laboratory: test.laboratory, temperature: test.temperature,
    humidity: test.humidity, notes: test.notes, input: test.input, evaluation: test.evaluation, evidence: test.evidence,
    createdAt: test.createdAt, submittedAt: test.submittedAt, approvedAt: test.approvedAt, approvedBy: test.approvedBy,
    ruleProfileId: test.ruleProfileId, revision: test.revision,
  });
}

export function verifyTestIntegrity(test) {
  if (!test?.integrityHash) return { valid: null, contentValid: null, statusValid: null, version: test?.integrityVersion || 0 };
  if ((test.integrityVersion || 1) === 1) { const contentValid = legacyIntegrity(test) === test.integrityHash; return { valid: contentValid, contentValid, statusValid: null, version: 1, limitation: 'Legacy fingerprint does not bind the instrument snapshot, evidence bytes or revocation state.' }; }
  if (test.integrityVersion === 2) { const contentValid = computeTestIntegrity(test) === test.integrityHash; const statusValid = computeStatusIntegrity(test) === test.statusIntegrityHash; return { valid: contentValid && statusValid, contentValid, statusValid, version: 2, limitation: 'Version 2 binds its stored approval snapshot but does not cross-check every mutable issued-view field.' }; }
  const snapshotValid = digest(test.approvalSnapshot) === test.integrityHash; const projectionValid = digest(createApprovalSnapshot(test)) === test.integrityHash;
  const contentValid = snapshotValid && projectionValid; const statusValid = computeStatusIntegrity(test) === test.statusIntegrityHash;
  return { valid: contentValid && statusValid, contentValid, snapshotValid, projectionValid, statusValid, version: 3 };
}

export function appendAudit(database, event) {
  const previousHash = database.audit.at(-1)?.hash || 'GENESIS';
  const record = { id: createId('audit'), sequence: database.audit.length + 1, at: event.at || new Date().toISOString(), action: event.action, targetType: event.targetType || 'System', targetId: event.targetId || null, actor: event.actor ? { id: event.actor.id, name: event.actor.name, role: event.actor.role } : { id: 'system', name: 'MaapSure System', role: 'SYSTEM' }, details: event.details || {}, previousHash };
  record.hash = digest(record); database.audit.push(record); return record;
}

export function verifyAuditChain(audit = []) {
  let previousHash = 'GENESIS';
  for (let index = 0; index < audit.length; index += 1) { const item = audit[index]; const { hash, ...unsigned } = item; const expected = digest(unsigned); if (item.previousHash !== previousHash || item.hash !== expected) return { valid: false, checked: index, brokenAt: item.id }; previousHash = item.hash; }
  return { valid: true, checked: audit.length, headHash: previousHash };
}

function createComprehensiveSeed(instrument) {
  const createdAt = nowMinus(2); const input = createDemoAssessmentInput(instrument); const evaluation = evaluateTest(input, instrument);
  const test = {
    id: 'test-type-evaluation-seed', rootId: 'test-type-evaluation-seed', instrumentId: instrument.id, assessmentType: 'TYPE_EVALUATION', coverageMode: 'FULL_R76',
    certificateNumber: 'MS-2026-00418', verificationCode: 'MS26FULL418', status: 'Approved', revision: 1, recordVersion: 3,
    inspectorName: 'Arjun Sharma', inspectorId: 'LMO-0186', createdBy: 'user-tester', laboratory: instrument.location,
    environment: { temperature: 24.2, humidity: 48, barometricPressure: 1013.2 }, notes: 'Complete synthetic SIH demonstration fixture; not a statutory laboratory certificate.',
    input, evaluation, instrumentSnapshot: createInstrumentSnapshot(instrument), ruleSnapshot: createRuleSnapshot(),
    evidence: [{ id: 'evidence-demo-manifest', name: 'Synthetic demonstration evidence manifest', type: 'text/plain', size: 0, fileSha256: digest('synthetic-demonstration-evidence'), sectionId: 'construction', note: 'Synthetic demo only; no physical file.', uploadedAt: createdAt, uploadedBy: 'system', storageKey: null }],
    reviewHistory: [{ decision: 'APPROVE', comment: 'Synthetic fixture reviewed for SIH workflow demonstration only.', reviewer: { id: 'user-reviewer', name: 'Meera Nair', officerId: 'LMO-0214' }, at: createdAt }],
    createdAt, updatedAt: createdAt, submittedAt: createdAt, approvedAt: createdAt, approvedBy: { id: 'user-reviewer', name: 'Meera Nair', officerId: 'LMO-0214' }, ruleProfileId: RULE_PROFILE.id,
  };
  test.submissionSnapshot = createSubmissionSnapshot(test); test.approvalSnapshot = createApprovalSnapshot(test); test.integrityVersion = 3; test.integrityHash = computeTestIntegrity(test); test.statusIntegrityHash = computeStatusIntegrity(test); return test;
}

function seedDatabase() {
  const instruments = seedInstruments(); const test = createComprehensiveSeed(instruments[0]);
  const database = { schemaVersion: 3, users: seedUsers(), instruments, tests: [test], audit: [], ruleProfiles: [RULE_PROFILE], settings: { laboratoryName: 'National Legal Metrology Test Centre', laboratoryCode: 'NLMTC-ND', sequence: 419, activeRuleProfileId: RULE_PROFILE.id, retentionYears: 10 } };
  appendAudit(database, { action: 'System initialized', details: { schemaVersion: 3, ruleProfile: RULE_PROFILE.id } });
  appendAudit(database, { action: 'Synthetic full-coverage demonstration fixture created', targetType: 'Test', targetId: test.id, details: { result: test.evaluation.status, integrityHash: test.integrityHash, disclaimer: 'Not a statutory certificate' } }); return database;
}

function enrichLegacyInstrument(instrument, index) {
  const normalized = normalizeInstrument({ ...instrument, applicationNumber: instrument.applicationNumber || `LEGACY-${String(index + 1).padStart(4, '0')}`, applicant: instrument.applicant || instrument.manufacturer, typeDesignation: instrument.typeDesignation || instrument.model, temperatureMin: instrument.temperatureMin ?? -10, temperatureMax: instrument.temperatureMax ?? 40 });
  return { ...normalized, migrationProvenance: instrument.migrationProvenance || { sourceSchema: 2, importedAt: new Date().toISOString(), note: 'Missing type-dossier fields were explicitly marked as legacy defaults; re-confirm before new testing.' } };
}

function migrateDatabase(database) {
  let changed = false; database.schemaVersion ||= 1;
  if (!database.users && !demoMode) throw new Error('Production data store has no controlled user registry. Demo users will not be created automatically.');
  database.users ||= seedUsers(); database.audit ||= []; database.tests ||= []; database.instruments ||= []; database.settings ||= {};
  if (!database.settings.activeRuleProfileId || database.settings.activeRuleProfileId !== RULE_PROFILE.id) { database.settings.activeRuleProfileId = RULE_PROFILE.id; changed = true; }
  database.settings.retentionYears ||= 10; database.ruleProfiles ||= []; if (!database.ruleProfiles.some((item) => item.id === RULE_PROFILE.id)) { database.ruleProfiles.push(RULE_PROFILE); changed = true; }
  database.instruments = database.instruments.map((instrument, index) => {
    const migrated = instrument.applicationNumber && instrument.features ? instrument : enrichLegacyInstrument(instrument, index);
    if (migrated !== instrument) changed = true;
    if (!Number.isInteger(migrated.dossierVersion) || migrated.dossierVersion < 1) { migrated.dossierVersion = 1; changed = true; }
    if (!Array.isArray(migrated.revisionHistory)) { migrated.revisionHistory = []; changed = true; }
    return migrated;
  });
  if (demoMode) {
    for (const demoInstrument of seedInstruments()) {
      const existing = database.instruments.find((instrument) => instrument.id === demoInstrument.id);
      if (!existing) { database.instruments.push(demoInstrument); changed = true; continue; }
      for (const field of ['softwareVersion', 'softwareIdentification', 'interfacesDescription', 'submittedDocumentIndex']) {
        if (!String(existing[field] ?? '').trim()) { existing[field] = demoInstrument[field]; changed = true; }
      }
      if (!existing.features) { existing.features = demoInstrument.features; changed = true; }
      if (existing.features?.questionnaireConfirmed === undefined) { existing.features.questionnaireConfirmed = true; changed = true; }
    }
  }
  for (const test of database.tests) {
    test.recordVersion ||= 1; test.assessmentType ||= 'TYPE_EVALUATION'; test.rootId ||= test.id; test.revision ||= 1;
    if (!test.coverageMode) { test.coverageMode = 'LEGACY_PARTIAL'; test.integrityVersion ||= 1; test.migrationProvenance = { sourceSchema: database.schemaVersion, importedAt: new Date().toISOString(), note: 'Legacy report preserved without inventing missing observations or approval history.' }; changed = true; }
  }
  if (demoMode && !database.tests.some((test) => test.id === 'test-type-evaluation-seed')) { const seedInstrument = database.instruments.find((instrument) => instrument.id === 'ins-retail-30') || seedInstruments()[0]; database.tests.push(createComprehensiveSeed(seedInstrument)); changed = true; }
  if (database.audit.some((item) => !item.hash)) { const legacy = [...database.audit]; database.audit = []; appendAudit(database, { action: 'Audit ledger migrated with provenance', details: { legacyEvents: legacy.length } }); for (const event of legacy) appendAudit(database, { action: event.action || 'Legacy event', targetType: event.targetType || 'Legacy', targetId: event.targetId, at: event.at, details: { migrated: true, original: event } }); changed = true; }
  if (!database.audit.length) { appendAudit(database, { action: 'Audit ledger initialized during controlled upgrade', details: { importedTests: database.tests.length, importedInstruments: database.instruments.length } }); changed = true; }
  if (database.schemaVersion !== 3) { appendAudit(database, { action: 'Schema upgraded', details: { from: database.schemaVersion, to: 3, preservationPolicy: 'No missing approvals or observations invented' } }); database.schemaVersion = 3; changed = true; }
  return changed;
}

export async function ensureStore() {
  await fs.mkdir(uploadDir, { recursive: true }); await fs.mkdir(backupDir, { recursive: true });
  try { const database = JSON.parse(await fs.readFile(databasePath, 'utf8')); if (migrateDatabase(database)) await fs.writeFile(databasePath, JSON.stringify(database, null, 2)); }
  catch (error) {
    if (error.code === 'ENOENT' && demoMode) await fs.writeFile(databasePath, JSON.stringify(seedDatabase(), null, 2));
    else if (error.code === 'ENOENT') throw new Error('Production startup blocked: initialize a controlled data store and user registry; demo identities will not be seeded.');
    else if (error instanceof SyntaxError) throw new Error(`The MaapSure data store is not valid JSON. It was preserved at ${databasePath}; restore a controlled backup instead of replacing it.`);
    else throw error;
  }
}

export async function readStore() { await ensureStore(); return JSON.parse(await fs.readFile(databasePath, 'utf8')); }

export async function writeStore(database) {
  await fs.mkdir(backupDir, { recursive: true });
  try {
    const backupPath = path.join(backupDir, `database-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.json`);
    await fs.copyFile(databasePath, backupPath);
    const backups = (await fs.readdir(backupDir)).filter((name) => name.startsWith('database-') && name.endsWith('.json')).sort().reverse();
    for (const stale of backups.slice(20)) await fs.unlink(path.join(backupDir, stale));
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporaryPath = `${databasePath}.${randomUUID()}.tmp`; await fs.writeFile(temporaryPath, JSON.stringify(database, null, 2)); await fs.rename(temporaryPath, databasePath);
}

export function updateStore(change) {
  const operation = updateQueue.then(async () => { const database = await readStore(); const result = await change(database); await writeStore(database); return result; });
  updateQueue = operation.catch(() => {}); return operation;
}

export function createId(prefix) { return `${prefix}-${randomUUID()}`; }
