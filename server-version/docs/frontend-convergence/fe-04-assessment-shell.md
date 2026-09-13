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

This prevents Situational branching or Cognitive phase-based tasks from presenting a false completion percentage merely to satisfy a shared component.

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

## Current PR slices

- C1: freeze the presentation contract and progress semantics.
- C2: add the presentation-only `AssessmentShell` and focused tests.
- C3: reattach the Scale reference journey to the shell without moving controller/runtime state.
- C4: exercise the contract against fixed-count, phase and open-path consumers; any domain-specific requirement remains in that domain.

The PR starts as Draft after C1/C2. Scale integration and cross-domain contract checks remain required before Ready.

## Network / persistence impact

C1/C2 add no network request, API contract, IndexedDB schema, answer write, trial write or FINAL behavior. Later Scale integration must remain a pure presentation refactor over FE-03A/03B/03C behavior.

## Rollback

Before domain integration, deleting the new component and docs is sufficient. After Scale integration, rollback may restore the FE-03C presentation markup while keeping the same Scale controller, finalDraftStore, media gates and FINAL behavior.
