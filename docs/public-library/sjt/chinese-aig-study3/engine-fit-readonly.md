# Read-only engine fit

Conclusion: representable as a DRAFT using existing SINGLE_CHOICE and AUTHOR_KEY_SUM with five independent metrics, without runtime changes. This is static source inspection, not runtime acceptance or publication approval.

Evidence under server-version/backend/src/modules/situational/:
- situation-model-resolver.ts:24–61: AUTHOR_KEY_SUM sums contributions, computes per-metric ranges and returns null for incomplete metrics. Register 8 item pairs per facet, with original 0/1 keys: each range is0–8.
- authoring/template.ts:72–91 supports multiple metrics, opportunities and per-option contributions; :455–484 emits AUTHOR_KEY_SUM and descriptive metrics.
- onboarding/schema.ts publication supports DRAFT; onboarding/instrument-registry.ts:8 excludes DRAFT from registrations.

Use 40 sequential scenes, one single-choice channel and four options each; exactly five source facets; no total metric and no per-option right/wrong feedback. Mark precision NOT_ESTIMATED and maturity PROVISIONAL. Complete-facet guardrail is platform policy, not author-specified missing-data rule. Do not use PROVISIONAL_SCALAR or the legacy scoreSituational path: those average contributions, not the required sums. No schema/runtime/template artifact was changed or instantiated in this work.

## Participant runner/report static inspection

SINGLE_CHOICE renderer in frontend/src/modules/situational/pages/SituationalRunner.tsx:787–803 renders radio labels and selected state only, not key correctness. SituationalReportCard.tsx:95–99 explicitly keeps metrics independent and does not synthesize a total. ReportPrimitives.tsx:74–145 uses percent solely for marker CSS position, while visible/accessible values retain raw range0–8, not a0–100 score. No automatic “higher is better” interpretation was found in these paths.

Important configuration requirement: omit report.narrative. SituationalReportCard.tsx:83 immediately returns the narrative-only view when narrative exists, hiding numeric metrics. The authoring template currently emits narrative; do NOT blindly use that template output. A direct source definition with five descriptive metrics and no narrative uses the existing metric report path. Keep report.interpretations empty or non-evaluative source-bounded explanations. Put the platform report caveats in disclaimer. Do not add correctness/ability feedback or rank the five facets.

## Minimum next-stage DRAFT source and validation plan (not created/registered)

Proposed owned directory: backend/src/modules/situational/instruments/chinese-aig-study3/1.0.0/ . Required files: instrument.json (content identity,40 scenes,5 metrics,AUTHOR_KEY_SUM,160 key contributions, bounded goldenCases), publication.json ({"releaseStatus":"DRAFT"}), scientific.json (honest PILOT/provisional evidence scope and required provenance fields; never fabricate reviewer approval). Schema source: onboarding/schema.ts:14–32. Use schemaVersion1 ALL sampling, one ACTION SINGLE_CHOICE per scene, the original Chinese question and options, and typical-behavior prompt. No should/most-effective ability instruction. No shared runtime changes anticipated.

Next-stage checks only, not run here: exact selected-item digest reuse; source schema validation; AUTHOR_KEY_SUM five boundary/mixed/missing cases; no total/norms/cutoffs assertions; participant runner has no keys/correctness; report projection renders all5 raw0–8 descriptive metrics and disclaimer with no narrative-only hiding; DRAFT absent from published registry. Reuse this content integrity evidence and completed independent source review rather than re-reviewing all40 texts. If browser/report behavior differs from static inspection, stop publication and report the specific gap.
