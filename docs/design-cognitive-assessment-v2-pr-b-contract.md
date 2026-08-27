# Cognitive Assessment v2 Foundation — PR-B Contract

Status: initial implementation contract for `feat/cognitive-assessment-v2-foundation`.

## Baseline and ownership

PR-B starts from the locally merged PR-A commit `400b94a` on `main`.

PR-A owns the shared Assessment Reference Core and the parent-scoped Assessment Context v1. PR-B consumes those contracts; it must not create a second reference system, a demographic profile table, or a task-local copy of raw context fields.

For a composite assessment, cognitive results may retain only:

```text
assessmentContext: { schemaVersion: 1, snapshotHash: string } | null
```

The raw context snapshot remains encrypted and parent-scoped. Standalone cognitive tasks use a null context snapshot.

## Frozen product boundaries

- Do not add new cognitive tasks in PR-B.
- Do not introduce cross-task composite scores or a unified 0–100 cognitive index.
- Keep research-complete internal data separate from the user-facing projection.
- A published task must have a complete, versioned protocol, scorer, metrics, quality definition, references, report definition, and publication validation result.
- A task without an applicable reference may remain Published, but its report must say that no eligible reference was available and must not imply a normative comparison.

## Runtime contract

Each cognitive task is represented by a versioned definition containing:

```text
TaskDefinition
  identity
  ProtocolDefinition
  TrialEnvelope schema
  authoritative scorer
  MetricDefinition[]
  QualityDefinition[]
  reference mappings
  ReportDefinition
  publication metadata
```

The protocol signature is a canonical SHA-256 digest of measurement-critical protocol fields. A session stores the resolved protocol and config snapshot plus the signature before its first trial. Every stored trial uses the versioned TrialEnvelope; expected answers and correctness labels are never accepted from the client as authoritative inputs.

The scorer is deterministic and pure with respect to its input snapshot: no database access, network access, current time, or hidden randomness. It produces metric values, quality outcomes, reference applicability, interpretation data, and a report projection from the frozen session/trial inputs.

Metrics declare category, direction, visibility, and report role. Visibility is explicit (`headline`, `user`, `detail`, `research_only`, or `hidden`); direction is explicit (`higher_is_better`, `lower_is_better`, `target_range`, or `descriptive`).

Quality has exactly three user-relevant outcomes:

```text
interpretable | limited | invalid
```

Limited results may retain quantitative values internally but do not receive an unqualified normative interpretation. Invalid results do not receive reference comparison or performance conclusions.

## Context and reference integration

For composite attempts, the backend must ensure the parent context is frozen before the first cognitive trial and persist only its snapshot hash in the cognitive result. Reference matching uses the frozen age in months and the available grade, sex, language, and region fields. Missing, out-of-population, or ambiguous context yields an explicit unavailable reason; the resolver must not silently choose a nearest or arbitrary population.

Reference applicability is metric-specific and direction-aware. Reported literature values retain reported provenance; derived beta estimates and percentiles are labeled as estimates. Reaction-time normalization is allowed only where the metric definition explicitly authorizes it.

## Migration and verification scope

All existing cognitive definitions are brought under the v2 contract: the 9 Published definitions and approximately 15 Draft definitions. This is a direct upgrade of the current test data; no new task is introduced and no legacy compatibility layer is required.

The implementation must include:

- golden fixtures for every Published task and contract smoke fixtures for every Draft task;
- negative tests for protocol drift, malformed envelopes, client-supplied scoring fields, missing/ambiguous context, invalid quality, and inapplicable references;
- a publication gate that validates definitions before Published status is accepted;
- `cognitive:audit` covering registry completeness, protocol signatures, scorer coverage, reference mappings, report visibility, and publication invariants;
- representative standalone and composite E2E coverage, including logged-in and anonymous context freeze paths;
- backend, frontend, database, Docker, and audit checks as the PR merge gate.

## Implementation sequence

1. Add the shared cognitive v2 contracts and canonical protocol-signature utility.
2. Add the TrialEnvelope/session snapshot and authoritative scorer result boundary.
3. Add metric/quality/report definitions and the metric-specific reference adapter using PR-A's shared core.
4. Migrate all existing task registry entries and persist the v2 result snapshot without changing task inventory.
5. Add publication validation, audit output, fixtures, negative tests, and representative E2E coverage.
6. Verify the merged-main baseline, run the complete gate, and document any explicitly deferred non-blocking work.

The PR remains Draft until the contract, migration, audit, and representative end-to-end gates are all green.
