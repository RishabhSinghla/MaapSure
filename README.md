# MaapSure

MaapSure is a controlled digital laboratory system for SIH 2026 problem statement **SIH26035**. It guides testing of non-automatic weighing instruments, applies visible OIML R 76 calculations, enforces independent review, produces locked reports and lets the public detect revoked or altered records.

## Start it

Node.js 20 or newer is required.

```bash
npm install
npm run check
npm start
```

Open [http://localhost:4173](http://localhost:4173).

## Demo roles

| Role | Email | Password | What the role proves |
| --- | --- | --- | --- |
| Tester | `inspector@maapsure.in` | `Inspect@123` | Records observations, attaches evidence and submits |
| Reviewer | `reviewer@maapsure.in` | `Review@123` | Independently approves, returns or revokes |
| Administrator | `admin@maapsure.in` | `Demo@123` | Views users, governed rules and controlled exports |
| Auditor | `auditor@maapsure.in` | `Audit@123` | Read-only access to the tamper-evident audit trail |

These are demonstration accounts only. Replace them with the department identity provider before real use.

## What is built

- Nine deterministic calculation sections:
  - Weighing performance and OIML Table 6 error limits
  - Repeatability, including individual error and spread checks
  - Eccentric loading
  - Return to zero
  - Temperature effect at zero
  - Digital discrimination
  - Creep
  - Warm-up time
  - Voltage variation
- Ten structured conditional sections matching the OIML R 76-2 report structure. Every section needs either a tested result with an evidence note, or a written reason for not being applicable.
- A versioned, immutable published rules profile. Every report keeps the exact rules version used.
- Draft → Submitted → independently Approved / Returned workflow.
- Separation of duties: a tester cannot approve their own work.
- Approved records are locked. Corrections create a traceable new revision.
- Revocation with a permanent reason; the public page immediately shows the revoked state.
- SHA-256 report fingerprint covering readings, calculations, evidence and approval.
- SHA-256 chained audit history; changing an old event breaks the chain check.
- Evidence upload with file-size, allowed-type and file-signature checks.
- PDF and editable Microsoft Word-compatible reports.
- QR-backed public verification without login.
- Rules governance, pending expert change requests, named roles and a redacted backup export.
- Safer sign-in with salted password hashes, login throttling, short-lived signed sessions and browser security headers.
- Responsive mobile and desktop interface.

## Prove it works

```bash
npm test
npm run build
npm run test:integration
```

The integration check starts an isolated temporary laboratory and proves:

```text
Draft -> evidence -> Submitted -> independent Approved
-> public fingerprint verified -> PDF and editable report downloaded
-> audit chain valid -> forbidden role actions rejected
```

## Standards sources used

- [OIML R 76-1:2006](https://www.oiml.org/en/files/pdf_r/r076-1-e06.pdf)
- [OIML R 76-2:2007 test report format](https://www.oiml.org/en/files/pdf_r/r076-2-e07.pdf/@@download/file/R076-2-e07.pdf)
- [Department of Consumer Affairs Legal Metrology Act and Rules](https://consumeraffairs.gov.in/index.php/pages/legal-metrology-act)

## Production configuration

Copy `.env.example` and set a long random `JWT_SECRET`, the public HTTPS address and a protected data directory. Runtime data defaults to `data/`.

The full readiness boundary and departmental sign-off list are in [GOVERNMENT_READINESS.md](GOVERNMENT_READINESS.md).
