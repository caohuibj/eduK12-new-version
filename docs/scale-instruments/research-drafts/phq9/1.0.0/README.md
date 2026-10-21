# PHQ-9 Simplified Chinese research materials, version intent 1.0.0

**Unregistered research draft, not an executable instrument or import package.**
No participant data, database install, publication, runtime registration, generator,
CI, merge, or deployment is included. Independent AI text review is not human
review, psychometric validation, a medical safety review or developer endorsement.

## Scope and contents

- `content-draft.json`: licensed English source wording alongside a new Simplified
  Chinese working translation. Nine scored symptoms and the original extra
  unscored functional-difficulty question remain separate. Chinese response
  values explicitly map to numeric 0/1/2/3. Platform instructions never alter
  the original item text. Optional functional-question completion is an explicit
  platform draft choice, not attributed to the original developer.
- `source-and-rights.json`: exact source URLs, attribution, instrument-specific
  reproduction/translation grant and frozen source SHA-256. Original English
  adult-study thresholds are review metadata only; no Chinese classification.
  Journal/manual PDFs, unverified Chinese mirror text and artwork are not copied.
- `scoring-contract.json`: identity sum of nine values, range 0–27, no reverse
  scoring, no imputation, no labels or norms. The all-nine-required-for-a-total
  rule is a conservative platform choice, not an invented official rule.
- `golden-fixtures.json`: synthetic zero/max/ones, arithmetic boundary, each
  missing item, optional functional-answer exclusion and invalid-input cases.
  Missing-array placeholders are not accepted as explicit null responses.
- `report-design.json`: raw score and plain-language boundaries, unconditional
  safety copy and layered report design; not a runtime report implementation.
- `validation.json`: one bounded JSON/math check only. Not application tests,
  runtime integration, source-schema acceptance or clinical validation.

## Real capability gaps: public launch and executable registration blocked

1. `scale-definition.ts` has no independent administration-instructions slot.
   The exact two-week frame, draft notice and unconditional safety guidance must
   be visible before/during answers, including incomplete attempts. Do not append
   them to symptom wording, depend on report availability, or hide them by score.
2. `scaleItemPurposeSchema` permits only CONTENT, ATTENTION_CHECK and
   SOCIAL_DESIRABILITY. Every CONTENT item requires an itemRule and becomes an
   itemScore. There is no genuine UNSCORED purpose. The functional question must
   not be relabelled as attention/social-desirability, given an invented score,
   omitted from the chosen form, or made a required contributor to the sum.
3. Versioned report QC requires `audienceContract.qcReview` with reviewer/time;
   ADULT_SELF with audience=student is supported. Here student denotes the
   technical respondent/subject report audience, not an age limit. Actual
   call-site disclosure, adult-facing wording and report projection remain
   unverified. No reviewer, human approval,
   scientificReview or authorization is invented, and version axes are not
   removed to bypass validation. Registry initialization throws on invalid
   sources, so registering an expected-failure draft would harm other tools.
4. STANDARD instruments cannot use the current rawScoreFeedback contract.
   Do not relabel PHQ-9 as a self-authored instrument to bypass that guard.
5. In-session safety support remains a professional/design review gate. Any
   nonzero item 9 requires professional assessment regardless of other missing
   answers; neither item 9 nor the total gives suicide intent/risk level. Zero
   cannot exclude risk. The page is unmonitored and promises no automatic contact.
6. Human translation review, cognitive debrief, local psychometric evidence,
   adult applicability, privacy/consent/minimization/retention and real deployment
   authorization remain pending. AI text review does not satisfy those gates.
7. Runtime illustrations require an installed raster asset identity, not a local
   SVG or fabricated StoredAsset ID. Draft preview asset remains pending. No
   third-party figure, logo or clinical graphic is reused.

The intended version axes are preserved as materials metadata only. None of
these JSON files claims the `ScaleInstrumentSourceV1` schema. No `instrument.ts`
file belongs here. A later bounded runtime capability change needs its own scope,
review and relevant verification before any executable onboarding.

## Minimal change/verification plan

Materials-only PHQ-9 files → JSON structure, exact frozen source binding and
synthetic arithmetic/rejection contract → local one-shot check → preserve its
output, do not repeat app/CI suites → roughly one minute. This check cannot
prove runner safety, optional-item runtime behavior, human review or diagnosis.
## Clarification: report capabilities and review identity

The report QC schema requires a truthful reviewer, reviewedAt and basis; it does
not itself require human review. An actual AI text review may be recorded as AI,
without suggesting human/clinical approval or psychometric validation.
scientificReview is a separate explicitly human-reviewed scientific maturity
claim and remains absent. Human translation/expert review is recorded as not yet
performed, not misrepresented as a mandatory condition imposed by qcReview.

STANDARD instruments already support descriptive raw-score prose through
report.interpretations with source=score_only. The prohibition on the separate
self-authored rawScoreFeedback feature does not prohibit a legitimate raw-total
report and is not by itself an executable-onboarding blocker.

The actual PHQ-9 constraints remain: independent two-week instructions and
unconditional safety visibility, a genuine unscored optional functional question,
verified respondent report projection/disclosure and adult-facing wording, and
a reviewed support/privacy plan. The existing adult-self technical audience
combination is not a schema blocker; scientific age applicability remains unchanged.
The research translation remains unvalidated and not developer-endorsed. This
clarification changes no items, scoring contract, fixtures or arithmetic results.
