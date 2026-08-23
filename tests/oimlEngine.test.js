import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTest, getMpe, validateInstrument } from '../shared/oimlEngine.js';

const instrument = {
  manufacturer: 'Test Scale Works', model: 'Class III Demo', serialNumber: 'TEST-001',
  accuracyClass: 'III', maxCapacity: 30, minCapacity: 0.2, verificationInterval: 0.01,
  actualScaleInterval: 0.01, unit: 'kg',
};

test('Class III MPE changes at the official Table 6 boundaries', () => {
  assert.equal(getMpe(5, 0.01, 'III'), 0.005);
  assert.equal(getMpe(5.01, 0.01, 'III'), 0.01);
  assert.equal(getMpe(20, 0.01, 'III'), 0.01);
  assert.equal(getMpe(20.01, 0.01, 'III'), 0.015);
});

test('in-service MPE is twice the initial-verification value', () => {
  assert.equal(getMpe(10, 0.01, 'III', true), 0.02);
});

test('a compliant core test passes every section', () => {
  const result = evaluateTest({
    performance: [{ load: 0, indication: 0 }, { load: 5, indication: 5.004 }, { load: 15, indication: 15.008 }, { load: 30, indication: 30.012 }],
    repeatability: { load: 15, readings: [15.001, 15.004, 15.006] },
    eccentricity: { load: 10, positions: [
      { position: 'Centre', indication: 10.001 }, { position: 'Front left', indication: 10.004 },
      { position: 'Front right', indication: 10.002 }, { position: 'Rear left', indication: 9.999 }, { position: 'Rear right', indication: 10.003 },
    ] },
    zeroReturn: { reading: 0.003 },
  }, instrument);
  assert.equal(result.status, 'PASS');
  assert.equal(result.diagnostic.risk, 'Low');
});

test('an excessive error fails and produces an explainable finding', () => {
  const result = evaluateTest({
    performance: [{ load: 0, indication: 0.01 }, { load: 5, indication: 5.02 }, { load: 15, indication: 15.03 }, { load: 30, indication: 30.05 }],
    repeatability: { load: 15, readings: [15, 15.03, 15.01] },
    eccentricity: { load: 10, positions: [
      { position: 'Centre', indication: 10 }, { position: 'Front left', indication: 10.02 },
      { position: 'Front right', indication: 10 }, { position: 'Rear left', indication: 10 }, { position: 'Rear right', indication: 10 },
    ] },
    zeroReturn: { reading: 0.01 },
  }, instrument);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.diagnostic.risk, 'High');
  assert.ok(result.diagnostic.findings.some((finding) => finding.title === 'Possible calibration bias'));
});

test('instrument registration rejects too many intervals for Class III', () => {
  const result = validateInstrument({ ...instrument, maxCapacity: 200, verificationInterval: 0.01 });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /at most 10,000/);
});
