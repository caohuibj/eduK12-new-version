# School SELF Scale longitudinal slice

This dependent slice extends PR409 Teacher education tracking with a real School
SELF single-Scale path. It does not declare all four-entry tool families complete.
Source implementation checkpoint: b2722b3084df3157cb96e29fc7e9798842ddb084, based
on Teacher2160f195f67b211cc62ab8eda1ecf3f698927900. Survey PR399 now separately has
successful formal qualification at eba0e3928; no merge or deployment was executed.

## Behavior

An authorized private Scale author explicitly selects a subset of the source's
existing numeric SELF feedback keys in the shared editor. The optional declaration
is saved into a new fixed version; absent old declarations stay absent, and old
private/library policies retain empty longitudinal keys. Completion-only/observer
sources gain no metrics. Library policy projection honors explicit new-version
keys. Existing registered Teacher grants retain their old defaults; explicit new
version restrictions are honored. Generic participant SELF remains valid for an
explicit ADULT_SELF Teacher audience; expert/observer declarations cannot acquire
SELF longitudinal metrics.

School original publication freezes the selected exact Scale metric plan in the
existing Run transaction. Next-wave uses native activity/Run creation and existing
allocation/source use checks, with one atomic transaction and idempotent request.
It produces a new DRAFT with its own submit/open/publication lifecycle, never
copies consent or opens an activity automatically. Fixed tracked source is reused;
original source/author/current roster checks are preserved. Current roster refusal
is conservative: a departed source member can stop auto-inheritance rather than
silently inviting a whole class; cohort-adjustment handling remains follow-up.

The shared education projection isolates School STUDENT and Teacher SELF roles,
product membership, organization, episode and current REPORT_READ gates. It uses
canonical leaf results, latest completed whole parents and encrypted append-only
snapshots already introduced in PR409. Private sources use the original private
runtime lane, not the public registered-resource resolver. Repeated source policy
reads are deduplicated within one request. Shared UI preserves Teacher defaults;
School exposes native next-wave/publish and independent student changes.

## Validation and original failures

Nine distinct selected local case names passed across preserved stages: source
schema2, actual source-policy default/subset1, existing adult declaration1, native
School publication/answers/dual reports/identity1, retained School/Teacher entry
isolation1, affected Teacher retained consumer1, completion UI1 and browser1.
Backend/frontend types and affected frontend lint passed at their recorded stages
(4 existing hook warnings). Exact final-input limits are in the evidence manifest;
intermediate missing contemporaneous source tables are not backfilled or signed.

Initial test setup errors (config path, synthetic eligibility key, private-source
resolver lane) remain raw. PG native success actually publishes T1/T2 and saves
both answers, checks authorized single feedback and changes [1,2], wrong actor,
current report denial even with cache, restoration of that permission and stable
cached response. No fake execution/FINAL rows or new schema migrations.

Chromium uses actual School cookie JWT and CSRF and the real activity manager,
student task/runner/feedback/changes components. T3 creation is retained from the
first click; subsequent invocation opens/previews/publishes the same activity and
starts its real attempt. The reusable private fixture contains only decorative
asset metadata, so that stage correctly blocks answers. A continuation fulfils
only its synthetic decoration byte endpoints, saves real Scale FINAL, then finds
an actual duplicate-key feedback regression. The new changes sibling now has a
separate key; the targeted completion consumer and final same-T3 browser confirm
one feedback and one changes entry, actual [1,2,1] and T2→T3 -1 points. No repeated
publication/attempt/submission. Media delivery is explicitly outside acceptance.

All raw failures/filtered rows, HTTP paths/statuses, screenshots, original reporters
and final source blobs are indexed in
[manifest](../evidence/personal-longitudinal-school-20261030/manifest.json).
No previous31/32/5, full cognition/scale formulas or platform baseline were rerun.

## Remaining boundaries

This slice proves the School private fixed SELF Scale path. Library source policy
wiring is present, without claiming a separate completed library journey. School
ordinary composites/fixed Bundles and actual Cognitive/SJT/numeric Form adapters
remain engineering work; existing completion-only Forms remain completion-only.
No Profile trends, student evaluation of teachers or expert consensus was added.
The new School source/version capability is not blocked on another scientific
approval. No global COURSE_ANALYSIS flag, new report/Observation table, cache or
queue was introduced.

Formal dependent qualification awaits the normal preceding PR399→406→409 base
sequence and exact-source review. No workflow was added for stacked PRs and no
local PASS is labelled formal CI. Keep this slice Draft for independent review.
