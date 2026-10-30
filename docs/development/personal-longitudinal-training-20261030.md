# Training personal longitudinal continuation

This branch builds on Survey/common candidate `2f8829d64b37d2780e7b8546523a7a2d6d8f1a90`.
Survey PR399 remains Draft; its disclosure repair still requires DOT's independent
disposition. Training does not modify that candidate or qualify it for merge.

## Product behavior

The existing course questionnaire publisher can choose SINGLE or LONGITUDINAL
and select leaf outputs after its existing preflight. T1 freezes the plan in the
same publication transaction. Next-wave creation uses the existing product copy,
including its dedicated conditional/weighted-flow remapping. Tracking IDs stay
stable while the copied item IDs change. Embedded numeric Form keys and their
conditions use the existing exact key remapper. A tracked Scale's original C is
inherited even if the source row is subsequently edited. Original material,
release-state, owner, course and operational-stop checks remain in force.

Fixed Bundles use their own exact-version new-deployment service. They remain
ASSESSMENT_BUNDLE with all required slots; no decomposition or generic Bundle
clone was added. The next deployment uses the same package definition and slot
resources. Selected leaf numbers can be tracked; Profile trends/transitions are
not generated. Observer Bundles and non-self Scale definitions are refused for
this SELF-only feature.

Login students and existing stable anonymous Study participants have separate
read proofs and subject scopes. Public one-off recovery tokens cannot request
a linked change report. Existing Study enrollment consent, current participant,
credential revocation and owner checks are reused; research withdrawal does not
become a new personal-report permission. No extra personal information is collected.

One completed whole parent is selected per configured wave, by actual completedAt
and stable ID, before any metric is projected. An unfinished repeat cannot replace
a completed observation. Numerical missingness is not repaired from older attempts.
The current course/identity checks run on cached reads too. Form NUMBER/SLIDER
responses are raw quantities (`raw`), with their question, bounds/encoding and
conditions frozen; choice/category codes never become continuous scores.

The on-demand “我的变化” entry shares the common chart/projection. It applies
the actual frozen participant/subject ceiling, cognitive standard-vs-research
allowlist, Bundle slot ceiling and feedback opening time. C-only identities are
used; cognitive mode remains explicit while the full report-bearing runtime
config hash is used for own-result integrity, not cross-wave raw comparison.
No AI, push, rescoring, reference selection or historical aggregation runs at FINAL.

## Storage and read bounds

Migration `20261030110000_training_personal_tracking` extends existing composite
and attempt storage: a baseline ID, ordinal, compact tracking binding/plan JSON,
and encrypted append-only projection snapshots. Only T1 owns the plan/source
definitions; later waves store slot bindings to that baseline. Existing content
snapshots retain precise C/P/R provenance. There is no Observation/report table,
permission cache, new queue or account platform. Published associations are immutable.

Reads are bounded to the plan's first 100 waves/128 selected outputs, with a
single latest-parent selection, batched saved unit/Form reads, then per-leaf
frozen disclosure checks. Multiple scores of the same leaf share its accepted
source/result verification; no authorization query is made per score. Snapshots
include selected epochs/results, missing waves, release-time state and current
disclosure eligibility in their identity. Older snapshot keys/bytes are preserved.

## Targeted evidence

Original outputs, failures, screenshots, case titles, byte lengths and SHA256
are retained under `docs/evidence/personal-longitudinal-training-20261030/manifest.json`.
These are local evidence, not formal Ready or CI qualification.

- `pg-corrected`: 2 real PG cases: ordinary course publish→next→actual Scale FINAL
  →single/change reports (including edited original source C); stable anonymous
  Study with genuinely different Study/per-wave credentials, both reports,
  wrong subject/study denial and revoked cached-read denial.
- `bundle-pg-course`: 1 real PG case: a synthetic two-Scale SELF fixed Bundle
  keeps both slots and exact package version while tracking only one leaf,
  publishes/finishes twice and reads single and change reports. This is native
  Bundle routing/leaf qualification, not scientific qualification of WHO-5 or a Profile.
- `form-pg`: 1 real PG case: a typed NUMBER-only questionnaire copies the
  embedded definition, accepts actual FINAL values 0 and 3, preserves its ordinary
  report and projects the raw response change without a psychological scorer.
- `latest-pg-access`: 1 real PG continuation: latest completed whole-parent
  selection, old encrypted snapshot preservation and current course permission
  denial. The first run already completed the real redo and assertions, then
  failed on an invalid fixture membership enum; continuation reused that redo
  and did not allocate another attempt to make a green report.
- `browser-response-fixed`: 1 actual Chromium continuation: native T3 creation
  and publication, real learner answer, ordinary report and change chart. Earlier
  stages retain the created/published T3 and accepted FINAL; continuation opens
  that same completed report instead of replaying publication or answers.
- `disclosure`: 21 direct frozen-disclosure consumer cases, including subject
  rights independent of teacher rights and cognitive research-only exclusion.
- `contract`/`form-contract-corrected`: 2 distinct adapter cases: cognitive C+mode
  ignores report-only hash changes; numeric Form copied keys preserve meaning,
  a changed question changes identity, and category encodings are excluded.
- `ui-scope`: 2 component cases: old-account responses are discarded; anonymous
  Study proof stays separate and a changed proof clears the rendered view.
- `draft-scope`: 1 dependency-free control case for the explicit Training path
  allowlist and refusal of unrelated writes, force-full and Ready qualification.

32 distinct successful cases across these stages; filtered cases are not counted.
Original Survey 31-case evidence and full instrument/cognitive trials were not
replayed. Backend TypeScript and affected frontend lint pass; the current frontend
typecheck is recorded separately. The additive migration was applied only to
the isolated `_test` database. No production migration, seed, permission or release.

## Failures and continuation

All initial failures are retained. The first ordinary PG harness omitted required
metadata and requested a token past the source expiry. Browser harness fixes
covered hidden editor steps and the existing runner's button (rather than radio)
controls. A wrong relative script path caused an unchanged attempt and a port
conflict; these are unqualified tooling failures, not application passes. The
browser then found a real new-route envelope error (missing standard message),
fixed by using the existing response helper. The Bundle fixture initially used
an invalid key, age-limited template without required context, then an invalid
population enum; native guards were retained, and the explicitly synthetic
fixture uses an unspecified population. Native Bundle delivery stores its course
on the publication, so the change reader was corrected to reuse that actual
course location. Form contract fixture metadata and the membership enum were
also corrected without widening production validation. No failure history is reset.

## CI and remaining scope

The existing bounded personal-tracking Draft allowlist now includes these exact
Training sources/tests/migration/evidence. It uses the existing compile/type jobs;
Ready/migration/security gates are unchanged. A stacked Draft PR based on PR399
does not match the workflow's main-only base trigger. There is no claim of official
Training CI success, native dump/restore qualification, SAST or Ready acceptance.
Retargeting/qualification waits for the reviewed base; no blanket full run is started.

School student SELF and Teacher teacher SELF remain the next separate batch.
Training cognitive/SJT leaf adapters use existing accepted canonical results;
their full native trial journeys were not replayed here. The Bundle picker has
static SJT metadata; an author-only SJT source without that metadata is a specific
picker gap, not a new runner to be built. Tool-specific longitudinal narrative is
phase two. Cross-version equating, observer reports and categorical Form trends
are outside this personal phase.
