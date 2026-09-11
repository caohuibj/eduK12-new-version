# Scientific Maturity Governance v1

> Approved product principle: 2026-09-11.  
> Notion source: `Scientific Maturity Governance｜Pilot → Research Ready｜2026-09-11`  
> https://app.notion.com/p/3d8d27635a3881d392abc761142c9476?pvs=204

## 1. Two orthogonal axes

```text
Product lifecycle:   DRAFT -> PUBLISHED -> RETIRED
Scientific maturity: PILOT -> RESEARCH_READY -> RESEARCH_GRADE (future)
```

`PUBLISHED + PILOT` and `PUBLISHED + RESEARCH_READY` are both normal, fully usable product states. Scientific maturity changes validation/evidence claims, not runtime capabilities or UX.

`RESEARCH_GRADE` is reserved for a future higher evidence bar; it is not the current content-construction target.

## 2. Platform invariants

1. `PUBLISHED` controls whether new assessments can start; scientific maturity does not.
2. PILOT and RESEARCH_READY use the same Unified Runtime, runner, authoritative scorer, FINAL path, report/history/export and Bundle path.
3. Maturity is exact-identity governance metadata and must not enter per-item save, scorer, FINAL submit or measurement-definition hashing.
4. Missing norms, full validity evidence, invariance, device correction, test-retest or other research evidence do not by themselves block Pilot publication. They are research gaps/limitations/validation targets.
5. RESEARCH_READY is an evidence-based metadata promotion, not a second product edition or feature unlock.
6. A substantive measurement-contract change creates a new exact identity/version that defaults to PILOT; maturity is never inherited automatically.

## 3. Pilot publication versus Research Ready

Pilot publication asks: **can this exact content be used safely, honestly, legally and reliably while producing analyzable data?**

Hard publication concerns are limited to runtime/content correctness, authoritative scoring/golden correctness, legal deployment rights, usable content for the target population, and truthful claims.

Research Ready asks a different question: **is this exact identity sufficiently documented, traceable, research-operational and initially validated for formal research use?**

Research Ready review covers content completeness, rights/provenance completeness, research capture, family-specific initial empirical validation and reproducibility. It does not require a formal norm by definition.

## 4. ResearchPlanV1

Pilot content may carry a lightweight governance-only research plan:

```text
unknowns
validationQuestions
requiredData
plannedAnalyses
upgradeCriteria
knownGaps
evidenceRefs
```

The plan does not pretend the evidence already exists. Its purpose is to ensure Pilot deployment can generate the data required to revise or promote the content.

## 5. Family-specific validation

- **Scale:** item/scale distributions, applicable reliability/validity, population/localization/rights provenance and research data dictionary.
- **Cognitive:** task-specific accuracy/RT distributions, ceiling/floor, practice/fatigue, profile adequacy, device/input sensitivity and applicable reliability/construct relations.
- **Situational:** option distributions, scene discrimination, social desirability, cross-scene consistency, construct contamination and empirical review of provisional scoring/content.
- **Bundle:** component maturity does not determine Bundle maturity. Bundle selection logic, evidence mapping, convergence/divergence interpretation, missing evidence and administration effects require their own validation.

No universal psychometric threshold is imposed across these families.

## 6. Implementation boundary in this PR

- one shared `PILOT | RESEARCH_READY | RESEARCH_GRADE` vocabulary;
- Scale catalog accepts RESEARCH_READY without changing ScaleDefinition/runtime hashes;
- Cognitive exact-identity governance can explicitly promote an identity to RESEARCH_READY while new identities default to PILOT;
- Situational availability is based on `PUBLISHED`, while maturity is resolved separately by exact identity and projected as metadata;
- Bundle receives a governance-only maturity manifest, deliberately outside `AssessmentBundleDefinitionV1` and frozen runtime snapshots;
- existing Bundle `scientificGate` remains a minimum-scientific-correctness publication check; it is not Research Ready certification.

No scorer, CanonicalUnitResult, FINAL protocol, aggregate engine, DB schema or maturity-specific participant UX is introduced.
