import test from 'node:test';
import assert from 'node:assert/strict';
import { CONDITIONAL_TESTS, evaluateTest, getMpe, validateInstrument } from '../shared/oimlEngine.js';
import { appendAudit, computeTestIntegrity, verifyAuditChain } from '../server/store.js';

const instrument = {
  manufacturer: 'Test Scale Works', model: 'Class III Demo', serialNumber: 'TEST-001',
  accuracyClass: 'III', maxCapacity: 30, minCapacity: 0.2, verificationInterval: 0.01,
  actualScaleInterval: 0.01, unit: 'kg',
};

function completeInput() {
  return {
    performance: [{ load: 0, indication: 0 }, { load: 5, indication: 5.004 }, { load: 15, indication: 15.008 }, { load: 30, indication: 30.012 }],
    repeatability: { load: 15, readings: [15.001, 15.004, 15.006] },
    eccentricity: { load: 10, positions: [
      { position: 'Centre', indication: 10.001 }, { position: 'Front left', indication: 10.004 },
      { position: 'Front right', indication: 10.002 }, { position: 'Rear left', indication: 9.999 }, { position: 'Rear right', indication: 10.003 },
    ] },
    zeroReturn: { reading: 0.003 },
    temperatureZero: { points: [{ temperature: 20, zero: 0 }, { temperature: 25, zero: 0.004 }] },
    discrimination: { before: 15, after: 15.01, extraLoad: 0.014 },
    creep: { initial: 15, at15: 15.001, at30: 15.002 },
    warmUp: { points: [0, 5, 15, 30].map((minutes) => ({ minutes, zero: 0, load: 15, indication: 15.006 })) },
    voltageVariation: { points: [207, 230, 253].map((voltage) => ({ voltage, load: 15, indication: 15.006 })) },
    conditionalTests: CONDITIONAL_TESTS.map((item) => ({ id: item.id, applicability: 'Not applicable', result: 'NOT TESTED', reason: 'Not used for this defined initial-verification assessment.', evidenceNote: '' })),
  };
}

test('Class III MPE changes at the Table 6 boundaries', () => {
  assert.equal(getMpe(5, 0.01, 'III'), 0.005);
  assert.equal(getMpe(5.01, 0.01, 'III'), 0.01);
  assert.equal(getMpe(20, 0.01, 'III'), 0.01);
  assert.equal(getMpe(20.01, 0.01, 'III'), 0.015);
});

test('in-service MPE is twice the initial-verification value', () => {
  assert.equal(getMpe(10, 0.01, 'III', true), 0.02);
});

test('a complete compliant controlled test passes all nine automatic sections', () => {
  const result = evaluateTest(completeInput(), instrument);
  assert.equal(result.complete, true);
  assert.equal(result.status, 'PASS');
  assert.equal(Object.keys(result.sections).length, 9);
  assert.equal(result.conditional.results.length, 10);
  assert.equal(result.diagnostic.risk, 'Low');
});

test('missing extended tests can never be presented as a pass', () => {
  const input = completeInput();
  delete input.creep;
  const result = evaluateTest(input, instrument);
  assert.equal(result.complete, false);
  assert.match(result.status, /INCOMPLETE/);
});

test('repeatability checks every individual error as well as the spread', () => {
  const input = completeInput();
  input.repeatability.readings = [15.02, 15.021, 15.022];
  const result = evaluateTest(input, instrument);
  assert.equal(result.sections.repeatability.spread, 0.002);
  assert.equal(result.sections.repeatability.passed, false);
});

test('digital discrimination validates both response and the 1.4d extra load', () => {
  const input = completeInput();
  input.discrimination.extraLoad = 0.03;
  const result = evaluateTest(input, instrument);
  assert.equal(result.sections.discrimination.loadValid, false);
  assert.equal(result.sections.discrimination.passed, false);
});

test('creep enforces both 30-minute and late-change limits', () => {
  const input = completeInput();
  input.creep = { initial: 15, at15: 15.001, at30: 15.006 };
  const result = evaluateTest(input, instrument);
  assert.equal(result.sections.creep.passed, false);
});

test('an applicable conditional test needs a result and evidence note', () => {
  const input = completeInput();
  input.conditionalTests[0] = { id: 'sensitivity', applicability: 'Applicable', result: 'NOT TESTED', evidenceNote: '', reason: '' };
  let result = evaluateTest(input, instrument);
  assert.equal(result.conditional.complete, false);
  input.conditionalTests[0] = { id: 'sensitivity', applicability: 'Applicable', result: 'PASS', evidenceNote: 'Bench sheet page 4', reason: '' };
  result = evaluateTest(input, instrument);
  assert.equal(result.conditional.results[0].passed, true);
});

test('a recorded conditional failure makes the complete assessment fail', () => {
  const input = completeInput();
  input.conditionalTests[0] = { id: 'sensitivity', applicability: 'Applicable', result: 'FAIL', evidenceNote: 'Displacement below required limit', reason: '' };
  const result = evaluateTest(input, instrument);
  assert.equal(result.complete, true);
  assert.equal(result.status, 'FAIL');
});

test('instrument registration rejects too many intervals for Class III', () => {
  const result = validateInstrument({ ...instrument, maxCapacity: 200, verificationInterval: 0.01 });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /at most 10,000/);
});

test('the audit chain detects mutation of any historical event', () => {
  const database = { audit: [] };
  appendAudit(database, { action: 'Draft created', targetType: 'Test', targetId: 'T-1' });
  appendAudit(database, { action: 'Submitted', targetType: 'Test', targetId: 'T-1' });
  assert.equal(verifyAuditChain(database.audit).valid, true);
  database.audit[0].action = 'Silently altered';
  assert.equal(verifyAuditChain(database.audit).valid, false);
});

test('approved report fingerprint changes when controlled content is altered', () => {
  const record = { id: 'T-1', instrumentId: 'I-1', input: completeInput(), evaluation: evaluateTest(completeInput(), instrument), evidence: [], revision: 1 };
  const original = computeTestIntegrity(record);
  record.input.zeroReturn.reading = 0.009;
  assert.notEqual(computeTestIntegrity(record), original);
});
