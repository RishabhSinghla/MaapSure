import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { scryptSync } from 'node:crypto';

const port = 4700 + process.pid % 900;
const base = `http://127.0.0.1:${port}`;
const dataDir = await mkdtemp(path.join(tmpdir(), 'maapsure-integration-'));
const databasePath = path.join(dataDir, 'database.json');
const passwordRecord = (password, salt) => ({ salt, passwordHash: scryptSync(password, salt, 64).toString('hex') });
const legacyCreatedAt = '2026-01-15T10:00:00.000Z';
await writeFile(databasePath, JSON.stringify({
  schemaVersion: 2,
  users: [
    { id: 'user-admin', email: 'admin@maapsure.in', name: 'Dr. Kavita Rao', role: 'ADMIN', roleLabel: 'Laboratory Administrator', initials: 'KR', active: true, ...passwordRecord('Demo@123', 'integration-admin') },
    { id: 'user-tester', email: 'inspector@maapsure.in', name: 'Arjun Sharma', role: 'TESTER', roleLabel: 'Legal Metrology Tester', initials: 'AS', officerId: 'LMO-0186', active: true, ...passwordRecord('Inspect@123', 'integration-tester') },
    { id: 'user-reviewer', email: 'reviewer@maapsure.in', name: 'Meera Nair', role: 'REVIEWER', roleLabel: 'Reviewing Officer', initials: 'MN', officerId: 'LMO-0214', active: true, ...passwordRecord('Review@123', 'integration-reviewer') },
    { id: 'user-auditor', email: 'auditor@maapsure.in', name: 'Vikram Sen', role: 'AUDITOR', roleLabel: 'Read-only Auditor', initials: 'VS', active: true, ...passwordRecord('Audit@123', 'integration-auditor') },
  ],
  instruments: [{ id: 'legacy-instrument', manufacturer: 'Legacy Scale Works', model: 'LSW-30', serialNumber: 'LEGACY-001', accuracyClass: 'III', maxCapacity: 30, minCapacity: 0.2, verificationInterval: 0.01, actualScaleInterval: 0.01, unit: 'kg', location: 'Legacy Archive Laboratory', status: 'Active', createdAt: legacyCreatedAt }],
  tests: [{ id: 'legacy-schema2-report', instrumentId: 'legacy-instrument', certificateNumber: 'LEGACY-2026-0001', verificationCode: 'LEGACYVERIFY1', status: 'Approved', revision: 1, inspectorName: 'Legacy Inspector', inspectorId: 'LMO-OLD', laboratory: 'Legacy Archive Laboratory', notes: 'Preserved schema-two observations must not be presented as complete R 76 coverage.', input: {}, evidence: [], reviewHistory: [], evaluation: { complete: true, passed: true, status: 'PASS', standard: 'OIML R 76-1:2006', reportFormat: 'Legacy partial report', ruleVersion: '1.0.0', sections: { performance: { id: 'performance', name: 'Legacy performance', complete: true, passed: true } } }, createdAt: legacyCreatedAt, updatedAt: legacyCreatedAt, submittedAt: legacyCreatedAt, approvedAt: legacyCreatedAt, approvedBy: { id: 'legacy-reviewer', name: 'Legacy Reviewer' } }],
  audit: [], ruleProfiles: [], settings: { sequence: 2, laboratoryName: 'Integration Type Evaluation Laboratory', activeRuleProfileId: 'legacy-profile' },
}, null, 2));
const server = spawn(process.execPath, ['server/index.js'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env, PORT: String(port), NODE_ENV: 'development', JWT_SECRET: 'integration-test-secret-with-sufficient-length', MAAPSURE_DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk; });
server.stderr.on('data', (chunk) => { serverOutput += chunk; });
const serverExit = new Promise((resolve) => server.once('exit', resolve));

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Integration server stopped early.\n${serverOutput}`);
    try { const response = await fetch(`${base}/api/health`); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Integration server did not start.\n${serverOutput}`);
}

async function request(route, { token, body, form, method = body || form ? 'POST' : 'GET' } = {}) {
  const headers = {}; if (token) headers.Authorization = `Bearer ${token}`; if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}${route}`, { method, headers, body: body ? JSON.stringify(body) : form });
  const contentType = response.headers.get('content-type') || '';
  const value = contentType.includes('json') ? await response.json() : await response.arrayBuffer();
  return { response, value };
}

async function login(email, password) {
  const { response, value } = await request('/api/auth/login', { body: { email, password } });
  assert.equal(response.status, 200); return value.token;
}

async function mutateDatabase(change) {
  const database = JSON.parse(await readFile(databasePath, 'utf8'));
  change(database);
  await writeFile(databasePath, JSON.stringify(database, null, 2));
}

function evidenceForm() {
  const form = new FormData();
  form.append('evidence', new Blob([Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF')], { type: 'application/pdf' }), 'traceable-weight-certificate.pdf');
  form.append('sectionId', 'construction'); form.append('note', 'Submitted type dossier and construction bench evidence.'); return form;
}

try {
  await waitForServer();
  const tester = await login('inspector@maapsure.in', 'Inspect@123');
  const reviewer = await login('reviewer@maapsure.in', 'Review@123');
  const auditor = await login('auditor@maapsure.in', 'Audit@123');
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const denied = await request('/api/auth/login', { body: { email: 'unknown-rate-limit@example.invalid', password: 'wrong-password' } });
    assert.equal(denied.response.status, 401);
  }
  const rateLimited = await request('/api/auth/login', { body: { email: 'unknown-rate-limit@example.invalid', password: 'wrong-password' } });
  assert.equal(rateLimited.response.status, 429);
  const records = await request('/api/tests', { token: tester });
  const seed = records.value.tests.find((item) => item.id === 'test-type-evaluation-seed');
  assert.ok(seed?.evaluation.complete, JSON.stringify({ status: seed?.evaluation?.status, coverage: seed?.evaluation?.coverage })); assert.equal(seed.evaluation.coverage.percent, 100);
  assert.equal(seed.evaluation.coverage.totalReportSections, 34);
  const legacy = records.value.tests.find((item) => item.id === 'legacy-schema2-report');
  assert.equal(legacy.coverageMode, 'LEGACY_PARTIAL'); assert.match(legacy.notes, /schema-two observations/i);
  const legacyDetail = await request(`/api/tests/${legacy.id}`, { token: reviewer }); assert.equal(legacyDetail.response.status, 200); assert.equal(legacyDetail.value.test.coverageMode, 'LEGACY_PARTIAL');
  const legacyPdf = await request(`/api/tests/${legacy.id}/report.pdf`, { token: reviewer }); assert.equal(legacyPdf.response.status, 409); assert.match(legacyPdf.value.error, /legacy archive/i);
  const legacyWord = await request(`/api/tests/${legacy.id}/report.doc`, { token: reviewer }); assert.equal(legacyWord.response.status, 409); assert.match(legacyWord.value.error, /legacy archive/i);

  const registrationPayload = structuredClone(seed.instrument);
  Object.assign(registrationPayload, {
    applicationNumber: 'LM-MA-INTEGRATION-NEW', model: 'Dossier Contract Model', typeDesignation: 'Dossier Contract Family', serialNumber: 'DOSSIER-CONTRACT-001',
    softwareIdentification: 'INTEGRATION-SOFTWARE-CHECKSUM', moduleModel: 'Module Family M1', moduleCertificate: 'TC-MODULE-001', moduleErrorFraction: 0.5,
    loadCellModel: 'LC-INTEGRATION', loadCellCertificate: 'TC-LOADCELL-001', interfacesDescription: 'RS-232 interface with legally relevant data protected by the instrument.',
    connectedEquipment: 'Approved remote display and printer.', submittedDocumentIndex: 'Index A: application, drawings, manuals, certificates, software and interface description.',
  });
  registrationPayload.features.questionnaireConfirmed = false;
  const unconfirmedRegistration = await request('/api/instruments', { token: tester, body: registrationPayload });
  assert.equal(unconfirmedRegistration.response.status, 400); assert.match(unconfirmedRegistration.value.error, /Confirm that every instrument-feature question/i);
  registrationPayload.features.questionnaireConfirmed = true;
  registrationPayload.features.ranges[0].max = registrationPayload.maxCapacity - 1;
  const inconsistentRegistration = await request('/api/instruments', { token: tester, body: registrationPayload });
  assert.equal(inconsistentRegistration.response.status, 400); assert.match(inconsistentRegistration.value.error, /Range 1 must exactly match/i);
  registrationPayload.features.ranges[0].max = registrationPayload.maxCapacity;
  const registeredDossier = await request('/api/instruments', { token: tester, body: registrationPayload });
  assert.equal(registeredDossier.response.status, 201); assert.equal(registeredDossier.value.instrument.softwareIdentification, registrationPayload.softwareIdentification);
  assert.equal(registeredDossier.value.instrument.moduleErrorFraction, 0.5); assert.equal(registeredDossier.value.instrument.connectedEquipment, registrationPayload.connectedEquipment);
  assert.equal(registeredDossier.value.instrument.submittedDocumentIndex, registrationPayload.submittedDocumentIndex);

  const frozenDossierLocation = seed.instrument.location;
  const dossierRevision = await request(`/api/instruments/${seed.instrumentId}`, { token: tester, method: 'PATCH', body: {
    expectedVersion: seed.instrument.dossierVersion, revisionReason: 'Correct the controlled dossier details after independent document review.', location: 'Revised Integration Dossier Laboratory',
    softwareIdentification: 'REVISED-SYNTHETIC-SOFTWARE-ID', moduleModel: 'Reviewed module family', moduleCertificate: 'REVIEWED-MODULE-REF', moduleErrorFraction: 0.4,
    loadCellModel: 'Reviewed load cell', loadCellCertificate: 'REVIEWED-LC-REF', interfacesDescription: 'Reviewed interface and protected legally relevant data flow.',
    connectedEquipment: 'Reviewed printer and remote display.', submittedDocumentIndex: 'Reviewed controlled document index revision B.',
  } });
  assert.equal(dossierRevision.response.status, 200); assert.equal(dossierRevision.value.instrument.dossierVersion, 2); assert.equal(dossierRevision.value.revision.fromVersion, 1); assert.equal(dossierRevision.value.frozenCaseCount, 1);
  for (const field of ['location', 'softwareIdentification', 'moduleModel', 'moduleCertificate', 'moduleErrorFraction', 'loadCellModel', 'loadCellCertificate', 'interfacesDescription', 'connectedEquipment', 'submittedDocumentIndex']) assert.ok(dossierRevision.value.revision.changedFields.includes(field));
  assert.equal(dossierRevision.value.instrument.connectedEquipment, 'Reviewed printer and remote display.'); assert.equal(dossierRevision.value.instrument.moduleErrorFraction, 0.4);
  const staleDossierRevision = await request(`/api/instruments/${seed.instrumentId}`, { token: tester, method: 'PATCH', body: { expectedVersion: 1, revisionReason: 'This stale revision must not overwrite controlled data.', location: 'Forbidden stale location' } }); assert.equal(staleDossierRevision.response.status, 409);
  const frozenSeed = await request(`/api/tests/${seed.id}`, { token: reviewer }); assert.equal(frozenSeed.value.test.instrument.location, frozenDossierLocation); assert.equal(frozenSeed.value.test.instrumentSnapshot.location, frozenDossierLocation);
  assert.notEqual(frozenSeed.value.test.instrumentSnapshot.softwareIdentification, dossierRevision.value.instrument.softwareIdentification);

  const created = await request('/api/type-evaluations', { token: tester, body: {
    instrumentId: seed.instrumentId, inspectorName: 'Arjun Sharma', inspectorId: 'LMO-0186',
    laboratory: 'Integration Type Evaluation Laboratory', temperature: 24, humidity: 50, barometricPressure: 1013.2,
  } });
  assert.equal(created.response.status, 201); assert.equal(created.value.test.status, 'Draft');
  assert.equal(created.value.test.evaluation.coverage.percent, 0); assert.equal(created.value.test.recordVersion, 1);
  const id = created.value.test.id;

  let tooDeep = {}; let nested = tooDeep;
  for (let depth = 0; depth < 20; depth += 1) { nested.child = {}; nested = nested.child; }
  const deepPayloadBlocked = await request(`/api/tests/${id}`, { token: tester, method: 'PATCH', body: { expectedVersion: 1, input: tooDeep } });
  assert.equal(deepPayloadBlocked.response.status, 413); assert.match(deepPayloadBlocked.value.error, /nested too deeply/i);

  const concurrent = await Promise.all([
    request(`/api/tests/${id}`, { token: tester, method: 'PATCH', body: { expectedVersion: 1, notes: 'First browser autosave.' } }),
    request(`/api/tests/${id}`, { token: tester, method: 'PATCH', body: { expectedVersion: 1, notes: 'Second browser autosave.' } }),
  ]);
  assert.deepEqual(concurrent.map((item) => item.response.status).sort(), [200, 409]);
  let current = await request(`/api/tests/${id}`, { token: tester });
  const loadedDemo = await request(`/api/tests/${id}`, { token: tester, method: 'PATCH', body: {
    expectedVersion: current.value.test.recordVersion, input: seed.input, notes: 'Complete synthetic integration fixture.',
    environment: { temperature: 24, humidity: 50, barometricPressure: 1013.2 },
  } });
  assert.equal(loadedDemo.response.status, 200); assert.equal(loadedDemo.value.test.evaluation.status, 'PASS'); assert.equal(loadedDemo.value.test.evaluation.coverage.percent, 100);

  const stale = await request(`/api/tests/${id}`, { token: tester, method: 'PATCH', body: { expectedVersion: 1, notes: 'Must not overwrite newer work.' } });
  assert.equal(stale.response.status, 409);
  current = await request(`/api/tests/${id}`, { token: tester }); assert.equal(current.value.test.input.demoFixture, true); assert.notEqual(current.value.test.notes, 'Must not overwrite newer work.');

  const blockedWithoutEvidence = await request(`/api/tests/${id}/submit`, { token: tester, body: { expectedVersion: current.value.test.recordVersion } });
  assert.equal(blockedWithoutEvidence.response.status, 400); assert.match(blockedWithoutEvidence.value.error, /hashed dossier\/construction evidence/i);

  const uploaded = await request(`/api/tests/${id}/evidence`, { token: tester, form: evidenceForm() });
  assert.equal(uploaded.response.status, 201, JSON.stringify(uploaded.value)); assert.equal(uploaded.value.evidence.fileSha256.length, 64); assert.equal(uploaded.value.evidence.sectionId, 'construction');
  const unauthenticatedEvidence = await request(`/api/evidence/${uploaded.value.evidence.id}`); assert.equal(unauthenticatedEvidence.response.status, 401);
  const protectedEvidence = await request(`/api/evidence/${uploaded.value.evidence.id}`, { token: reviewer }); assert.equal(protectedEvidence.response.status, 200); assert.ok(protectedEvidence.value.byteLength > 20);

  let submitted = await request(`/api/tests/${id}/submit`, { token: tester, body: { expectedVersion: uploaded.value.test.recordVersion } });
  assert.equal(submitted.response.status, 200); assert.equal(submitted.value.test.status, 'Submitted'); assert.equal(submitted.value.test.submissionHistory.length, 1);
  const lockedEvidence = await request(`/api/tests/${id}/evidence`, { token: tester, form: evidenceForm() }); assert.equal(lockedEvidence.response.status, 409);
  const testerCannotReview = await request(`/api/tests/${id}/review`, { token: tester, body: { decision: 'APPROVE', comment: 'Role separation must block this.' } }); assert.equal(testerCannotReview.response.status, 403);

  const returned = await request(`/api/tests/${id}/review`, { token: reviewer, body: { decision: 'RETURN', comment: 'Add a clearer controlled observation note.' } });
  assert.equal(returned.value.test.status, 'Returned');
  const corrected = await request(`/api/tests/${id}`, { token: tester, method: 'PATCH', body: { expectedVersion: returned.value.test.recordVersion, notes: 'Clarified controlled observation note after independent return.' } });
  assert.equal(corrected.value.test.status, 'Returned');
  submitted = await request(`/api/tests/${id}/submit`, { token: tester, body: { expectedVersion: corrected.value.test.recordVersion } }); assert.equal(submitted.value.test.submissionHistory.length, 2);

  const approved = await request(`/api/tests/${id}/review`, { token: reviewer, body: { decision: 'APPROVE', comment: 'All applicable observations, clause rows, equipment and evidence independently reviewed.' } });
  assert.equal(approved.response.status, 200); assert.equal(approved.value.test.status, 'Approved');
  assert.equal(approved.value.test.integrityHash.length, 64); assert.equal(approved.value.test.statusIntegrityHash.length, 64); assert.equal(approved.value.test.integrityVersion, 3);
  const editIssuedBlocked = await request(`/api/tests/${id}`, { token: tester, method: 'PATCH', body: { expectedVersion: approved.value.test.recordVersion, notes: 'Forbidden edit' } }); assert.equal(editIssuedBlocked.response.status, 409);

  const verification = await request(`/api/public/verify/${approved.value.test.verificationCode}`);
  assert.equal(verification.response.status, 200); assert.equal(verification.value.valid, true); assert.equal(verification.value.authentic, true);
  assert.equal(verification.value.report.coverage.percent, 100); assert.equal(verification.value.report.coverage.totalReportSections, 34); assert.equal(verification.value.report.syntheticDemo, true);

  const pdf = await request(`/api/tests/${id}/report.pdf`, { token: reviewer });
  assert.equal(pdf.response.status, 200); const pdfBuffer = Buffer.from(pdf.value); assert.equal(pdfBuffer.subarray(0, 4).toString(), '%PDF'); assert.ok(pdfBuffer.byteLength > 50_000);
  const word = await request(`/api/tests/${id}/report.doc`, { token: reviewer });
  assert.equal(word.response.status, 200); const wordText = Buffer.from(word.value).toString('utf8'); assert.ok(wordText.length > 100_000); assert.match(wordText, /UNCONTROLLED EDITABLE COPY/); assert.match(wordText, /12\.7b/); assert.match(wordText, /Governed R 76-1 requirement-family matrix/); assert.match(wordText, /Evidence manifest with byte hashes/);

  const revoked = await request(`/api/tests/${id}/revoke`, { token: reviewer, body: { reason: 'Controlled revocation exercised by integration test.' } });
  assert.equal(revoked.value.test.status, 'Revoked');
  const revokedVerification = await request(`/api/public/verify/${approved.value.test.verificationCode}`); assert.equal(revokedVerification.value.valid, false); assert.equal(revokedVerification.value.authentic, true); assert.equal(revokedVerification.value.revoked, true); assert.equal(revokedVerification.value.integrity.statusValid, true);
  const revision = await request(`/api/tests/${id}/revise`, { token: tester, method: 'POST' }); assert.equal(revision.response.status, 201); assert.equal(revision.value.test.revision, 2); assert.equal(revision.value.test.status, 'Draft');
  const duplicateRevision = await request(`/api/tests/${id}/revise`, { token: tester, method: 'POST' }); assert.equal(duplicateRevision.response.status, 409);

  const audit = await request('/api/audit', { token: reviewer }); assert.equal(audit.value.integrity.valid, true); assert.ok(audit.value.events.length >= 14);
  const forbiddenAdmin = await request('/api/admin/users', { token: tester }); assert.equal(forbiddenAdmin.response.status, 403);
  const health = await request('/api/health'); assert.equal(health.value.auditLedger.valid, true); assert.equal(health.value.r76Coverage.reportSections, 34); assert.equal(health.value.r76Coverage.detailedChecklistRows, 149); assert.equal(health.value.ruleContentHash.length, 64);
  await mutateDatabase((database) => { database.users.find((user) => user.id === 'user-auditor').active = false; });
  const disabledSession = await request('/api/auth/me', { token: auditor }); assert.equal(disabledSession.response.status, 401); assert.match(disabledSession.value.error, /no longer active/i);

  console.log(JSON.stringify({
    result: 'PASS', workflow: 'Blank autosave -> conflict guard -> full coverage -> hashed evidence -> return/resubmit -> independent approval -> revocation -> single correction revision',
    coverage: '34 report sections + 73 clause families + 149 detailed rows', publicVerification: true,
    pdfBytes: pdfBuffer.byteLength, editableReportBytes: wordText.length, auditEventsVerified: audit.value.integrity.checked,
    roleAndLockDenialsVerified: 6, optimisticConflictVerified: true, evidenceProtectionVerified: true, currentAccountStateVerified: true,
  }, null, 2));
} finally {
  if (server.exitCode === null) server.kill('SIGTERM');
  await Promise.race([serverExit, new Promise((resolve) => setTimeout(resolve, 3_000))]);
  await rm(dataDir, { recursive: true, force: true });
}
