# OIML R 76 prototype mapping inventory

## Read this before quoting the counts

This document describes what the current MaapSure catalog maps. It is **not** an official coverage certificate and must not be quoted as “every OIML rule is covered.”

The current code contains:

- **34 R 76-2-aligned digital report entries**;
- **73 project-defined R 76-1 family records**; and
- **149 catalogued detailed examination prompts**.

These counts were read from the software catalogs. They are design inventory, not counts published by OIML. An authorized expert must validate each mapping against controlled standards and the Indian model-approval procedure.

## Coverage types

| Type | Current implementation | Human/external dependency |
| --- | --- | --- |
| Digitally mapped | A report entry, family record or detailed prompt exists | Expert must confirm scope, wording, clause and applicability |
| Automatically evaluated | Structured observations go through a deterministic evaluator; 11 family records derive from linked test results | Laboratory method and formula interpretation still need authorized validation |
| Expert disposition | 62 family records and applicable detailed prompts need PASS/FAIL plus notes | Qualified examiner must inspect construction/documents/evidence |
| Physical laboratory | Fields exist for measurements, conditions, equipment and evidence | Calibrated equipment and qualified staff must perform the actual test |
| External-standard controlled | Disturbance branches are represented | Authority must freeze and validate current IEC/ISO/Indian editions and full protocols |

## Why R 76-2 alone is not enough

[OIML R 76-2:2007](https://www.oiml.org/en/files/pdf_r/r076-2-e07.pdf/@@download/file/R076-2-e07.pdf) provides a report format and a summary checklist. It explicitly warns that the checklist does not substitute for [OIML R 76-1:2006](https://www.oiml.org/en/files/pdf_r/r076-1-e06.pdf). In particular, the short checklist does not repeat all general requirements, all permitted-device provisions or the full non-self-indicating path.

MaapSure adds a family matrix and supplemental prompts to reduce that gap. That expansion is still a team interpretation until an authorized Legal Metrology expert approves a clause/subclause crosswalk.

## 34 mapped report entries

| No. | Digital entry | Current software path | Main remaining validation |
| --- | --- | --- | --- |
| 1 | Weighing performance | Loading/unloading series and corrected-error comparison | Exact load plan, transitions and authority interpretation |
| 2 | Temperature effect on no-load indication | Ordered temperature points and zero-change calculation | Stabilization method and accepted temperature plan |
| 3.1 | Eccentricity using weights | Planned receptor positions and corrected errors | Load fraction, position plan and layout approval |
| 3.2 | Eccentricity using a rolling load | Section/direction/position records | Vehicle/rolling-load method and receptor plan |
| 4.1 | Discrimination | Digital, analog or non-self evaluator | Method selection and physical observation validity |
| 4.2 | Sensitivity | Non-self displacement records | Mechanism-specific procedure and examiner observation |
| 5 | Repeatability | Two series, individual errors and spread | Physical repetitions and accepted load tolerance |
| 6.1 | Zero return | Timed near-Max loading comparison | Timing and multiple-range method |
| 6.2 | Creep | Timed readings and early/full paths | Controlled conditions and physical duration |
| 7a | Stability — printing/storage | Five functional attempts | Protected parameters and functional evidence |
| 7b | Stability — zero/tare | Five functional attempts | Function-specific expert evidence |
| 8 | Tilting | Reference and directional position records | Applicability, tilt fixture and authority-approved plan |
| 9 | Tare weighing | Tare error and net loading/unloading | Device-specific usable range and procedure |
| 10 | Warm-up time | Disconnection and timed observations | Physical timing and output-inhibition evidence |
| 11 | Voltage variations | Declared supply limits and observations | Current accepted supply method and setup |
| 12.1 | AC voltage dips/interruptions | Structured disturbance protocol and deviation outcome | Current IEC edition, setup, severities and repetitions |
| 12.2a | Bursts — mains | Polarity/run records | Current IEC edition, coupling and generator settings |
| 12.2b | Bursts — I/O/communication | Applicable-line records | Current IEC edition and line-selection rules |
| 12.3a | Surges — mains | Polarity/phase records | Current IEC edition, source impedance and coupling |
| 12.3b | Surges — other power | External-supply records | Current IEC edition and applicable port method |
| 12.4a | Direct ESD | Direct-discharge records | Current IEC edition, contact/air method and points |
| 12.4b | Indirect ESD | Coupling-plane records | Current IEC edition and coupling-plane setup |
| 12.5 | Radiated RF immunity | Sweep observation records | Current IEC edition, field calibration, dwell and range |
| 12.6 | Conducted RF immunity | Applicable-port observation records | Current IEC edition, CDN/clamp, dwell and range |
| 12.7a | Vehicle transients — supply | Vehicle-supply pulse records | Current selected ISO/IEC/national method and pulse setup |
| 12.7b | Vehicle transients — other lines | Coupled non-supply-line records | Current selected external standard and coupling method |
| 13a | Damp heat — initial reference | Corrected-error series | Chamber method and accepted conditioning |
| 13b | Damp heat — high temperature/RH | Corrected-error series after exposure | Chamber mapping, exposure and recovery controls |
| 13c | Damp heat — final reference | Corrected-error series after recovery | Final conditioning and comparison method |
| 14 | Span stability | Repeated corrected-error sets | Duration, intervals and reference-condition controls |
| 15a | Endurance — initial | Initial corrected-error series | Applicability and physical pre-cycle method |
| 15c | Endurance — final | Cycle record and final durability comparison | 100,000 physical cycles and failure/repair handling |
| 16 | Construction examination | Manual family matrix and dossier narrative | Qualified document/construction examination |
| 17 | Report checklist | Manual detailed-prompt matrix | Authority-approved checklist and evidence standard |

There is no separately counted digital result called 15b in this catalog; the physical cycling record sits between the mapped initial and final endurance observations. An authority should confirm this report representation.

## 73 project-defined family records

| R 76-1 area | Family records currently represented | Count |
| --- | --- | ---: |
| Clause 2 | 2.1 units, 2.4 application and 2.5 binding terminology | 3 |
| Clause 3 | Main 3.1–3.11 families plus separate test-standard, substitution and peripheral-device records | 14 |
| Clause 4 | Main 4.1–4.20 families plus separate fraudulent-use, breakdown and control/adjustment records | 23 |
| Clause 5 | Main 5.1–5.5 families plus durable-compliance and manufacturer fault-strategy records | 7 |
| Clause 6 | 6.1 through 6.9 | 9 |
| Clause 7 | 7.1 and 7.2 | 2 |
| Clause 8 | 8.1 through 8.4 | 4 |
| Annexes | Annex A–G plus separate C.1–C.4, D.1–D.4, E.1–E.4 and F.1–F.5 records | 11 |
| **Catalog total** |  | **73** |

### Automatic family records (11)

The current catalog marks these families as derived from linked test entries: 3.5, 3.6, 3.8, 3.9, 3.10, 5.2, 5.4, 6.1, 8.2, Annex A and Annex B.

“Automatic” means the current engine derives completion/PASS/FAIL from linked software sections. It does not mean the whole clause family is proven solely by arithmetic. For example, Annex B still depends on a valid physical setup, a current authority-selected external standard and expert review of exceptions.

### Expert-disposition family records (62)

The other family records require an applicable expert PASS/FAIL result and notes. Their presence in a form does not prove that every subclause was examined. Before statutory use, each family needs a controlled checklist of its actual subrequirements and accepted evidence.

Clauses 8.3 and 8.4 are represented for workflow completeness, but this prototype is labeled model approval/type evaluation. An authority must decide whether those control stages belong in this product or a separate workflow.

## 149 catalogued detailed prompts

The 149 current prompts are grouped as 76 general R 76-2 checklist prompts, 27 direct-sales/price prompts, 8 electronic-instrument prompts, 15 software prompts and 23 R 76-1 supplements. They cover topics such as:

- markings, verification-mark provisions, securing and type documents;
- basic classification, construction suitability and module information;
- analog/digital indication, printing and memory;
- zero, zero-tracking, tare, preset tare and range selection;
- direct sales, price functions, mobile use and operating modes;
- significant faults, interfaces and transmitted data;
- embedded/loadable software, separation, identification and stored data; and
- selected supplemental paths for auxiliary verification and non-self-indicating instruments.

Applicable prompts require an expert disposition and note. They are not automatically evaluated measurements. The number 149 does not demonstrate legal sufficiency or subclause completeness; those must be checked during the authoritative crosswalk review.

## Applicability boundary

The software derives applicability from questionnaire fields for indication method, ranges, receptor/rolling use, mobility, zero/tare, sales functions, power/ports, software/modules and non-self mechanisms.

This reduces free-form skipping. It does not eliminate risk from an incomplete questionnaire, a false declaration, a missing instrument feature or an incorrect applicability rule. The examiner must verify the dossier against the physical specimen and submitted documents.

## What is outside the current proof

- Current IEC/ISO/Indian standard editions and their complete procedures.
- Physical execution, accreditation, competence and calibration validity beyond entered records.
- Official Indian report wording, numbering, signature, seal, retention and model-approval policy.
- Independent expert validation of every formula, threshold and applicability decision.
- Cryptographic issuer authenticity; current SHA-256 values are internal consistency checks, not authority signatures.
- Government production storage and hosting; the demonstration uses local JSON files.
- Real-laboratory validation; the included complete case is synthetic.

## Safe conclusion

> MaapSure has a broad, inspectable prototype mapping of 34 R 76-2-aligned report entries, 73 project-defined R 76-1 family records and 149 detailed prompts. It separates deterministic calculations from expert dispositions and physical laboratory work. Authoritative completeness, current external-standard editions and statutory acceptance remain validation gates.
