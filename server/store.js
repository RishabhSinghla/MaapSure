import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { CONDITIONAL_TESTS, evaluateTest, RULE_PROFILE } from '../shared/oimlEngine.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const dataDir = process.env.MAAPSURE_DATA_DIR ? path.resolve(process.env.MAAPSURE_DATA_DIR) : path.resolve(currentDir, '../data');
export const uploadDir = path.join(dataDir, 'uploads');
const databasePath = path.join(dataDir, 'database.json');

const nowMinus = (days) => new Date(Date.now() - 86400000 * days).toISOString();
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const digest = (value) => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, passwordHash: scryptSync(String(password), salt, 64).toString('hex') };
}

export function verifyPassword(password, user) {
  if (!user?.salt || !user?.passwordHash) return false;
  const actual = scryptSync(String(password), user.salt, 64);
  const expected = Buffer.from(user.passwordHash, 'hex');
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

function defaultExtendedInput(input, instrument) {
  const max = Number(instrument.maxCapacity); const e = Number(instrument.verificationInterval); const d = Number(instrument.actualScaleInterval || e);
  const load = Number((max * 0.5).toFixed(6));
  const atLoad = input?.performance?.find((row) => Number(row.load) === load)?.indication ?? load;
  return {
    ...input,
    temperatureZero: input?.temperatureZero || { points: [{ temperature: 20, zero: 0 }, { temperature: 25, zero: 0 }] },
    discrimination: input?.discrimination || { before: load, after: Number((load + d).toFixed(6)), extraLoad: Number((1.4 * d).toFixed(6)) },
    creep: input?.creep || { initial: load, at15: load, at30: load },
    warmUp: input?.warmUp || { points: [0, 5, 15, 30].map((minutes) => ({ minutes, zero: 0, load, indication: atLoad })) },
    voltageVariation: input?.voltageVariation || { points: [207, 230, 253].map((voltage) => ({ voltage, load, indication: atLoad })) },
    conditionalTests: input?.conditionalTests?.length ? input.conditionalTests : CONDITIONAL_TESTS.map((item) => ({ id: item.id, applicability: 'Not applicable', result: 'NOT TESTED', reason: 'Not applicable to this initial-verification demonstration scope.', evidenceNote: '' })),
  };
}

export function computeTestIntegrity(test) {
  return digest({
    id: test.id, instrumentId: test.instrumentId, certificateNumber: test.certificateNumber, verificationCode: test.verificationCode,
    inspectorName: test.inspectorName, inspectorId: test.inspectorId, laboratory: test.laboratory, temperature: test.temperature,
    humidity: test.humidity, notes: test.notes, input: test.input, evaluation: test.evaluation, evidence: test.evidence,
    createdAt: test.createdAt, submittedAt: test.submittedAt, approvedAt: test.approvedAt, approvedBy: test.approvedBy,
    ruleProfileId: test.ruleProfileId, revision: test.revision,
  });
}

export function appendAudit(database, event) {
  const previousHash = database.audit.at(-1)?.hash || 'GENESIS';
  const record = {
    id: createId('audit'), sequence: database.audit.length + 1, at: event.at || new Date().toISOString(),
    action: event.action, targetType: event.targetType || 'System', targetId: event.targetId || null,
    actor: event.actor ? { id: event.actor.id, name: event.actor.name, role: event.actor.role } : { id: 'system', name: 'MaapSure System', role: 'SYSTEM' },
    details: event.details || {}, previousHash,
  };
  record.hash = digest(record);
  database.audit.push(record);
  return record;
}

export function verifyAuditChain(audit = []) {
  let previousHash = 'GENESIS';
  for (let index = 0; index < audit.length; index += 1) {
    const item = audit[index];
    const { hash, ...unsigned } = item;
    const expected = digest(unsigned);
    if (item.previousHash !== previousHash || item.hash !== expected) return { valid: false, checked: index, brokenAt: item.id };
    previousHash = item.hash;
  }
  return { valid: true, checked: audit.length, headHash: previousHash };
}

function seedDatabase() {
  const instruments = [
    { id: 'ins-retail-30', manufacturer: 'Apex Weighing Systems', model: 'RetailPro 30', serialNumber: 'AWS-RP30-24091', accuracyClass: 'III', maxCapacity: 30, minCapacity: 0.2, verificationInterval: 0.01, actualScaleInterval: 0.01, unit: 'kg', location: 'Model Approval Lab, New Delhi', status: 'Active', createdAt: nowMinus(7) },
    { id: 'ins-platform-150', manufacturer: 'Bharat Scale Works', model: 'PlatMax 150', serialNumber: 'BSW-PM-18377', accuracyClass: 'III', maxCapacity: 150, minCapacity: 1, verificationInterval: 0.05, actualScaleInterval: 0.05, unit: 'kg', location: 'Regional Lab, Jaipur', status: 'Active', createdAt: nowMinus(7) },
    { id: 'ins-bridge-60t', manufacturer: 'National Industrial Weighing', model: 'RoadMaster 60T', serialNumber: 'NIW-RM-60214', accuracyClass: 'III', maxCapacity: 60000, minCapacity: 400, verificationInterval: 20, actualScaleInterval: 20, unit: 'kg', location: 'Heavy Capacity Lab, Gurugram', status: 'Due soon', createdAt: nowMinus(7) },
  ];
  const baseInput = {
    performance: [{ load: 0, indication: 0 }, { load: 5, indication: 5.003 }, { load: 15, indication: 15.008 }, { load: 30, indication: 30.011 }],
    repeatability: { load: 15, readings: [15.002, 15.006, 15.004] },
    eccentricity: { load: 10, positions: ['Centre', 'Front left', 'Front right', 'Rear left', 'Rear right'].map((position, index) => ({ position, indication: [10.002, 10.004, 10.001, 9.999, 10.003][index] })) },
    zeroReturn: { reading: 0.003 },
  };
  const date = nowMinus(2); const input = defaultExtendedInput(baseInput, instruments[0]);
  const test = {
    id: 'test-pass-seed', instrumentId: instruments[0].id, certificateNumber: 'MS-2026-00418', verificationCode: 'MS26A418',
    status: 'Approved', revision: 1, inspectorName: 'Arjun Sharma', inspectorId: 'LMO-0186', createdBy: 'user-tester',
    laboratory: instruments[0].location, temperature: 24.2, humidity: 48, notes: 'All controlled checks completed.',
    input, evaluation: evaluateTest(input, instruments[0]), evidence: [], createdAt: date, submittedAt: date, approvedAt: date,
    approvedBy: { id: 'user-reviewer', name: 'Meera Nair', officerId: 'LMO-0214' }, ruleProfileId: RULE_PROFILE.id,
  };
  test.integrityHash = computeTestIntegrity(test);
  const database = {
    schemaVersion: 2, users: seedUsers(), instruments, tests: [test], audit: [], ruleProfiles: [RULE_PROFILE],
    settings: { laboratoryName: 'National Legal Metrology Test Centre', laboratoryCode: 'NLMTC-ND', sequence: 419, activeRuleProfileId: RULE_PROFILE.id, retentionYears: 10 },
  };
  appendAudit(database, { action: 'System initialized', details: { schemaVersion: 2, ruleProfile: RULE_PROFILE.id } });
  appendAudit(database, { action: 'Legacy demonstration report approved', targetType: 'Test', targetId: test.id, details: { result: test.evaluation.status, integrityHash: test.integrityHash } });
  return database;
}

function migrateDatabase(database) {
  let changed = false;
  database.schemaVersion ||= 1;
  if (!Array.isArray(database.users)) { database.users = seedUsers(); changed = true; }
  if (!Array.isArray(database.ruleProfiles)) { database.ruleProfiles = [RULE_PROFILE]; changed = true; }
  database.settings ||= {};
  if (!database.settings.activeRuleProfileId) { database.settings.activeRuleProfileId = RULE_PROFILE.id; changed = true; }
  if (!database.settings.retentionYears) { database.settings.retentionYears = 10; changed = true; }
  database.audit ||= [];
  database.tests ||= [];
  database.instruments ||= [];

  for (const test of database.tests) {
    const instrument = database.instruments.find((item) => item.id === test.instrumentId);
    if (!instrument) continue;
    if (!test.ruleProfileId || !test.input?.temperatureZero || !test.input?.conditionalTests) {
      test.input = defaultExtendedInput(test.input || {}, instrument);
      test.evaluation = evaluateTest(test.input, instrument);
      test.ruleProfileId = RULE_PROFILE.id;
      test.revision ||= 1;
      changed = true;
    }
    if (test.status === 'Finalized') {
      test.status = 'Approved'; test.submittedAt ||= test.finalizedAt || test.createdAt; test.approvedAt ||= test.finalizedAt || test.createdAt;
      test.approvedBy ||= { id: 'user-reviewer', name: 'Meera Nair', officerId: 'LMO-0214' }; changed = true;
    }
    if (test.status === 'Approved' && !test.integrityHash) { test.integrityHash = computeTestIntegrity(test); changed = true; }
  }

  if (database.audit.some((item) => !item.hash)) {
    const legacy = [...database.audit]; database.audit = [];
    appendAudit(database, { action: 'Audit ledger migrated', details: { legacyEvents: legacy.length } });
    for (const item of legacy) appendAudit(database, { action: item.action || 'Legacy event', targetType: item.targetType || 'Legacy', targetId: item.targetId, at: item.at, details: { migrated: true, result: item.result } });
    changed = true;
  }
  if (database.audit.length === 0) {
    appendAudit(database, { action: 'Audit ledger initialized during controlled upgrade', details: { schemaVersion: 2, importedTests: database.tests.length, importedInstruments: database.instruments.length } });
    changed = true;
  }
  if (database.schemaVersion !== 2) { database.schemaVersion = 2; changed = true; }
  return changed;
}

export async function ensureStore() {
  await fs.mkdir(uploadDir, { recursive: true });
  try {
    const database = JSON.parse(await fs.readFile(databasePath, 'utf8'));
    if (migrateDatabase(database)) await fs.writeFile(databasePath, JSON.stringify(database, null, 2));
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    await fs.writeFile(databasePath, JSON.stringify(seedDatabase(), null, 2));
  }
}

export async function readStore() {
  await ensureStore();
  return JSON.parse(await fs.readFile(databasePath, 'utf8'));
}

export async function writeStore(database) {
  const temporaryPath = `${databasePath}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(database, null, 2));
  await fs.rename(temporaryPath, databasePath);
}

export async function updateStore(change) {
  const database = await readStore();
  const result = await change(database);
  await writeStore(database);
  return result;
}

export function createId(prefix) { return `${prefix}-${randomUUID()}`; }
