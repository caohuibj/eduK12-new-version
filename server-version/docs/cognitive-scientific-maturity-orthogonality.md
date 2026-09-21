# Cognitive Scientific Maturity Orthogonality

## Purpose

Cognitive product release and scientific maturity are separate governance axes.

- Product release answers whether an exact `CognitiveTestConfig` may be used for new product activity.
- Scientific maturity answers how much evidence supports the scientific claim for an exact Cognitive protocol/scorer identity.

Neither axis derives the other.

## Product release

Authoritative source: `CognitiveTestConfig.status`.

Lifecycle:

```text
DRAFT -> PUBLISHED -> RETIRED
```

Product Readiness is only the technical gate for an explicit publish action. A readiness PASS does not publish a config automatically.

## Scientific maturity

Authoritative Cognitive source:

```text
COGNITIVE_SCIENTIFIC_MATURITY_BY_IDENTITY
```

Identity key:

```text
testType / engineVersion / scoringVersion
```

Levels:

```text
PILOT -> RESEARCH_READY -> RESEARCH_GRADE
```

An identity missing from the maturity registry is `PILOT` by default. A new engine/scoring identity never inherits the maturity of an older identity.

The historical `RESEARCH_READY_IDENTITIES`, `RESEARCH_GRADE_IDENTITIES`, and catalog `resolveScientificStatus` exports are compatibility views only. They own no independent maturity state and delegate to the authoritative exact-identity registry.

## Scientific qualification

`evaluateScientificQualification()` consumes evidence facts only:

- research foundation;
- traceable provenance;
- empirical reference evidence;
- formal research output.

It must not consume:

- Product Readiness;
- release status;
- `CognitiveTestConfig.status`;
- runtime capability;
- publication compatibility metadata.

`PILOT` is the default lowest evidence maturity. It is not a synonym for incomplete software.

## Legal state combinations

All combinations of product release and maturity are conceptually valid governance states:

| Product status | Scientific maturity | New product use |
| --- | --- | --- |
| DRAFT | PILOT | no |
| DRAFT | RESEARCH_READY | no |
| DRAFT | RESEARCH_GRADE | no |
| PUBLISHED | PILOT | yes |
| PUBLISHED | RESEARCH_READY | yes |
| PUBLISHED | RESEARCH_GRADE | yes |
| RETIRED | PILOT | no new use |
| RETIRED | RESEARCH_READY | no new use |
| RETIRED | RESEARCH_GRADE | no new use |

Historical frozen attempts/results remain readable according to existing lifecycle rules.

## Promotion invariant

Changing scientific maturity for the same exact identity must not change:

- TaskDefinition content;
- config JSON;
- protocol;
- scorer key/version;
- scoring version;
- source definition hash;
- compiled runtime hash;
- metric/quality definitions;
- report computational definition;
- FINAL behavior;
- assignment availability;
- product release status.

If any of those change as a consequence of maturity promotion, the implementation is incorrect.

## Cross-family rule

Scale, Cognitive, and Situational share the scientific qualification evaluator. Their adapters may supply family-specific evidence facts, but product release lifecycle semantics remain family-owned and are not modified by scientific qualification.
