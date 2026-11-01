# Six Bundle content alignment

Base main: `7f9b8ec153e93409fc8cdcc10be0331bd95fbf78`. Shared runtime is already merged and unchanged here. This branch preserves all six public candidate histories and only resolves generated registration through the existing generators. No new runtime, schema, CI rule, permission, source scoring or source report version is added.

| Candidate | Existing PR | Content preparation |
| --- | --- | --- |
| B08 emotion beliefs/strategies | #501 | Reuse6d68505b, preserve0.1.0/0.2.0 |
| B09 parenting | #499 | Add required DOB and source-owned Scale START mapping; caregiver/cohabitation true conditions match original applicability |
| B10 bedtime/sleep | #496 | Stable optional enum keys; existing Survey FORM supports Chinese labels; source answers/scoring unchanged |
| B14 online regulation/procrastination | #498 | Reuseac1c0d04, preserve0.1.0/0.2.0 and existing SRLO source |
| B15 working memory | #497 | Required DOB on existing SCALE mapping; frozen whole-package admission applies to all three measurement starts |
| B17 interests | #500 | Only generated conflict; preserve0.1.0/0.2.0 and register the previously omitted0.2.0 |

The generated Bundle registry contains21versions: the original12main entries are unchanged and all9candidate versions are DRAFT. B08/B14/B17 each retain two versions; B09/B10/B15 retain one. Scale generated imports preserve every main source and add only the existing SRLO44 source. Each incremental merge was generated from its actual current source union; no side's old index was selected as the resolution. Final generator check and historical source/smoke-byte retention passed. These are source registrations, not installed or published releases.

## Actual directed checks

Node24.21. Existing shared runtime981a88a7 is identical to the application tree merged into this base. The actual modified B09 and B15 declarations each parsed, passed four existing Bundle fixtures, existing dependency checks, mapping checks and a distinct in-memory admission case. Every bound measurement accepted DOB2008-11 at frozen2026-11 (216months), denied DOB2010-01 or missing DOB despite typed age35. B09 denied missing cohabitation qualification; B15 denied101years. No source scorer/task or original leaf golden was executed.

B10 actual declaration, four existing fixtures, dependencies, existing FORM parser and enum decoder passed one directed case. Chinese labels are separate from yes/no/unsure/prefer_not_to_answer keys in the existing Survey FORM; original Chinese option keys are rejected. Optional omission stays absent. The first harness used an incorrect error-name expectation (CONTEXT_ENUM rather than actual SURVEY_NATIVE_CONTEXT_TYPE); only that one case reran and passed after correcting the harness. The successful B09/B15 cases were not repeated. No permanent test framework or new product test file is included.

## Boundaries and CI

Source package hashes after these fixes: B09cc10a86409b54f80b6cb99d3ef2183ed05133ef045a356ee858fde7dac82585b; B157b708ff0856f579ef4841e8bbca727ec39aea3b09a83f9b3decf0dd600a7d321; B100de17716e4ce29995a65b53cb194d2938babf2206be54ea6ab1076ff266b661a. The prior source C/P/R definitions, scores, thresholds and professional/source-review labels remain unchanged. Typed age is retained only as the original additional report applicability constraint, never a substitute for frozen DOB. Existing frozen DB objects are untouched.

Existing B15 whole-protocol cognitive smoke remains absent; no placeholder trials were fabricated. Cognitive source lifecycle, professional/translation/rights review and installation/publication remain separate. Native auto-generated Bundle context currently displays enum keys; no shared label metadata capability is added. The Survey FORM Chinese-label mapping is available through its existing authoring fields.

Actual scope classification: content=true, scale=true, bundle=true, frontend=false, bundle_runtime=false, platformReasons=[]. The existing content route selects package/registration/history checks. CodeQL=true is expected from B14's existing source wrapper/static registry TypeScript; this does not select platform regression, production image, load or recovery. The coordinating owner subsequently selected existing PR498 as the sole aggregate delivery to avoid six repeated CI runs. All six original content heads are retained ancestors of8adbb2c0; PR498 receives the complete union by ordinary fast-forward, without rewriting other branches. PR498 will run the actual existing content/SAST qualification when Ready; the other five PRs stay Draft until the owner chooses their final disposition. Source publication status remains DRAFT. No duplicate PR is created. No APPROVE, merge, production import or deployment was performed.
