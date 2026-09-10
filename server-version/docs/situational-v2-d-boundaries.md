# SIT-V2-D Diagnostic & Multi-round boundaries

## Scope

SIT-V2-D extends the existing Situational V2 branching DAG with explicit diagnostic and channel policy semantics while preserving ONE UNIT / ONE FINAL.

## Frozen V2 policy

A SCENE flow node may declare:

- `interactionRole: DECISION | DIAGNOSTIC`
- `channelPolicies[].measurementRole: SCORED | ROUTING_ONLY`
- `channelPolicies[].required: boolean`

Omitted channel policy preserves V2-C behavior: `SCORED + required`.

`DIAGNOSTIC` nodes are publication-gated to `NEXT`; they cannot drive a branch. A channel that drives a `DECISION` transition must be required.

`ROUTING_ONLY` responses remain valid frozen/raw evidence but are removed from the scientific scoring projection. They cannot retain choice scoring contributions.

## Multi-round

`motherSceneKey`, `roundKey`, and `stepKey` remain immutable content structure metadata. They are not server state, transaction boundaries, or durable progress cursors.

Traversal remains:

`frozen graph + local/raw responses -> deterministic reachable trajectory`

There is no per-round submit or per-step database write.

## Optional diagnostics

Only required reachable channels block traversal and FINAL. Optional reachable answers, when supplied, remain in the normalized encrypted raw submission. Client progress counts required channels only; optional channels are labeled as optional.

## Scoring

The existing V1 Situational scorer is unchanged. V2-D projects only reachable `SCORED` channels and their choice contributions into the existing scientific scoring plane.

## Explicit non-goals

- Prisma migration: 0
- Unified FINAL schema change: 0
- CanonicalUnitResult change: 0
- Bundle finalizer change: 0
- server active-node/round cursor: 0
- per-step/per-round durable write: 0
- new scorer: 0
- generic rule/expression engine: 0
- workflow/queue/state-machine layer: 0

## Gate coverage

Backend tests cover explicit decision/diagnostic validation, optional requiredness, routing-only raw/scoring separation, multi-round trajectory, and existing snapshot envelope compatibility.

Frontend tests cover optional traversal/progress/FINAL readiness, optional raw retention, cross-round downstream pruning after an upstream branch change, and V1 required-all regression.
