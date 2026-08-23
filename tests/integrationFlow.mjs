import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const port = 4291;
const base = `http://127.0.0.1:${port}`;
const dataDir = await mkdtemp(path.join(tmpdir(), 'maapsure-integration-'));
const server = spawn(process.execPath, ['server/index.js'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env, PORT: String(port), NODE_ENV: 'development', JWT_SECRET: 'integration-test-secret-with-sufficient-length', MAAPSURE_DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { const response = await fetch(`${base}/api/health`); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Integration server did not start.');
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

try {
  await waitForServer();
  const tester = await login('inspector@maapsure.in', 'Inspect@123');
  const records = await request('/api/tests', { token: tester });
  const seed = records.value.tests.find((item) => item.id === 'test-pass-seed');
  assert.ok(seed?.evaluation.complete);

  const created = await request('/api/tests', { token: tester, body: {
    instrumentId: seed.instrumentId, input: seed.input, inspectorName: 'Arjun Sharma', inspectorId: 'LMO-0186',
    laboratory: 'Integration Test Laboratory', temperature: 24, humidity: 50, notes: 'Controlled integration workflow.',
  } });
  assert.equal(created.response.status, 201); assert.equal(created.value.test.status, 'Draft');
  const id = created.value.test.id;

  const blockedWithoutEvidence = await request(`/api/tests/${id}/submit`, { token: tester, method: 'POST' });
  assert.equal(blockedWithoutEvidence.response.status, 400);

  const form = new FormData();
  form.append('evidence', new Blob([Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF')], { type: 'application/pdf' }), 'traceable-weight-certificate.pdf');
  const uploaded = await request(`/api/tests/${id}/evidence`, { token: tester, form });
  assert.equal(uploaded.response.status, 201);

  const submitted = await request(`/api/tests/${id}/submit`, { token: tester, method: 'POST' });
  assert.equal(submitted.value.test.status, 'Submitted');
  const selfApprovalBlocked = await request(`/api/tests/${id}/review`, { token: tester, body: { decision: 'APPROVE', comment: 'Tester must not approve own work.' } });
  assert.equal(selfApprovalBlocked.response.status, 403);

  const reviewer = await login('reviewer@maapsure.in', 'Review@123');
  const approved = await request(`/api/tests/${id}/review`, { token: reviewer, body: { decision: 'APPROVE', comment: 'Readings and attached traceability evidence independently reviewed.' } });
  assert.equal(approved.value.test.status, 'Approved'); assert.equal(approved.value.test.integrityHash.length, 64);

  const verification = await request(`/api/public/verify/${approved.value.test.verificationCode}`);
  assert.equal(verification.value.valid, true); assert.equal(verification.value.authentic, true);
  const pdf = await request(`/api/tests/${id}/report.pdf`, { token: reviewer });
  assert.equal(pdf.response.status, 200); assert.ok(pdf.value.byteLength > 3000);
  const word = await request(`/api/tests/${id}/report.doc`, { token: reviewer });
  assert.equal(word.response.status, 200); assert.ok(word.value.byteLength > 1000);

  const audit = await request('/api/audit', { token: reviewer });
  assert.equal(audit.value.integrity.valid, true); assert.ok(audit.value.events.length >= 7);
  const forbiddenAdmin = await request('/api/admin/users', { token: tester });
  assert.equal(forbiddenAdmin.response.status, 403);
  const health = await request('/api/health');
  assert.equal(health.value.auditLedger.valid, true);

  console.log(JSON.stringify({
    result: 'PASS', workflow: 'Draft -> evidence -> Submitted -> independent Approved',
    publicVerification: true, pdfBytes: pdf.value.byteLength, editableReportBytes: word.value.byteLength,
    auditEventsVerified: audit.value.integrity.checked, roleDenialsVerified: 2,
  }, null, 2));
} finally {
  server.kill('SIGTERM');
  await new Promise((resolve) => server.once('exit', resolve));
  await rm(dataDir, { recursive: true, force: true });
}
