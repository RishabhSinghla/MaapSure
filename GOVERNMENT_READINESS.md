# Government-readiness handover

## Direct answer

MaapSure is a **government-style engineering prototype**, not government-ready statutory software today.

It demonstrates a broad, governed digital mapping of the OIML R 76 type-evaluation workflow. It does not prove that every OIML requirement, referenced IEC/ISO method, Indian legal requirement or authority interpretation is covered. No software team can grant itself Legal Metrology authority, laboratory accreditation or model-approval power.

## Current prototype inventory

| Layer | Current catalog | What the number means | What it does not mean |
| --- | ---: | --- | --- |
| Report flow | 34 entries | Digital entries aligned to major numbered and split R 76-2 test/examination paths | An authority-approved reproduction of every official field and procedure |
| Requirement matrix | 73 family records | Project-defined family-level mapping across selected clause 2 provisions, clauses 3–8 and Annexes A–G | Every subclause and interpretation has been proven complete |
| Automatic family results | 11 of 73 | Derived from linked deterministic evaluators | The underlying physical procedure or observation is authentic |
| Expert family dispositions | 62 of 73 | Applicable records need a human PASS/FAIL disposition and note | The person is qualified or authorized merely because they have an account |
| Detailed checklist | 149 prompts | Catalogued construction, marking, function, software and module questions | An official exhaustive checklist endorsed by OIML or India |

R 76-2 itself explains that its checklist is a summary and is not a substitute for R 76-1. The official form does not repeat all general requirements, permitted-device provisions or the full non-self-indicating path. MaapSure adds family records and supplemental prompts, but only an authorized clause-by-clause review can determine whether that expansion is complete and correct.

## Built and demonstrable

### Workflow

- Model-approval/type-evaluation dossier and rules-based applicability.
- Resumable drafts and conflicting-edit detection.
- Server-side recalculation at submission and approval.
- Independent review with self-approval blocking.
- Locked approved snapshots, return, revocation and linked revisions.
- Evidence linked to a report entry, with recalculation of the evidence file’s SHA-256 hash before approval.
- Equipment identity, calibration, due-date, uncertainty and traceability fields.
- PDF and uncontrolled editable Word-compatible exports.
- A public record-consistency and current-revocation check.

### Standards support

- Structured observation forms and deterministic evaluators for the mapped test paths.
- Corrected indication, error, zero correction and MPE comparison in the current engine.
- Feature-derived not-applicable reasons for catalogued paths.
- Manual expert-disposition fields for construction and other non-calculation families.
- A locked rules-profile and engine-artifact hash in submitted work.

### Prototype security and governance controls

- Salted password hashes, login throttling, role checks and signed web sessions.
- File-size, declared-type and file-signature checks on uploads.
- Authenticated evidence downloads.
- SHA-256 fingerprints for approved snapshots and status.
- A SHA-256 hash-linked audit sequence.
- Synthetic demonstration data clearly marked in reports and verification output.

## Four different kinds of work

These must not be mixed together in a judge or government claim:

### 1. Digitally mapped

The software has a label, field set, applicability route or checklist prompt. Mapping is useful for finding gaps, but mapping alone proves neither technical correctness nor statutory completeness.

### 2. Automatically evaluated

The software applies a deterministic formula or completion rule to entered data. It can consistently reproduce its own rule. It cannot prove that the rule is the authority’s accepted interpretation, the equipment was correctly configured, or the observation is genuine.

### 3. Expert disposition

A qualified examiner must inspect drawings, construction, markings, software, interfaces, modules, procedures and evidence and then record a reasoned outcome. A dropdown does not replace expertise.

### 4. Physical laboratory work

Reference weights, temperature/humidity chambers, electrical-disturbance generators, RF/ESD setups, endurance rigs and other equipment create the real test conditions. MaapSure records and evaluates their outputs; it does not perform those tests.

## SHA-256: what it proves and what it does not

The current hashes are **unkeyed SHA-256 consistency fingerprints**.

They can show that the current stored bytes or snapshot do not match the stored fingerprint. The audit chain can expose a changed historical entry when checked from its stored beginning.

They do not provide cryptographic authenticity by themselves because there is no authority-controlled signing key, trusted timestamp or independently anchored ledger. A person who can replace both a record and its unkeyed reference hash could create a new internally consistent pair. Therefore use “consistency check” or “tamper-evident within the controlled store,” not “cryptographically authentic government certificate.”

Real issuance needs an approved digital-signature/eSign design, hardware- or service-protected government keys, trusted timestamps, certificate validation, revocation handling and independent anchoring/retention controls.

## Current storage boundary

The demonstration uses a local JSON data file, serialized updates, temporary-file replacement and rotating local backups. This is useful for isolated SIH demonstrations and tests. It is not a multi-user government-grade database and does not provide database transactions across services, replication, high availability, approved encryption-at-rest key management, immutable external audit retention or disaster recovery.

Before production, move the governed model to an approved database and object store without weakening the snapshots, evidence hashes, version checks or audit lineage.

## External standards and edition control

OIML R 76-1 Annex B invokes IEC and other external test methods for electrical disturbances. Those standards are revised independently. The prototype maps the R 76 branches, but it does not currently prove that every protocol field, generator setup, coupling method, dwell time, frequency range, severity, repetition and acceptance interpretation matches the **current authority-selected IEC/ISO/Indian edition**.

Before any real test:

1. the authority must list the exact controlled edition of every referenced standard;
2. an expert must compare the software protocol with those editions and national adoptions;
3. the approved editions and procedure identifiers must be stored in the rules version and report; and
4. a standards change must create a reviewed rules version, regression cases and migration decision.

Do not assume the 2006/2007 OIML documents automatically point to the latest external-standard edition.

## Mandatory gates before statutory use

1. **Authoritative coverage review:** produce a clause/subclause crosswalk from the authority’s controlled R 76-1 copy, R 76-2 form, applicable Indian rules, circulars and model-approval procedure. Record covered, partially covered, external-reference, expert-only and out-of-scope items.
2. **Formula and applicability validation:** authorized Legal Metrology experts must sign every threshold, sequence, applicability decision, unit conversion and report outcome using controlled reference cases.
3. **Current IEC/ISO/IS validation:** freeze and validate all external test-standard editions, setups and severities.
4. **Physical laboratory trials:** compare representative Class I, II, III and IIII, multi-range, multi-interval, analog, non-self-indicating, rolling-load, module and software cases against independently prepared official reports.
5. **Report approval:** approve the exact report layout, numbering, terminology, signatures, seals, correction, retention and revocation rules.
6. **Official identity and signatures:** replace demo users with an approved identity provider, MFA, officer appointment/lifecycle checks and an approved signing/timestamp service.
7. **Production data platform:** use an approved encrypted database and object store with transactional integrity, access logs, backups, tested recovery, replication, retention and legal holds.
8. **Approved deployment:** use approved HTTPS hosting, environment separation, secrets/key management, monitoring, patching and network controls.
9. **Independent assurance:** complete security testing, privacy review, accessibility testing, performance/load tests, disaster-recovery exercises and required government security approvals.
10. **Operational acceptance:** define rule ownership, change control, incident response, training, support, user acceptance, parallel operation, rollback and recurring standards review.

## Honest release gates

| Gate | Current state |
| --- | --- |
| Demonstration catalog and workflow implemented | Built; verify with current automated tests |
| Software behaves as implemented | Must be evidenced by passing unit, integration and build checks |
| Clause mapping is authoritative and complete | Not yet; authorized review required |
| Current external-standard methods are validated | Not yet; controlled-edition review required |
| Physical laboratory method is validated | Not yet; laboratory trials required |
| Cryptographic government issuance is implemented | Not yet; approved signatures/timestamps required |
| Storage and hosting are government production-ready | Not yet; JSON demo store must be replaced |
| Statutory use is accepted | Not yet; responsible authority decides |

## Design rule that must remain

AI may help explain observations, find missing notes or summarize evidence. It must never fabricate a reading, silently change a formula, publish a rules version, turn expert judgment into an automatic PASS, approve a report or make the statutory decision.

## Primary sources

- [OIML R 76-1:2006](https://www.oiml.org/en/files/pdf_r/r076-1-e06.pdf)
- [OIML R 76-2:2007 test report format](https://www.oiml.org/en/files/pdf_r/r076-2-e07.pdf/@@download/file/R076-2-e07.pdf)
- [Department of Consumer Affairs — Legal Metrology Act and Rules](https://consumeraffairs.gov.in/index.php/pages/legal-metrology-act)
