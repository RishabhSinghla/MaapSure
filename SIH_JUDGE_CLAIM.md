# Safe wording for SIH judges

## Best one-sentence claim

> “MaapSure demonstrates a governed digital mapping of 34 OIML R 76-2-aligned report entries, 73 project-defined R 76-1 requirement-family records and 149 detailed examination prompts, separating deterministic calculations from expert judgment, physical laboratory work and independent review.”

## Strong 20-second version

> “A laboratory describes the submitted weighing-machine model, and MaapSure generates the mapped applicable plan, records observations and calibrated-equipment evidence, calculates implemented results, blocks incomplete work and requires a different reviewer. The mapping is visible for expert validation instead of being hidden in spreadsheets or code.”

## If asked, “Is every OIML rule covered?”

> “We do not make that statutory-completeness claim. The prototype currently maps 34 R 76-2-aligned report entries, 73 project-defined R 76-1 families and 149 detailed prompts. OIML itself says the R 76-2 checklist is only a summary, so our next gate is an authorized clause-by-clause crosswalk, current external-standard validation and physical laboratory comparison.”

## If asked, “What is automatic?”

> “The engine deterministically evaluates the structured observations it supports and derives 11 family outcomes from linked test entries. The other 62 family records and applicable detailed prompts require expert dispositions. Automatic arithmetic does not prove that a physical test was performed correctly.”

## If asked about integrity

> “MaapSure uses SHA-256 to detect inconsistency between stored evidence, approved snapshots, status and the hash-linked audit history. Those are unkeyed consistency fingerprints, not government digital signatures or independent issuer authentication. Production issuance needs approved signing keys and trusted timestamps.”

## If asked whether it is government ready

> “It is a government-style hackathon prototype. The current local JSON store, demo identities and synthetic case are deliberate demonstration components. Production needs an approved database and object store, official identity and signatures, current IEC/ISO/Indian procedure validation, real laboratory trials, security approval and statutory acceptance.”

## Claims to avoid

Do not say:

- “Every OIML rule is covered.”
- “OIML or the Government of India has approved MaapSure.”
- “The 34/73/149 counts are official OIML coverage counts.”
- “All tests are automatic.”
- “The software performs EMI, damp-heat or endurance testing.”
- “The SHA hash proves the government issued this report.”
- “The synthetic passing case proves a real instrument passes.”
- “The external IEC methods are automatically current.”
- “The JSON store is production ready.”

Say instead:

- “broad, inspectable prototype mapping”;
- “34 report entries, 73 family records and 149 prompts in our software catalog”;
- “11 automatically derived family outcomes and 62 expert-disposition families”;
- “records and evaluates outputs from qualified physical laboratory work”;
- “SHA-256 consistency and tamper-evidence within the controlled store”;
- “synthetic data used only to demonstrate workflow”;
- “current external-standard editions remain an authority-validation gate”; and
- “government-style prototype with a clear production migration plan.”

## Standards answer

Show the official [OIML R 76-1:2006 recommendation](https://www.oiml.org/en/files/pdf_r/r076-1-e06.pdf) and [OIML R 76-2:2007 report format](https://www.oiml.org/en/files/pdf_r/r076-2-e07.pdf/@@download/file/R076-2-e07.pdf). Explain that the project uses R 76-2 to organize report entries and R 76-1 to build the wider family/prompt mapping, but the authority must validate that interpretation and the current editions of external test standards.
