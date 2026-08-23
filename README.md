# MaapSure

MaapSure is a controlled digital prototype for **model approval / type evaluation** of non-automatic weighing instruments (NAWI). It was built for SIH 2026 problem statement **SIH26035**.

In simple words: a laboratory records the weighing-machine model, generates a rules-based test plan, enters observations made with laboratory equipment, and prepares a traceable report for independent review.

## What is mapped in this prototype

The current demonstration catalog contains:

- **34 digital report entries** aligned to the major numbered and split test/examination paths represented in the OIML R 76-2 report flow;
- **73 project-defined R 76-1 requirement-family records** covering selected clause 2 provisions, clauses 3 to 8 and Annexes A to G at family level; and
- **149 catalogued detailed examination prompts** for construction, markings, functions, software and modules.

These are software inventory counts, not official OIML coverage certificates. The mapping must be checked clause by clause by an authorized Legal Metrology expert. R 76-2 says its checklist is only a summary and does not replace the full requirements of R 76-1; a longer software checklist still does not prove that no sub-requirement, interpretation or national rule is missing.

The current rules engine automatically derives **11 requirement-family results** from linked tests. The other **62 family records**, and the applicable detailed prompts, require an expert to record a disposition and supporting note. Deterministic calculations can evaluate entered measurements; they cannot prove that the physical test was performed correctly.

See [R76_COVERAGE_MATRIX.md](R76_COVERAGE_MATRIX.md) for the exact mapping boundary and known gaps, and [CALCULATION_METHODOLOGY.md](CALCULATION_METHODOLOGY.md) for the current calculation method.

## Start it

Node.js 20 or newer is required.

```bash
npm install
npm run check
npm start
```

Open [http://localhost:4173](http://localhost:4173).

## Demo roles

| Role | Email | Password | What the role demonstrates |
| --- | --- | --- | --- |
| Tester | `inspector@maapsure.in` | `Inspect@123` | Creates a resumable case, records observations and submits it |
| Reviewer | `reviewer@maapsure.in` | `Review@123` | Independently approves, returns or revokes a case |
| Administrator | `admin@maapsure.in` | `Demo@123` | Views users, rules information and controlled exports |
| Auditor | `auditor@maapsure.in` | `Audit@123` | Has read-only access to the hash-chained audit history |

These are local demonstration identities, not verified government officers. Production use needs an approved identity provider, official officer authorization and approved digital signatures.

## What is built

- A model dossier for the applicant, instrument type, ranges, indication, modules, software, interfaces, power supplies and special functions.
- Feature-driven applicability for the model types currently represented by the questionnaire. The system records its reason when it marks a mapped entry not applicable.
- Structured forms and deterministic evaluators for the mapped measurement/test entries, including loading/unloading, temperature, eccentricity, repeatability, tare, electrical disturbances, damp heat, span stability and endurance.
- The current corrected-error implementation: `P = I + 0.5e - ΔL`, `E = P - L`, and `Ec = E - E0`, followed by comparison with the selected maximum permissible error.
- Expert-disposition matrices for construction, marking, software, module and other non-calculation requirements.
- A test-equipment register and evidence linked to report entries.
- Save-anytime drafts and optimistic conflict protection for multi-day work.
- Rules and instrument snapshots inside submitted cases.
- Draft → Submitted → independently Approved / Returned workflow, with self-approval blocked.
- Locked approved snapshots, formal revocation and traceable correction revisions.
- SHA-256 hashes for evidence bytes, approved snapshots, status and the audit chain.
- A controlled PDF and an **uncontrolled Word-compatible editable copy**.
- A public consistency/revocation check that does not expose the full laboratory record.
- A clearly marked synthetic SIH demonstration case.

## Important boundaries

- **Physical laboratory work:** MaapSure does not generate loads, temperature, humidity, electromagnetic disturbances or 100,000 endurance cycles. Qualified laboratories and calibrated equipment do that work.
- **Current IEC/ISO methods:** the R 76 disturbance branches refer to external test standards. The prototype does not contain an authority-approved, automatically updated library of the current IEC/ISO/Indian-adopted editions, exact setups and severity interpretations. These must be frozen and validated before real use.
- **Expert judgment:** construction, software, modules, markings, procedure suitability and accepted external reports need qualified human examination.
- **Storage:** the prototype stores runtime records in local JSON files. This is suitable for a hackathon demonstration, not a government production database.
- **Integrity:** unkeyed SHA-256 hashes detect inconsistency against the same stored reference. They are not digital signatures, trusted timestamps or independent proof of who issued a report.
- **Synthetic data:** the built-in passing case demonstrates software flow only. It is not a physical test, model approval or statutory certificate. Production mode blocks its submission unless an explicit demonstration override is enabled.

## Prove the software behavior

```bash
npm test
npm run test:integration
npm run build
```

The automated checks exercise calculations, incomplete-input behavior, applicability, conflict protection, evidence hashing, independent review, report generation and hash consistency. Passing these tests proves the implemented software path; it does not validate the standards interpretation or a laboratory method.

## Primary standards sources

- [OIML R 76-1:2006 — requirements and tests](https://www.oiml.org/en/files/pdf_r/r076-1-e06.pdf)
- [OIML R 76-2:2007 — test report format](https://www.oiml.org/en/files/pdf_r/r076-2-e07.pdf/@@download/file/R076-2-e07.pdf)
- [Department of Consumer Affairs — Legal Metrology Act and Rules](https://consumeraffairs.gov.in/index.php/pages/legal-metrology-act)

The remaining laboratory, expert, security, hosting and statutory approval gates are listed in [GOVERNMENT_READINESS.md](GOVERNMENT_READINESS.md). Safe SIH wording is in [SIH_JUDGE_CLAIM.md](SIH_JUDGE_CLAIM.md).
