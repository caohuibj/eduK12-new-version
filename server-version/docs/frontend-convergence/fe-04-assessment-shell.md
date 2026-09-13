# FE-04 — Assessment UX Contract + AssessmentShell v1

Base: `main@c6cf8337780ee714db2cbd99a2c04b1e932852eb` (PR #101 / FE-03C merged).

## Goal

Extract only the presentation contract proven by the FE-03C Scale reference journey and needed by Cognitive, Situational and Form migrations. `AssessmentShell` is not a Runtime, controller, API client, draft store or FINAL state machine.

## Shell-owned presentation inputs

- `title`, optional eyebrow and instructions
- estimated duration display
- progress presentation
- local save status
- submission/reconciliation status
- recovery status
- interaction readiness
- domain content, action and navigation slots

## Progress contract

The shell supports four explicit progress forms:

1. `count`: completed / total, with a real denominator and progressbar.
2. `position`: current / total, with a real denominator and progressbar.
3. `phase`: named phase/stage only; no synthetic percentage.
4. `open-path`: visited steps + optional current label; no synthetic denominator or percentage.

This prevents Situational branching or Cognitive phase-based tasks from presenting a false completion percentage merely to satisfy a shared component. Parent Bundle progress remains a separate parent concern; child players do not synthesize a second denominator from parent state.

## Domain ownership retained

The shell must not own or import:

- answers or response arrays
- Cognitive trials, timers, randomization or task reducers
- Situational trajectory / reachability / branch pruning
- Form field state
- draft persistence or IndexedDB transactions
- media completion calculation
- API clients or endpoint selection
- submission IDs, sealed payload construction or FINAL request bodies
- scoring, report projection or Bundle orchestration

Domains translate their existing state into the shell's finite presentation statuses.

## Status semantics

Local save, interaction readiness, recovery and submission are separate axes. In particular:

- `saved` means local persistence succeeded; it does not mean FINAL committed.
- `submitting` means the already-defined logical submission is in flight.
- `reconciling` means the client is reading terminal state after an ambiguous response.
- `pending` means terminal state remains unknown; answers stay locked and the same logical submission is retained.
- `committed` means the authoritative server result exists.

Submission states may supply a domain-specific presentation title (for example Scale's existing “提交内容已封存”) without changing the finite submission state or adding domain logic to the shell.

## Implemented PR slices

- C1: froze the presentation contract and explicit progress semantics.
- C2: added the presentation-only `AssessmentShell` and focused contract tests.
- C3: reattached the FE-03C Scale reference journey to the shell. Scale still owns answer state, response timing, media gates, local persistence, sealed FINAL construction, retries, terminal reconciliation and route navigation.
- C4: exercised `count`, `position`, `phase` and `open-path` presentation forms. `phase` and `open-path` intentionally have no progressbar; no fake denominator is manufactured for later Cognitive/Situational consumers.

FE-04 does not migrate Cognitive, Situational or Form. Those remain FE-07A, FE-06 and FE-08 respectively and will map their domain-owned state into this contract only when each domain is migrated.

## Scale mapping

The reference Scale journey maps only presentation facts:

| Scale-owned fact | Shell projection |
|---|---|
| `answeredCount / items.length` | `progress.kind = count` |
| current local answer write | `saveStatus = saving` |
| durable local answer exists | `saveStatus = saved` |
| sealed / legacy pending FINAL | `submissionStatus = pending` |
| active FINAL request | `submissionStatus = submitting` |
| frozen identity/version conflict | `recoveryState = blocked` |
| question/media/answer controls | child content slot |
| previous/next/FINAL controls | actions slot |
| numbered item navigation | navigation slot |

The Shell never reads `answers`, draft metadata, video completion metadata or API responses itself.

## Network / persistence impact

FE-04 adds no network request, API contract, IndexedDB schema, answer write, trial write, media-progress write or FINAL behavior. The Scale integration is a presentation refactor over merged FE-03A/03B/03C behavior. Existing FINAL_ONLY and LEGACY request paths remain unchanged.

## Compatibility / rollback

No stored data, frozen runtime identity or server result changes. Existing drafts and in-progress attempts therefore remain compatible.

Rollback may restore the FE-03C Scale presentation markup while keeping the same Scale controller, `finalDraftStore`, media gates and FINAL behavior. Removing `AssessmentShell` does not require a data migration or attempt restart.
