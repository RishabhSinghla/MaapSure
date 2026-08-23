import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCorrectedError, createBlankAssessmentInput, createDemoAssessmentInput, DISTURBANCE_PROTOCOLS,
  evaluateTest, getMpe, rangeForLoad, REPORT_SECTIONS, REQUIREMENT_FAMILIES, RULE_PROFILE, validateInstrument,
} from '../shared/oimlEngine.js';
import { ALL_CHECKLIST_REQUIREMENTS } from '../shared/r76Checklist.js';
import { normalizeInstrument } from '../shared/r76Catalog.js';
import {
  appendAudit, computeStatusIntegrity, computeTestIntegrity, createApprovalSnapshot, createInstrumentSnapshot,
  createRuleSnapshot, createSubmissionSnapshot, digest, verifyAuditChain, verifyTestIntegrity,
} from '../server/store.js';

const instrument = normalizeInstrument({
  id: 'instrument-test', assessmentType: 'TYPE_EVALUATION', applicant: 'Test Scale Works', applicationNumber: 'MA-TEST-001',
  manufacturer: 'Test Scale Works', model: 'Class III Demo', typeDesignation: 'Class III Demo family', serialNumber: 'TEST-001',
  accuracyClass: 'III', maxCapacity: 30, minCapacity: 0.2, verificationInterval: 0.01,
  actualScaleInterval: 0.01, unit: 'kg', temperatureMin: -10, temperatureMax: 40,
  features: { installedFixed: false, levelIndicator: true },
});

test('Table 6 type-evaluation MPE boundaries pass exactly at every class transition', () => {
  const cases = [
    ['I', 0.001, 50, 50.001, 200, 200.001],
    ['II', 0.01, 50, 50.01, 200, 200.01],
    ['III', 0.01, 5, 5.01, 20, 20.01],
    ['IIII', 0.1, 5, 5.1, 20, 20.1],
  ];
  for (const [accuracyClass, e, firstBoundary, aboveFirst, secondBoundary, aboveSecond] of cases) {
    assert.equal(getMpe(firstBoundary, e, accuracyClass), 0.5 * e);
    assert.equal(getMpe(aboveFirst, e, accuracyClass), e);
    assert.equal(getMpe(secondBoundary, e, accuracyClass), e);
    assert.equal(getMpe(aboveSecond, e, accuracyClass), Number((1.5 * e).toFixed(9)));
  }
});

test('corrected error uses P = I + 0.5e - deltaL, E = P - L and Ec = E - E0', () => {
  const result = calculateCorrectedError({ load: 10, indication: 10.01, additionalLoad: 0.004, zeroError: 0.001 }, instrument);
  assert.equal(result.error, 0.011);
  assert.equal(result.correctedError, 0.01);
  assert.equal(result.mpe, 0.01);
  assert.equal(result.passed, true, 'equality with the MPE must pass');
});

test('derived zero correction includes zero load and ambiguous range trace is incomplete', () => {
  const derived = calculateCorrectedError({ load: 10, indication: 10.01, additionalLoad: 0.004, zeroIndication: 0.001, zeroAdditionalLoad: 0.004, zeroLoad: 0.002 }, instrument);
  assert.equal(derived.zeroError, 0);
  assert.equal(derived.correctedError, 0.011);
  const missingZeroLoad = calculateCorrectedError({ load: 10, indication: 10.01, additionalLoad: 0.004, zeroIndication: 0.001, zeroAdditionalLoad: 0.004 }, instrument);
  assert.equal(missingZeroLoad.complete, false);
  const multi = normalizeInstrument({ ...instrument, features: { ...instrument.features, rangeType: 'multipleRange', ranges: [{ id: 'low', min: 0.1, max: 15, e: 0.005, d: 0.005 }, { id: 'high', min: 0.2, max: 30, e: 0.01, d: 0.01 }] } });
  assert.equal(calculateCorrectedError({ load: 10, indication: 10, additionalLoad: 0.0025, zeroError: 0 }, multi).complete, false, 'multiple-range rows must identify the range');
  assert.equal(calculateCorrectedError({ load: 10, rangeId: 'invented', indication: 10, additionalLoad: 0.0025, zeroError: 0 }, multi).complete, false, 'unknown range IDs cannot fall back silently');
});

test('high-resolution indication is used only when its resolution is no more than one fifth e', () => {
  const result = calculateCorrectedError({ load: 10, highResolutionIndication: 10.004, resolution: 0.002, zeroError: 0 }, instrument);
  assert.equal(result.method, 'high-resolution-indication');
  assert.equal(result.correctedError, 0.004);
  assert.equal(result.passed, true);
});

test('multiple ranges select the correct interval at the range boundary', () => {
  const multi = normalizeInstrument({ ...instrument, features: { ...instrument.features, rangeType: 'multiple', ranges: [
    { id: 'low', min: 0.1, max: 15, e: 0.005, d: 0.005 }, { id: 'high', min: 0.2, max: 30, e: 0.01, d: 0.01 },
  ] } });
  assert.equal(rangeForLoad(15, multi).id, 'low');
  assert.equal(rangeForLoad(15.01, multi).id, 'high');
  assert.equal(calculateCorrectedError({ load: 15.01, indication: 15.01, additionalLoad: 0.005, zeroError: 0 }, multi).e, 0.01);
});

test('the synthetic fixture completes every rules-derived applicable path', () => {
  const result = evaluateTest(createDemoAssessmentInput(instrument), instrument);
  assert.equal(result.complete, true);
  assert.equal(result.status, 'PASS');
  assert.equal(result.coverage.percent, 100);
  assert.equal(result.coverage.blockers.length, 0);
  assert.equal(Object.keys(result.sections).length, REPORT_SECTIONS.length);
  assert.equal(result.requirements.length, REQUIREMENT_FAMILIES.length);
  assert.equal(result.checklist.length, ALL_CHECKLIST_REQUIREMENTS.length);
  assert.deepEqual([REPORT_SECTIONS.length, REQUIREMENT_FAMILIES.length, ALL_CHECKLIST_REQUIREMENTS.length], [34, 73, 149]);
  assert.equal(new Set(ALL_CHECKLIST_REQUIREMENTS.map((item) => item.id)).size, ALL_CHECKLIST_REQUIREMENTS.length);
  assert.equal(new Set(REQUIREMENT_FAMILIES.map((item) => item.clause)).size, REQUIREMENT_FAMILIES.length);
  assert.match(RULE_PROFILE.status, /decision-support/i);
  assert.doesNotMatch(RULE_PROFILE.jurisdictionNote, /full digital coverage/i);
});

test('a blank draft remains incomplete and blank is not treated as measured zero', () => {
  const result = evaluateTest(createBlankAssessmentInput(instrument), instrument);
  assert.equal(result.complete, false);
  assert.equal(result.coverage.percent, 0);
  assert.equal(result.sections.stabilityZeroTare.complete, false);
  assert.equal(result.sections.weighingPerformance.series[0].rows[0].correctedError, null);
});

test('applicability is derived from instrument features rather than tester-selected skips', () => {
  const result = evaluateTest(createDemoAssessmentInput(instrument), instrument);
  assert.equal(result.sections.eccentricityRolling.applicability, 'Not applicable');
  assert.match(result.sections.eccentricityRolling.applicabilityReason, /not intended for rolling loads/i);
  assert.equal(result.sections.sensitivity.applicability, 'Not applicable');
  assert.equal(result.sections.tilting.applicability, 'Applicable');
});

test('all applicable electrical-disturbance branches are independent and complete', () => {
  const result = evaluateTest(createDemoAssessmentInput(instrument), instrument);
  const applicable = Object.keys(DISTURBANCE_PROTOCOLS).filter((id) => result.sections[id].applicability === 'Applicable');
  assert.deepEqual(applicable, ['acDips', 'burstsMains', 'burstsIo', 'surgesMains', 'esdDirect', 'esdIndirect', 'radiatedRf', 'conductedRf']);
  assert.ok(applicable.every((id) => result.sections[id].complete && result.sections[id].passed));
  assert.equal(result.sections.surgesOtherPower.outcome, 'NOT_APPLICABLE');
  assert.equal(result.sections.vehicleTransientsSupply.outcome, 'NOT_APPLICABLE');
});

test('a significant disturbance fault fails unless detection/action or the permitted exception is explained', () => {
  const input = createDemoAssessmentInput(instrument); input.sections.radiatedRf.rows[0].during = 1.05;
  let result = evaluateTest(input, instrument);
  assert.equal(result.sections.radiatedRf.complete, true);
  assert.equal(result.sections.radiatedRf.passed, false);
  assert.equal(result.status, 'FAIL');
  input.sections.radiatedRf.rows[0].detectedAndActed = true; input.sections.radiatedRf.rows[0].explanation = 'Fault detected and weighing output inhibited.';
  result = evaluateTest(input, instrument);
  assert.equal(result.sections.radiatedRf.passed, true);
  assert.equal(result.status, 'PASS');
});

test('repeatability requires ten readings per series below 1,000 kg', () => {
  const input = createDemoAssessmentInput(instrument); input.sections.repeatability.series[0].readings.pop();
  const result = evaluateTest(input, instrument);
  assert.equal(result.sections.repeatability.complete, false);
  assert.match(result.sections.repeatability.summary, /complete series/i);
});

test('mass boundaries are converted to kg before repeatability and endurance applicability decisions', () => {
  const gramsInstrument = normalizeInstrument({ ...instrument, unit: 'g', maxCapacity: 1000, minCapacity: 20, verificationInterval: 1, actualScaleInterval: 1, features: { ...instrument.features, ranges: [{ id: 'range-1', min: 20, max: 1000, e: 1, d: 1 }] } });
  let result = evaluateTest(createDemoAssessmentInput(gramsInstrument), gramsInstrument);
  assert.equal(result.sections.repeatability.series[0].required, 10, '1,000 g is below 1,000 kg');
  assert.equal(result.sections.enduranceFinal.applicability, 'Applicable', '1,000 g is below the 100 kg endurance limit');
  const tonneInstrument = normalizeInstrument({ ...instrument, unit: 't', maxCapacity: 1, minCapacity: 0.02, verificationInterval: 0.001, actualScaleInterval: 0.001, features: { ...instrument.features, ranges: [{ id: 'range-1', min: 0.02, max: 1, e: 0.001, d: 0.001 }] } });
  result = evaluateTest(createDemoAssessmentInput(tonneInstrument), tonneInstrument);
  assert.equal(result.sections.repeatability.series[0].required, 3, '1 t is the 1,000 kg boundary');
  assert.equal(result.sections.enduranceFinal.outcome, 'NOT_APPLICABLE');
});

test('static-temperature series require the actual declared temperatures, order and transition loads', () => {
  const input = createDemoAssessmentInput(instrument);
  input.sections.weighingPerformance.series.find((set) => set.id === 'high').temperature = 35;
  let result = evaluateTest(input, instrument);
  assert.equal(result.sections.weighingPerformance.complete, false);
  assert.equal(result.sections.weighingPerformance.series.find((set) => set.id === 'high').temperatureMatches, false);
  const missingTransition = createDemoAssessmentInput(instrument); const reference = missingTransition.sections.weighingPerformance.series.find((set) => set.id === 'reference');
  reference.rows = reference.rows.filter((row) => row.load !== 5);
  result = evaluateTest(missingTransition, instrument);
  assert.equal(result.sections.weighingPerformance.complete, false);
  assert.equal(result.sections.weighingPerformance.series.find((set) => set.id === 'reference').transitionsPresent, false);
});

test('discrimination and sensitivity reject oversized substitutes for the exact prescribed extra load', () => {
  const digital = createDemoAssessmentInput(instrument); digital.sections.discrimination.rows[0].extraLoad *= 2;
  let result = evaluateTest(digital, instrument);
  assert.equal(result.sections.discrimination.complete, true);
  assert.equal(result.sections.discrimination.passed, false);
  const nonSelf = normalizeInstrument({ ...instrument, features: { ...instrument.features, indicatingMode: 'nonSelf', digitalIndication: false, analogIndication: true, electronic: false, softwareControlled: false, installedFixed: true, nonSelfMechanism: 'equalArmBeam' } });
  const sensitivity = createDemoAssessmentInput(nonSelf); sensitivity.sections.sensitivity.rows[0].extraLoad *= 2;
  result = evaluateTest(sensitivity, nonSelf);
  assert.equal(result.sections.sensitivity.complete, true);
  assert.equal(result.sections.sensitivity.passed, false);
});

test('voltage rows require exact category limits and explicit operating outcomes', () => {
  const input = createDemoAssessmentInput(instrument); const lower = input.sections.voltageVariation.rows.find((row) => row.category === 'mainsAC' && row.point === 'lower');
  assert.equal(lower.voltage, 195.5);
  lower.voltage = 207;
  let result = evaluateTest(input, instrument);
  assert.equal(result.sections.voltageVariation.complete, false);
  const missingOutcome = createDemoAssessmentInput(instrument); delete missingOutcome.sections.voltageVariation.rows[0].operatingOutcome;
  result = evaluateTest(missingOutcome, instrument);
  assert.equal(result.sections.voltageVariation.complete, false);
});

test('printing stability evaluates the five-second sequence and the captured value', () => {
  const input = createDemoAssessmentInput(instrument); const row = input.sections.stabilityPrinting.rows[0]; const base = instrument.maxCapacity * 0.5;
  row.indications = [base, base + instrument.verificationInterval, base + 2 * instrument.verificationInterval]; row.storedValue = base;
  const result = evaluateTest(input, instrument);
  assert.equal(result.sections.stabilityPrinting.complete, true);
  assert.equal(result.sections.stabilityPrinting.passed, false);
});

test('damp-heat, span-stability, endurance and warm-up protocols fail closed when evidence is missing', () => {
  let input = createDemoAssessmentInput(instrument); delete input.sections.dampHeatHigh.exposureDays;
  let result = evaluateTest(input, instrument); assert.equal(result.sections.dampHeatHigh.complete, false);
  input = createDemoAssessmentInput(instrument); input.sections.spanStability.measurements[0].readings.pop();
  result = evaluateTest(input, instrument); assert.equal(result.sections.spanStability.complete, false);
  input = createDemoAssessmentInput(instrument); input.sections.enduranceFinal.cyclingStartedAt = '2026-01-01T00:00:00.000Z';
  result = evaluateTest(input, instrument); assert.equal(result.sections.enduranceFinal.complete, false);
  input = createDemoAssessmentInput(instrument); input.sections.warmUp.points[0].load = instrument.maxCapacity * 0.5;
  result = evaluateTest(input, instrument); assert.equal(result.sections.warmUp.complete, false);
});

test('manual matrices and disturbance protocols require structured authority and evidence', () => {
  let input = createDemoAssessmentInput(instrument); input.requirements['2.1'].evidenceIds = [];
  let result = evaluateTest(input, instrument); assert.equal(result.requirements.find((item) => item.clause === '2.1').complete, false); assert.equal(result.status, 'INCOMPLETE');
  input = createDemoAssessmentInput(instrument); delete input.sections.radiatedRf.referencedStandardEdition;
  result = evaluateTest(input, instrument); assert.equal(result.sections.radiatedRf.complete, false);
});

test('authority-signed specialized protocols and realistic synthetic equipment are mandatory', () => {
  let input = createDemoAssessmentInput(instrument);
  assert.ok(input.equipment.length >= 12);
  assert.ok(input.sections.weighingPerformance.equipmentIds.includes('eq-climate-chamber'));
  assert.ok(input.sections.tilting.equipmentIds.includes('eq-angle-fixture'));
  assert.ok(input.sections.spanStability.equipmentIds.includes('eq-pressure-standard'));
  assert.ok(input.equipment.every((item) => item.name.startsWith('Synthetic demo - ')));
  input.sections.eccentricityWeights.rezeroBeforeEachPositionConfirmed = false;
  let result = evaluateTest(input, instrument); assert.equal(result.sections.eccentricityWeights.complete, false);
  input = createDemoAssessmentInput(instrument); input.sections.tilting.protocolAuthorization.evidenceIds = [];
  result = evaluateTest(input, instrument); assert.equal(result.sections.tilting.complete, false);
  input = createDemoAssessmentInput(instrument); delete input.sections.tare.runs[0].tareLoadPlanReference;
  result = evaluateTest(input, instrument); assert.equal(result.sections.tare.complete, false);
});

test('feature-specific checklist predicates do not activate neighboring branches', () => {
  let result = evaluateTest(createDemoAssessmentInput(instrument), instrument);
  const byId = (id) => result.checklist.find((item) => item.id === id);
  assert.equal(byId('4.4.5-printer').outcome, 'NOT_APPLICABLE');
  assert.equal(byId('4.4.6-memory').applicability, 'Applicable');
  assert.equal(byId('3.6.3-multiple-indications').outcome, 'NOT_APPLICABLE');
  assert.equal(byId('5.5.1-embedded-declaration').applicability, 'Applicable');
  assert.equal(byId('5.5.2.2d-software-docs').outcome, 'NOT_APPLICABLE');
  const specialized = normalizeInstrument({ ...instrument, features: { ...instrument.features, directSales: true, presetTare: true, selfService: true, mobile: true, outdoorMobile: true, hasPrinter: true, multipleIndications: true, softwareEnvironment: 'open' } });
  result = evaluateTest(createDemoAssessmentInput(specialized), specialized); const specializedById = (id) => result.checklist.find((item) => item.id === id);
  assert.equal(specializedById('4.13.4-direct-preset-tare').applicability, 'Applicable');
  assert.equal(specializedById('4.13.11-self-service').applicability, 'Applicable');
  assert.equal(specializedById('4.18.1-mobile-outdoor').applicability, 'Applicable');
  assert.equal(specializedById('4.18.2-mobile-other').outcome, 'NOT_APPLICABLE');
  assert.equal(specializedById('G.2.2.2-open-os').applicability, 'Applicable');
  assert.equal(specializedById('5.5.1-embedded-declaration').outcome, 'NOT_APPLICABLE');
});

test('endurance is rules-derived not applicable above 100 kg', () => {
  const large = normalizeInstrument({ ...instrument, applicationNumber: 'MA-LARGE-001', maxCapacity: 150, minCapacity: 1, verificationInterval: 0.05, actualScaleInterval: 0.05, features: { ...instrument.features, ranges: [{ id: 'range-1', min: 1, max: 150, e: 0.05, d: 0.05 }] } });
  const result = evaluateTest(createDemoAssessmentInput(large), large);
  assert.equal(result.sections.enduranceInitial.outcome, 'NOT_APPLICABLE');
  assert.equal(result.sections.enduranceFinal.outcome, 'NOT_APPLICABLE');
  assert.match(result.sections.enduranceFinal.applicabilityReason, /not exceeding 100 kg/i);
});

test('digital discrimination is automatically not applicable below 5 mg', () => {
  const precision = normalizeInstrument({ ...instrument, applicationNumber: 'MA-I-001', accuracyClass: 'I', maxCapacity: 0.1, minCapacity: 0.0001, verificationInterval: 0.000001, actualScaleInterval: 0.000001, features: { ...instrument.features, installedFixed: true, ranges: [{ id: 'range-1', min: 0.0001, max: 0.1, e: 0.000001, d: 0.000001 }] } });
  const result = evaluateTest(createDemoAssessmentInput(precision), precision);
  assert.equal(result.sections.discrimination.outcome, 'NOT_APPLICABLE');
  assert.match(result.sections.discrimination.applicabilityReason, /5 mg/i);
});

test('instrument validation enforces application identity, 1/2/5 intervals and class limits', () => {
  assert.equal(validateInstrument(instrument).valid, true);
  const tooMany = validateInstrument({ ...instrument, maxCapacity: 200, verificationInterval: 0.01, features: { ...instrument.features, ranges: [{ id: 'range-1', min: 0.2, max: 200, e: 0.01, d: 0.01 }] } });
  assert.equal(tooMany.valid, false); assert.match(tooMany.errors.join(' '), /between 500 and 10,000/);
  const badInterval = validateInstrument({ ...instrument, verificationInterval: 0.03, features: { ...instrument.features, ranges: [{ id: 'range-1', min: 0.6, max: 30, e: 0.03, d: 0.03 }] } });
  assert.equal(badInterval.valid, false); assert.match(badInterval.errors.join(' '), /1, 2 or 5/);
});

test('direct-sales and non-self-indicating dossiers receive feature-specific validation', () => {
  const direct = validateInstrument({ ...instrument, maxCapacity: 150, verificationInterval: 0.05, features: { ...instrument.features, directSales: true, ranges: [{ id: 'range-1', min: 1, max: 150, e: 0.05, d: 0.05 }] } });
  assert.match(direct.errors.join(' '), /Max not exceeding 100 kg/);
  const nonSelf = validateInstrument({ ...instrument, features: { ...instrument.features, indicatingMode: 'nonSelf', digitalIndication: false, electronic: false, softwareControlled: false, nonSelfMechanism: '' } });
  assert.match(nonSelf.errors.join(' '), /mechanism/);
});

test('audit-chain mutation is detected', () => {
  const database = { audit: [] };
  appendAudit(database, { action: 'Draft created', targetType: 'Test', targetId: 'T-1' });
  appendAudit(database, { action: 'Submitted', targetType: 'Test', targetId: 'T-1' });
  assert.equal(verifyAuditChain(database.audit).valid, true);
  database.audit[0].action = 'Silently altered';
  assert.equal(verifyAuditChain(database.audit).valid, false);
});

function approvedRecord() {
  const input = createDemoAssessmentInput(instrument); const evaluation = evaluateTest(input, instrument);
  const record = {
    id: 'T-1', rootId: 'T-1', revision: 1, recordVersion: 3, applicationNumber: instrument.applicationNumber,
    assessmentType: 'TYPE_EVALUATION', certificateNumber: 'MS-TEST-1', verificationCode: 'VERIFY1', status: 'Approved',
    inspectorName: 'Tester', inspectorId: 'LMO-T', laboratory: 'Test laboratory', environment: { temperature: 20, humidity: 50 },
    input, evaluation, instrumentSnapshot: createInstrumentSnapshot(instrument), ruleSnapshot: createRuleSnapshot(),
    evidence: [{ id: 'EV-1', name: 'bench.pdf', sectionId: 'construction', size: 10, fileSha256: digest('ten bytes'), note: 'Controlled bench sheet' }],
    reviewHistory: [{ decision: 'APPROVE', comment: 'Independent review complete.', reviewer: { id: 'R-1', name: 'Reviewer', officerId: 'LMO-R' }, at: '2026-08-23T00:00:00.000Z' }],
    createdAt: '2026-08-22T00:00:00.000Z', submittedAt: '2026-08-23T00:00:00.000Z', approvedAt: '2026-08-23T01:00:00.000Z', approvedBy: { id: 'R-1', name: 'Reviewer', officerId: 'LMO-R' },
  };
  record.submissionSnapshot = createSubmissionSnapshot(record); record.approvalSnapshot = createApprovalSnapshot(record); record.integrityVersion = 3; record.integrityHash = computeTestIntegrity(record); record.statusIntegrityHash = computeStatusIntegrity(record); return record;
}

test('issued fingerprint binds dossier, rules, observations and evidence byte hashes', () => {
  const record = approvedRecord(); assert.equal(verifyTestIntegrity(record).valid, true);
  const dossierTamper = structuredClone(record); dossierTamper.approvalSnapshot.instrumentSnapshot.serialNumber = 'CHANGED';
  assert.equal(verifyTestIntegrity(dossierTamper).contentValid, false);
  const evidenceTamper = structuredClone(record); evidenceTamper.approvalSnapshot.evidenceManifest[0].fileSha256 = digest('different bytes');
  assert.equal(verifyTestIntegrity(evidenceTamper).contentValid, false);
  const observationTamper = structuredClone(record); observationTamper.approvalSnapshot.input.sections.weighingPerformance.series[0].rows[0].indication = 99;
  assert.equal(verifyTestIntegrity(observationTamper).contentValid, false);
  const topLevelCertificateTamper = structuredClone(record); topLevelCertificateTamper.certificateNumber = 'FORGED'; assert.equal(verifyTestIntegrity(topLevelCertificateTamper).projectionValid, false);
  const topLevelEvaluationTamper = structuredClone(record); topLevelEvaluationTamper.evaluation.status = 'FAIL'; assert.equal(verifyTestIntegrity(topLevelEvaluationTamper).projectionValid, false);
});

test('status fingerprint prevents silent approved/revoked state changes', () => {
  const record = approvedRecord(); record.status = 'Revoked'; record.revokedAt = '2026-08-24T00:00:00.000Z'; record.revocationReason = 'Safety-related model issue discovered.';
  assert.equal(verifyTestIntegrity(record).statusValid, false);
  record.statusIntegrityHash = computeStatusIntegrity(record);
  assert.equal(verifyTestIntegrity(record).valid, true);
});
