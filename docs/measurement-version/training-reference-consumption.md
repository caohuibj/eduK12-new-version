# Training frozen reference consumption

## Boundary and compatibility

The questionnaire owner explicitly chooses published references for exact saved
measurement items. `POST /questionnaire-products/:id/content-reference-selection`
uses the existing draft revision CAS and accepts only item IDs, release IDs,
entry keys and integer priorities. The server verifies scope, content identity,
measurement compatibility and lifecycle, and derives the authoritative hashes.
Passing `selection: null` clears the draft selection; no references are selected
by default.

`GET /questionnaire-products/:id/content-reference-choices` is an owner-authorized
listing over the current saved measurement items. Each unit includes compatible
published reference choices and private report choices. The reference DTO exposes
release/version, entry key, metric/kind, population and limitations, never source
sample IDs or the source manifest. The UI does not require teachers to invent
hashes. Report selection continues to use its independent revision-CAS endpoint.

Private references remain confined to the exact Training owner and course.
Reuse by another composite is explicit and requires the original producer's
immutable PUBLISH receipt to match release, candidate, review, actor and source
composite. The source must retain its published identity and actual course;
the target must be a non-public COURSE questionnaire whose entire delivery set
is the one source course. Draft selection and publication require DRAFT status;
START rechecks the published target. Foreign owners, additional courses and
GENERAL/public delivery are rejected. Scope checks project metadata only, never
candidate samples. The source release and provenance remain unchanged, and no
published questionnaire is reopened. Contended secondary scope locks use NOWAIT
and return an explicit retry conflict with transaction rollback rather than
waiting in reverse parent-lock order.
PLATFORM references require the formal resolver's immutable reviewed publication,
not merely a PLATFORM label or a reviewer grant. This grants use of published
aggregate content only, never access to the original private measurement or
sample. Explicit reinterpretation retains its original measurement/data-scope
checks, and uses the same formal-reference eligibility boundary.

## Publication and the actual START boundary

Publication freezes the exact candidate release/hash/entry/metric/kind/priority
and `EXACT_POPULATION_PRIORITY_V1` policy in the content snapshot. New publications
cannot silently join that set. A participant's choice is frozen separately in
`training_reference_binding`, tied to attempt, epoch, original content-binding
hash and authentic demographic-context hash.

The actual default context-bearing call chain is:

1. `submitCompositeFormSectionFinal` dispatches `UNIFIED_V1` to
   `submitUnifiedCompositeFormSectionFinal`.
2. Its original transaction persists the normalized context answers, performs
   the parent context CAS, reloads the narrow authoritative reference/context
   projection, and calls `freezeTrainingReferenceBinding`.
3. Only then can the same transaction mark the form section complete and insert
   its canonical snapshot. Runner delivery is therefore after the reference
   binding commits, never the first measurement-answer submission.

The older non-UNIFIED FINAL_ONLY branch separately calls
`freezeCompositeAttemptContext`, whose authentic context and reference binding
also share the submission transaction. An earlier implementation description
mistook that older branch for the default dispatcher; the default branch now has
its own tested hook rather than relying on that claim.

For questionnaires without a context section, `createAttempt` freezes the policy
against the truthful empty context before child creation. Missing demographic
fields yield `UNAVAILABLE/MISSING_CONTEXT`; no demographic values are invented.
Repeated context submissions and resumed attempts decode the stored binding
without selecting again or consulting newly published candidates.

The additive database guard prevents replacing a frozen binding, changing its
context, attaching choices outside the publication, or backfilling completed
history. A failed context transaction must roll back both context and binding.

Context/write and runner-entry coverage:

- Composite context writes exist in the older context service and the unified
  form submission service; both now freeze references in the original transaction.
- Questionnaire-only context writes target a different parent model and do not
  consume Training composite bindings. Bundle context construction is a pure
  state builder, not another composite database writer.
- Scale admission, Cognitive admission/session/media, embedded and owned SJT
  runtime/media/FINAL converge on `assertTrainingChildSelected`. Its read-only
  reference-ready guard refuses a published policy without a frozen binding,
  including direct child access before the context section completes. Forms use
  the separate section guard and remain available to collect context.
- Existing parent reads carry two hash markers; ready and no-content paths add
  no query. Older content with no policy, or an incomplete projection, needs one
  bounded request-local metadata probe. The probe does not select references or
  read source samples. Frozen bindings remain unchanged on resume.

## FINAL, reports and historical receipts

FINAL reuses verified canonical facts and the shared interpreter. It does not
score again. The saved selected reference set is the only set interpreted. The
existing raw result/storage/export path is unchanged; explicit reinterpretation
exports remain separate.

Old snapshots have no injected optional defaults, so old canonical hashes remain
stable. Old receipts remain strict schema version 1 with empty references. New
receipts use schema version 2 and bind the independent reference-binding hash.
Staff reports consume saved reference facts without reselecting or reinterpreting.
Each read also applies the exact accepted child's frozen numeric/reference
disclosure. Template metric declarations and a researcher audience label cannot
expand access. A disallowed template is unavailable, and historical receipt
ciphertext/hash remain unchanged.
Current revoked-reference notices are separate from frozen historical bytes, and
withdrawn bands are not rendered as current. Optional report rendering happens
on the authorized read path, not during raw FINAL persistence; identity mismatch
remains a hard rejection.

Static SJT source licenses are rechecked at database time after publication
selection waits and after all attempt child/material/slot writes, immediately
before returning the transaction. This closes elapsed expiry during lock waits;
the fence accepts only a transaction-local validated source receipt and does not
recompile or score.

## Focused evidence and limits

Focused backend tests cover exact candidate binding, private/formal eligibility,
trusted listing, draft revision/owner checks, missing context, immutable replay,
context-free selection, V1 compatibility, V2 FINAL and report consumption,
lifecycle suppression, forged identities and the late Static SJT expiry fence.
The context service tests call the real context crypto and binding helper, but
their rollback wrapper is structural test evidence, not PostgreSQL rollback
evidence.

At this step, 75 cases across reference consumption, context, questionnaire
selection and reinterpretation passed in serial focused runs. The separate late
expiry test passed. The subsequent same-course reuse change passed 23 selected
contracts, including 17 new scope/locking cases and an explicit publication-to-START
reuse case; the staff disclosure boundary passed 14 selected report contracts.
The corrected UNIFIED context entry and common direct-runner readiness boundary
passed 47 affected contracts, including five calls to the actual unified submit
function with the real context crypto/reference freezer.
These are overlapping focused runs, not an asserted deduplicated total.
Previously passing unchanged legacy binding/final/report
cases were not repeated. Database migration/transaction rollback, connected HTTP
and final generated-client type checks are separate acceptance work; this
document does not claim their completion. No production, real grant, push, CI or
stress operation was performed.
