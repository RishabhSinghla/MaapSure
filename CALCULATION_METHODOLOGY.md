# Calculation methodology and validation boundary

## Purpose

This document explains the calculation path currently implemented in MaapSure. It is an engineering description, not an approved Legal Metrology procedure.

The prototype was developed against [OIML R 76-1:2006](https://www.oiml.org/en/files/pdf_r/r076-1-e06.pdf), with report organization informed by [OIML R 76-2:2007](https://www.oiml.org/en/files/pdf_r/r076-2-e07.pdf/@@download/file/R076-2-e07.pdf). An authorized expert must validate the implementation against controlled copies, current external standards and the applicable Indian procedure before real use.

## Current corrected-error implementation

For observation rows that use fractional additional weights, the engine calculates:

```text
P  = I + 0.5e - ΔL
E  = P - L
Ec = E - E0
```

Where:

- `I` is the displayed indication before the small additional weights;
- `e` is the verification interval selected for the row;
- `ΔL` is the small additional load needed to reach the next indication;
- `P` is the calculated indication before rounding;
- `L` is the applied test load;
- `E` is the indication error; and
- `E0` is the recorded/calculated zero error for that series.

The current comparison is:

```text
PASS when |Ec| <= |MPE|
FAIL when |Ec| >  |MPE|
```

Equality is treated as a pass. The report keeps signed errors while the limit comparison uses magnitude.

### Numerical example

Assume kilograms:

```text
I   = 10.000
e   = 0.010
ΔL  = 0.003
L   = 10.000
E0  = 0.001

P   = 10.000 + 0.005 - 0.003 = 10.002
E   = 10.002 - 10.000         = 0.002
Ec  = 0.002 - 0.001           = 0.001
```

The engine then selects the MPE for the recorded load, accuracy class and range and compares it with `|0.001|`.

This example proves the arithmetic only. It does not prove the additional-weight procedure, zero-error method, selected `e`, load plan or MPE interpretation is authorized for a particular case.

## Range and MPE selection

The dossier stores minimum and maximum capacity, verification interval `e`, actual scale interval `d`, class and declared ranges.

- A single-range case uses its declared range.
- A multiple-range or multi-interval case selects a declared range containing the load, with a recorded range identifier where needed.
- The chosen range’s `e` is used for the current corrected indication and MPE logic.
- Dossier validation checks interval form and selected class/capacity relationships implemented by the engine.
- The performance plan looks for Min, Max and implemented MPE transition targets.

These rules require controlled expert validation, especially at range boundaries, change-over points, auxiliary indication, non-self-indicating designs and module combinations.

## Empty is not zero

The software distinguishes:

- blank or nonnumeric input → **incomplete**;
- entered numeric zero → a real observation; and
- an incomplete required row → submission blocker.

This guards against blank forms appearing to pass. It does not guard against a user deliberately entering a false zero; evidence, equipment traceability and reviewer checks are still required.

## What the automatic engine does

The current engine contains structured evaluators for the mapped observation/test entries. Depending on applicability, these cover weighing performance, temperature zero, eccentricity, discrimination, sensitivity, repeatability, zero return, creep, functional stability, tilting, tare, warm-up, voltage, disturbance branches, damp heat, span stability and endurance.

It calculates or checks implemented completeness rules, corrected errors, MPE comparisons, spreads, timed changes, deviations and linked section outcomes. Eleven project-defined family records are then derived from linked evaluator results.

Automatic evaluation means **repeatable software behavior for entered data**. It does not prove:

- that the test plan is the authority-approved interpretation;
- that equipment generated the correct conditions;
- that a reading came from the declared specimen;
- that a person followed the procedure;
- that an external report is acceptable; or
- that the software covers every subrequirement of the linked family.

## What requires expert disposition

The other 62 family records and applicable detailed checklist prompts require a human outcome and note. Typical subjects include terminology and units, test standards, classification details, construction suitability, indication behavior, zero/tare design, markings, direct-sales functions, interfaces, software, modules and controls.

The current form records the examiner’s disposition; it does not establish their competence or statutory authority. Production must connect the account to official appointment, scope and signature credentials.

## What requires a physical laboratory

MaapSure records observations but does not create physical test conditions. Qualified laboratories must supply, control and evidence:

- reference weights and load application;
- temperature, humidity and pressure conditions;
- tilt, rolling-load and endurance rigs;
- voltage sources and monitoring;
- ESD, burst, surge, RF, dips/interruptions and vehicle-transient equipment; and
- calibrated measurement equipment and uncertainty/traceability information.

The software currently checks that equipment records contain required fields and have non-expired entered dates. It does not independently query an accreditation or calibration authority to prove those records genuine.

## External IEC/ISO edition gap

R 76 Annex B uses external standards for disturbance methods. Those standards can be revised independently from R 76. The prototype represents the disturbance branches and an implemented protocol shape, but it is not an approved, automatically updated implementation of every current IEC/ISO/Indian-adopted procedure.

Before laboratory use, the responsible authority must approve a table containing the exact edition, amendment, severity, setup, port selection, generator/coupling method, duration, repetitions and acceptance interpretation for each branch. That table should become part of a signed rules version and regression-test pack.

## Completeness, compliance and authority are separate

For each mapped item, the software distinguishes:

1. **Applicability** — according to the current questionnaire and rule.
2. **Completeness** — whether the fields/evidence required by the implementation are present.
3. **Compliance** — whether the implemented deterministic limit or expert disposition says PASS.

A fourth state exists outside the engine:

4. **Authority acceptance** — whether the responsible Legal Metrology authority accepts the mapping, method, evidence and outcome.

A 100% software completion score addresses only the current catalog. It is not 100% statutory coverage or approval.

## Submission and approval controls

The browser gives draft feedback, but the server recalculates at submission and approval. It also checks the saved version, instrument/rules snapshots, equipment fields and dates, linked evidence, unresolved mapped entries and reviewer separation.

Approved records store a snapshot and SHA-256 fingerprints. These hashes detect changes relative to the stored reference. They are not digital signatures, trusted timestamps or proof of issuer identity. Government issuance needs authority-controlled keys and an approved signing/timestamp design.

## Synthetic demonstration case

The included passing case is generated by software to exercise branches and screens. Its observations, equipment and evidence are synthetic. It cannot validate a physical instrument, a laboratory procedure or the standards interpretation. Reports must keep the synthetic warning visible, and production submission is blocked unless an explicit demo override is enabled.

## Software verification

The automated suite is intended to exercise implemented arithmetic, MPE boundaries, range selection, incomplete-input handling, applicability, selected failure paths, workflow controls and fingerprint mismatch detection. The end-to-end check uses an isolated temporary JSON store.

Passing tests means “the code behaved as its tests describe.” It does not mean “OIML, IEC or the Government of India certified the implementation.”

## Required validation pack

Before claiming technical readiness, obtain:

1. an authority-reviewed clause/subclause crosswalk;
2. signed calculation examples for all classes and boundary conditions;
3. current-edition IEC/ISO/Indian protocol approvals;
4. known-answer reports for representative instrument types;
5. physical laboratory parallel runs;
6. documented uncertainty and equipment-traceability treatment; and
7. formal sign-off on all applicability and exception paths.
