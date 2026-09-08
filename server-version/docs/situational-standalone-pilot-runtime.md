# Situational PR-B Standalone Pilot Runtime

## Scope

PR-B delivers one standalone Situational assessment UNIT. The runtime is
authenticated and student-facing, but participant admission is release-state
aware: only `PUBLISHED` packages can be listed or started. Code-owned
development packages may remain `DRAFT` until the PR-C publication/launch gate
is implemented, and `RETIRED` packages cannot start.

The instrument contract is fixed to:

`start → resume → one FINAL submit → authoritative result → CanonicalUnitResult → result/history`

One instrument is one UNIT. Every declared scene is presented (`sampling.strategy`
is `ALL`), and each scene has one to three response channels. There are no
per-scene or per-answer persistence writes.

## Frozen runtime

At start, the registry definition is validated and frozen into an encrypted
`FrozenSituationalRuntimeSnapshotV1`. The snapshot carries:

- `instrumentKey`, `instrumentVersion`, `definitionHash`;
- `compiledRuntimeHash`, `scorerKey`, `scoringVersion`, `frozenAt`;
- the authoritative definition and the runner-only definition slice; and
- the hash-verified `CompiledInstrumentRuntimeV1`.

The runner slice contains text stimuli, prompts, options, and continuous ranges.
It does not expose choice contributions, scored constructs, situation features,
or report/scoring implementation details. Resume and FINAL submit never
recompile from the live registry; they parse the frozen encrypted snapshot and
verify its hash and direct identity columns.

The PR-B capability vector is:

```text
standalone=true
supported=true
embedded=false
aggregateEligible=false
collectionFacts=false
```

## FINAL request and trust boundary

`POST /api/situational/attempts/:attemptId/submit` accepts a `submissionId`,
`attemptEpoch`, frozen definition/runtime identity, and a list of raw response
objects. Each response contains only `sceneKey`, `channelKey`, and
`responseValue`, with optional `responseTimeMs`/`answeredAt`.

The request schema is strict. Client-provided score, contribution, quality,
band, percentile, or other derived fields are rejected. The server checks
ownership/participant binding, attempt epoch, final-only mode, frozen hashes,
scene/channel identity, option membership, continuous inclusive ranges,
duplicate pairs, and required coverage. It then normalizes responses into the
frozen scene order and calls the pure scorer once.

## Durable terminal write

The short `READ COMMITTED` transaction locks the attempt row and atomically:

1. changes `IN_PROGRESS` to `COMPLETED` with the submission fingerprint;
2. writes one encrypted `SituationalRawSubmission` payload; and
3. stores encrypted derived result and canonical result envelopes.

The raw payload is immutable and separate from derived data. The canonical
projection contains metric values, quality facts, provenance, and no raw scene
responses. It is created with `unitType=SITUATIONAL`, `sourceType=ASSESSMENT`,
the attempt id, submission id, definition hash, compiler/runtime hash, scorer
key/version, and a verified `resultHash`.

The partial unique index on instrument/version/participant prevents two active
attempts. The submission id and payload hash make identical FINAL retries
replay-safe; a conflicting retry is rejected. A completed attempt is never
reopened; starting again creates the next `attemptNo`.

## API surface

- `GET /api/situational/instruments`
- `GET /api/situational/instruments/:instrumentKey`
- `POST /api/situational/attempts` with `instrumentKey` and optional version
- `POST /api/situational/:instrumentKey/attempts` start alias
- `GET /api/situational/attempts/:attemptId` resume/read
- `POST /api/situational/attempts/:attemptId/resume`
- `POST /api/situational/attempts/:attemptId/submit`
- `GET /api/situational/attempts/:attemptId/result`
- `GET /api/situational/history`

FINAL admission uses the existing bounded UNIT submit gate. PR-B does not add a
queue, semaphore, per-domain auth framework, second finalizer, or new result
recalculation path.

## Explicit non-goals

PR-B does not add public anonymous recovery, composite/questionnaire embedding,
aggregate collection facts, Matrix Sampling, norms/references, media stimuli,
branching, open text, LLM scoring, adaptive/IRT/Bayesian scoring, telemetry,
research claims, or PR-C publication/launch behavior.
