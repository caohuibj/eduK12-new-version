# Cumulative Scale Intake — open PR, no automatic merge

Workflow: EDUK12 scale-intake 1.0.0. CI-DESIGN 0.1.0 is a proposal, not a wired control. Exact base `b85e3466819266ffb8cd844b39d87aa566fb90e6`. All upcoming Scale-only content batches will extend **this same branch and PR**, with separate C/P/R version receipts and unchanged published identities. New main baseline and changed inputs invalidate the applicable prior CI evidence; only the final frozen cumulative head can establish merge eligibility. **No automatic merge**.

## B001 — Rosenberg Self-Esteem Scale, original English (RSES-10)

- Instrument identity: `rses10_en@1.0.0` (new language/source identity); comparison: existing `rses10_zh_cn_research@1.0.0` remains unmodified. English is sourced from Rosenberg/PhenX, not back-translated from the Chinese research draft.
- **C 1.0.0 / scoring 1.0.0**: ten English PhenX-ordered statements; 0–3 keyed self-report options; reverse 3,5,8,9,10; sum 0–30. Fixed digital response display ordering SD/D/A/SA. Five golden inputs: score 20, ceiling 30, floor 0, all-agree 15, missing required null/invalid. `complete_required` is a conservative project rule; it is not asserted to be an original missing-data rule.
- **P none**: no norm, clinical cutoff, diagnostic bands or percentile. `referencePolicy.type=none`; `references=[]`.
- **R 1.0.0**: new English adult respondent description/reflection/support text with no score-derived high/low claim, historical-report back-calculation or privileged numerical disclosure. Optional charts are unnecessary for this single real 0–30 total and no verified reference bands.
- Identity/rights: [University of Maryland public-domain and translation permission](https://socy.umd.edu/about-us/rosenberg-self-esteem-scale), [official use and scoring instructions](https://socy.umd.edu/about-us/using-rosenberg-self-esteem-scale), [PhenX 180901 exact English item order, options and scoring](https://www.phenxtoolkit.org/protocols/view/180901), [UMD FAQ: no universal cutoff](https://socy.umd.edu/about-us/rosenberg-scale-faq). Adult 18+ is a conservative **project** scope; it does not rewrite the broader PhenX age guidance. The current package is an uninstalled `DRAFT`, not a new publication or K12 validation.
- Formal CI requirement: existing `scale_intake_light` selection must verify ordinary declaration boundaries, generated index **244→245**, five real scorer cases, report consumer and stable CodeQL/merge gate for this HEAD. Historical source-only CI cannot substitute for these results. No extra workflow or shared checker changes.

## Next intake queue (not falsely claimed complete)

Existing TSES24/12, UWES9 and BAT-S10 Chinese source-only catalog entries remain in main; private C/S1.0.0, Pnone, R1.0.0 drafts stay independent until their exact bytes, rights and real consumers are verifiable. COPSOQ III medical S1 41+3 source groups stay `CATALOG_ONLY` with 112/133 source alignment flags and all 133 scoring unverified. BAT12 English questionnaire with Chinese teacher report waits for separate #397 shared report-locale gate; #412 frozen-schema runtime fix is shared backend code, not part of this cumulative pure-content PR. Do not merge any current or later cumulative content batch without explicit final instruction.

## Operational boundary

No production DB installation, PUBLIC, task launch, user/organization allocation, schema migration, deployment or new permissions. CI success is source qualification, not scientific evidence, rights clearance for unrelated translations, real usage or deployment.

## B002 — copyright-restricted author wellbeing sources

Original English FS-8, SWLS-5 and SPANE-12 source catalogs were added as CATALOG_ONLY. The author permits credited non-commercial research use (https://eddiener.com/scales/); unrestricted public question copying or commercial digital usage is not established. Original item text is not in Git; only source-specific scoring clues and report plans are recorded, not executable C/S/P/R. Candidate registry 245→248. No database install, PUBLIC, allocation or deployment. All content remains in the same unmerged #413.
