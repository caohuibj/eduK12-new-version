# Cognitive Product Release Lifecycle

## Authority

`CognitiveTestConfig.status` is the single authoritative product lifecycle state:

- `DRAFT`: implementation/config may continue to change; cannot be used for new assignments.
- `PUBLISHED`: eligible for normal product creation/assignment flows; core config is immutable.
- `RETIRED`: cannot be used for new assignments or grants; historical sessions/results remain readable.

Allowed transitions are only:

```text
DRAFT -> PUBLISHED -> RETIRED
```

A protocol/scorer/config change after publication requires a new version rather than a reverse transition.

## Product Readiness is not a release decision

`evaluateCognitiveProductReadiness()` is a generic technical gate. It validates the exact task contract/runtime and, when an exact DB config is supplied, validates that config plus the `standard` and `research` profile patches.

A readiness PASS never changes `CognitiveTestConfig.status`. Publication is an explicit Admin governance action through the generic lifecycle service/API.

## TaskDefinition compatibility metadata

`TaskDefinition.publication` remains temporarily for legacy audits/fixtures only. It is deprecated and non-authoritative. Assignment selection, MaterialGrant, Composite availability, publish/retire transitions and other product release paths must not use it.

The compatibility projection may be removed after downstream fixtures no longer consume it. New Cognitive tests must not add task-specific publication logic or allowlists.

## Scientific maturity

Product Release and Scientific Maturity are separate concerns. Product Readiness and release transitions must not inspect `PILOT`, `RESEARCH_READY`, or `RESEARCH_GRADE`.

Scientific maturity orthogonality is handled separately; changing maturity must not change product release state.
