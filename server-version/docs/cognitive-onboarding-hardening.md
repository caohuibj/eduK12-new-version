# Cognitive Onboarding Hardening

## Purpose

This change hardens future Cognitive content onboarding without changing runtime, scoring, protocol, scientific maturity, or current product release state.

The release architecture remains:

```text
Task implementation
  -> generic Product Readiness
  -> explicit DRAFT -> PUBLISHED transition
```

Scientific maturity remains independent:

```text
PILOT -> RESEARCH_READY -> RESEARCH_GRADE
```

## Gates added by this PR

### 1. Inventory-agnostic V2 audit

`auditCognitiveV2Registry()` no longer expects a fixed number of exact RegistryEntry identities. It validates structural parity instead:

- every TaskDefinition must have an exact RegistryEntry;
- every RegistryEntry must appear in the V2 definitions;
- registry and definition cardinality must match;
- duplicate exact identities still fail.

Adding the next Cognitive identity therefore does not require editing a hard-coded inventory count.

### 2. Explicit compatibility naming

V2 `publication.status` remains deprecated compatibility metadata only. Audit output now exposes explicit `compatibilityStatus` and `compatibility*Count` fields. Historical `status`, `publishedCount`, `draftCount`, and `retiredCount` aliases remain temporarily for compatibility.

None of these fields authorize product use. `CognitiveTestConfig.status` remains the sole release lifecycle truth.

### 3. Seed publication baseline gate

Current historical/release-reviewed `PUBLISHED` seed configs are locked as an explicit baseline in the onboarding governance test.

Any future Cognitive seed that is not in that baseline must start as `DRAFT`. A PR that intentionally changes the approved published seed baseline must therefore make that release decision visible in review instead of silently bypassing `publishCognitiveConfig()` and Product Readiness.

This gate does not change current seeded statuses.

### 4. Backend/frontend runner parity gate

For every unique backend `testType + engineVersion`, the governance test requires:

- an exact frontend task registry file;
- matching `testType` and `engineVersion` declarations;
- import into the frontend Cognitive root registry;
- registration through `registerCognitiveRunner()`.

`scoringVersion` remains backend-authoritative; frontend runner selection remains keyed by `testType + engineVersion`.

## Standard onboarding consequence

A new Cognitive task must now satisfy all of the following before product release:

1. add exact backend executable identity and contracts;
2. add exact frontend runner identity;
3. create product config as `DRAFT`;
4. pass backend/frontend parity and registry audits;
5. pass generic Product Readiness;
6. pass content/stimulus/rights/report review;
7. execute the explicit publish transition.

No task-specific publication switch, default-status change, or fixed inventory counter should be needed.

## Non-goals

- no scorer changes;
- no protocol changes;
- no runtime changes;
- no DB migration;
- no config status changes;
- no scientific maturity changes;
- no new Cognitive content.
