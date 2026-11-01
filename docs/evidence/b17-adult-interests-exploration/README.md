# B17 成人兴趣与探索方式

The new schema3 content candidate is described in [schema3.md](schema3.md). The record below describes the preserved0.1.0 implementation and its historical limitations.

`adult_interests_exploration_zh_cn@0.1.0` is a new DRAFT declaration, based on main `74423a1c4b40f65c084797434aaa86271594e687`. It reuses two registered adult self-report instruments and adds no leaf questions, scorers, runtime code, UI, tables or publication mechanisms. The exact key was absent from source and generated Bundle registration; the open-PR search for B17 returned no match at preparation time. Nearby constructs do not count as this Bundle.

## Design and sources

The complete internal B17 design and shared implementation specification were read, including tables, through the authorized Drive connector. Private URLs and file metadata are retained only in the task-private handoff. They are not included in this public candidate. The project designs are not validation papers or instrument-license grants. This change contains original Bundle prose; the registered leaf source records remain the authority for item wording, scoring, rights and localization.

| Slot | Exact leaf identity | Scoring / output | Source / language status |
| --- | --- | --- | --- |
| orvis | `orvis92_zh_cn_research@1.0.1` | S1.0.0; 92 items; eight existing 1–5 means; domain counts 12/13/13/14/10/10/10/10 | [Official IPIP ORVIS English form](https://ipip.ori.org/newORVISSurvey.htm); Pozzebon et al. (2010), JPA 92(2), 168–174. Public-domain IPIP content per existing source; independent unvalidated zh-CN working translation. |
| nfc | `ipip_nfc10_zh_cn_research@1.0.0` | S1.0.0; 10 items; `need_for_cognition` sum10–50; original items07–10 reverse | [Official IPIP construct keys](https://www.ipip.ori.org/newSingleConstructsKey.htm). Public-domain IPIP content per existing source; independent unvalidated zh-CN working translation. Other NFC forms and publications are not treated as validation of this exact Chinese 10-item version. |

The compiler's real axis identities are recorded in `validation.json`: CONTENT combines the instrument and scoring versions; PARAMETERS is the existing `none-v1` payload, not a newly invented parameter version. `referencePolicy.type=none` describes the absence of normative/criterion references. Default R1.1.0 is retained for each leaf. Existing optional fun R1.2.0 is not selected or changed. No leaf C/P/R, item keys, reference policy, language, permissions or missingness rules were rewritten.

## Implemented behavior

The core is exactly102 items, adult SELF,18+ (a project conservative scope, not an author age threshold); no5DCR. Nine metrics consume existing canonical leaf scores. ORVIS means pass through unchanged, with no further division or sum-based ordering. NFC stays independent; no combined total, norms, percentiles, IQ, diagnostic, hiring or career-match score.

The report exposes continuous results first, then eight named sections in original domain order with item counts, a separate NFC explanation, and optional low-cost activities, interviews or courses. It asks the adult to choose two directions and revisit actual experience. No online LLM, raw-answer rescore, median split, forced mutually exclusive class or LPA is introduced.

Two non-exclusive, experimental presentation themes use all eight valid ORVIS scores: IN3 when every mean≥4; IN4 when every mean≤2. Their text explicitly distinguishes these project prompts from original-author thresholds and stable types. They do not depend on NFC. Exact4/2 and just-outside values are covered by local checks. Missing NFC retains independent ORVIS results; missing/invalid core scores suppress dependent themes while preserving permitted independent results. Missing, invalid, not_applicable and out-of-range inputs have distinct limitations; zero is not converted to missing, imputed or treated as low interest.

## Explicit design gaps

The existing V1 condition contract compares an evidence value to a constant. It has no evidence-to-evidence comparison, maximum reducer or all-ties selector. IN1 (unique highest) and IN2 (multiple equal maxima) are therefore **not automated in0.1.0**. The design's analysis4/creativity4/NFC38 example keeps all eight means and NFC38, with no fabricated primary direction. Fixed text says to retain equally attractive directions; it does not claim to have identified or classified them. The minimal future capability is a generic, tie-preserving maximum selector over the eight already-scored values. No shared-engine change is included, as the shared specification explicitly permits continuous results plus fixed narrative when an expression is unsupported.

The existing V1 evidence block exposes numeric construct keys and sorts evidence by key; it has no content-level localized metric labels, domain order selector or chart declaration. The eight named narrative sections retain the required domain order/counts. This PR does not claim a new localized interactive interest chart. The minimal presentation gap is localized metric labels and declared ordering in the existing generic renderer; it is separate from this content-only draft.

The education-entry V1 adapter currently projects only conclusion/limitation text and drops numeric evidence from its joint summary (`bundle-product/education-adapter.ts`). A numeric diagram in that entry therefore also needs the existing adapter to carry authorized numeric rows; changing the general Bundle page alone is insufficient.

The missing/invalid/not-applicable checks above are synthetic rule-layer checks, not an end-to-end native result guarantee. V1 SCALE projection propagates whole-instrument quality and does not directly produce `not_applicable`; the report rollup can also mark the whole view unavailable and suppress all conclusions. Partial-result preservation and native applicability-state propagation remain shared-runtime/report gaps for central review. No leaf missingness or scoring policy is changed here.

Publication/installation must continue through existing administrator review. The package is DRAFT and no approval status has been fabricated. It has not been installed in a database, published, merged or deployed.

## Labels and metadata

Existing searchable leaf taxonomy is reused unchanged: `domain:interests_career_exploration`, `construct:activity_preferences`, the eight `construct:orvis_*` tags, adult research, SELF/reflection, not-diagnostic/not-selection, public-domain and working-translation/review-pending tags. NFC retains its existing construct and taxonomy. The Bundle schema has no `classificationTags` field: no unsupported facet was invented and these notes are not claimed as an indexed Bundle tag record.

Bundle descriptive metadata: type=Scale Bundle; theme=adult activity interests and exploration; population=adult18+; respondent=SELF; scenario=voluntary educational/self exploration; content language=zh-CN independent working translation from public English IPIP; translation review/local validation=pending; combination maturity=EXPERIMENTAL; source visibility=public English instruments + non-public project designs. Permissions remain separate from tags; project design access is not an instrument-license grant.

## Validation and CI scope

Use Node24 and the existing backend dependencies. The selected package check and local fixture/score/report checks are recorded in `validation.json`. The new CI smoke fixture contains one102-answer synthetic vector (IDs and choices only, no item text or participant data); there is no full administration/FINAL flow or repeated leaf test suite.

Commands used:

```sh
npm run bundle:manifest:generate
npm run bundle:onboarding:check -- src/modules/assessment-bundle/packages/adult_interests_exploration_zh_cn/0.1.0
npm run bundle:manifest:check
```

The shared registration file is produced only by the existing generator. At final integration, run that generator once over the union of concurrent new package directories; do not replace other packages with this branch's generated snapshot. The existing #494 routing accepts Bundle JSON, its CI fixture, generated registration, and passive engineering evidence here as pure `content`, domain `bundle`. The selected boundary job checks Bundle history, generated registration, and this package's parser/fixture/dependency checks; no full-platform regression, PG lifecycle, performance or restore run is added.

An initial local smoke-fixture authoring script used the wrong response-set property (`id`); it stopped with KeyError before generating the smoke fixture. It was corrected to the actual `key` / `responseSetKey` / `itemCode` contract. No leaf source or runtime was changed. That local authoring error was not a CI failure.


## Current-main index alignment

The only conflict against main7f9b8ec1 was generated/packages.json. Preserve all main source directories and both existing candidate versions0.1.0/0.2.0, then rebuild through the existing main schema3 generator. Generate/check passed14versions; the original12main entries are byte-equivalent after parsing. The previous candidate index omitted0.2.0; both declarations are now registered without rewriting either original report or source. This is source registration only, not installation, professional approval or publication. Subsequent six-package integration must regenerate from the complete source union rather than selecting this single-package index.
