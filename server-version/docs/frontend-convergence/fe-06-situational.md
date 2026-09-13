# FE-06 — Situational Migration

Base: `main@2ea5a4c2634e3ef871b5663f27a59ef5951040a6` (PR #103 / FE-05 merged).

## Scope

FE-06 migrates the existing Situational runtime surface onto the shared Assessment UX contract. It does not replace the Situational runtime, frozen traversal model, scorer, FINAL protocol, Bundle parent orchestration, or report science.

Touched runtime routes:

- `/student/situational/:instrumentKey`
- `/student/composite/situational/:attemptId`
- `/public/composite/situational/:attemptId`

The standalone result/report surface remains owned by FE-05 ReportShell.

## State ownership

`AssessmentShell` remains presentation-only. Situational domain state stays in the existing controller and stores:

- frozen instrument/runtime identity comes from the server attempt;
- reachable V2 trajectory is derived from the frozen graph plus raw answers;
- local raw answers and submission seal stay in `finalDraftStore`;
- Bundle parent/public context is route/access context only;
- FINAL remains one sealed payload followed by server terminal reconciliation when needed.

`runner-context.ts` isolates public/authenticated parent routing, return targets, and public recovery-token lookup from traversal and answer state. A parent route cannot mutate the child scientific runtime state.

## Progress contract

Linear V1 instruments expose a fixed scene position (`current / fixed total`).

Branching V2 instruments expose an open-path progress surface using the current frozen round/step/scene. They intentionally do not render a percentage with a denominator that can change when a branch changes.

The page title is the frozen current scene title. FE-06 does not query a newer content catalog to invent a historical display name, and it removes the previous hard-coded assumption that every Situational instrument is text-only.

## Media contract

IMAGE and COMIC continue through the shared assessment-media adapters.

VIDEO now uses the FE-03B required-viewing policy:

- 1× continuous full viewing is required before response controls or FINAL are enabled;
- seeking, playback-rate changes, incomplete refresh/reload, or visibility interruption remain fail-closed in `AssessmentVideoPlayer`;
- completion is local durable metadata, not a server progress write;
- identity is draft/attempt + frozen slot + asset id + content hash + viewing-policy version;
- V2 uses the flow node key as the slot identity, so repeated/multi-round use of the same scene/media cannot share completion accidentally;
- V1 uses the scene key as the stable slot identity;
- an already-completed identical frozen slot may unlock from its durable marker without waiting for a fresh capability fetch;
- playback `currentTime`, heartbeat, watch percentage, and player telemetry are never added to FINAL.

## Local answer ordering and pruning

Situational remains client-side draft + one FINAL. FE-06 adds a per-runner serialized local write queue:

1. each raw response is queued in user-event order;
2. the write is persisted to `finalDraftStore`;
3. branch reachability/pruning is recalculated against the latest confirmed local response map;
4. stale answers outside the newly reachable trajectory are deleted;
5. the next queued edit then applies to that newest state.

This prevents a slow earlier IndexedDB write from overwriting a later slider/choice edit or reintroducing stale branch answers. It does not create server-side per-answer writes.

Navigation and FINAL wait for pending local writes. Response controls remain usable while writes are queued so touch/slider bursts are serialized rather than silently dropped.

## FINAL and recovery

The authoritative submission flow is unchanged:

- validate the currently reachable required path;
- seal one local snapshot;
- submit the frozen payload;
- on ambiguous network failure, query the authoritative server result first;
- if the server is complete, continue to the result/Bundle parent without generating another logical FINAL;
- otherwise retain the sealed payload and retry/reconcile that same submission identity.

Authenticated and public Bundle children return to their existing parent route. Public recovery credentials remain session-scoped route context and are not copied into answer or FINAL payloads.

## Network / persistence impact

- 0 new server answer writes
- 0 new media progress/heartbeat writes
- 0 database schema changes
- 0 scorer or CanonicalUnitResult changes
- existing media capability fetches remain unchanged
- existing one-FINAL submission and result-reconciliation calls remain unchanged
- local `finalDraftStore` metadata reuses the FE-03B required-video completion contract

## Regression focus

FE-06 coverage must prove:

- fixed V1 scene progress and V2 open-path progress;
- rapid local edits preserve the newest value;
- branch changes prune stale answers before FINAL;
- optional diagnostic answers remain optional but are retained as raw evidence when answered;
- required VIDEO metadata readiness alone does not unlock responses;
- durable completion is reusable only for the same frozen slot/media identity;
- incomplete refresh/reload remains blocked;
- standalone and authenticated/public Bundle returns preserve one FINAL;
- ambiguous submission response loss reconciles to the existing authoritative terminal result.

## Rollback

The migration is presentation/local-ordering/media-gate only. Rollback restores the previous Situational page frame and media readiness adapter while retaining the same server attempt identity, frozen traversal, stored drafts, FINAL payload contract, and result records. No database or runtime migration is required.
