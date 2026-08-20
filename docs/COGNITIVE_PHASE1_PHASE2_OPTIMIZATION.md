# Cognitive Module Phase 1 & Phase 2 Optimization Plan

## Background

Target commit:

`065dff14f37534753708fa083824c6b88e51d6d2`

This document defines the required optimization scope after review of the Cognitive Module Milestone E implementation.

## Decision

The following items are considered necessary engineering improvements, not redundant defensive design.

They directly affect:

- assessment correctness
- scoring consistency
- cognitive data safety
- future test expansion
- long-term maintainability

---

# Phase 1 - Stability and Governance

## 1. Cognitive Config Schema Validation

Introduce validation before publishing cognitive configurations.

Requirements:

- validate JSON configuration structure
- reject invalid published configurations
- version schema independently

Recommended structure:

```
config
  -> validator
  -> published config
```

---

## 2. Split Cognitive Bootstrap Logic

Move cognitive initialization out of a growing seed file.

Target:

```
bootstrap/
  cognitive/
    reaction.bootstrap.ts
    memory.bootstrap.ts
    stroop.bootstrap.ts
```

---

## 3. Unified Quality Rules

Move quality checks into a common model.

Examples:

- reaction time boundaries
- invalid attempts
- interrupted sessions

Avoid scattered test-specific fields.

---

## 4. Scoring Engine Abstraction

Introduce a unified scoring interface.

Each assessment type provides its own scorer:

```
scoring/
  reaction/
  memory/
  stroop/
```

---

# Phase 2 - Platform Capability Enhancement

## 1. Cognitive Data Isolation

Separate identity data from cognitive records.

Target model:

```
User
 |
ParticipantIdentity
 |
CognitiveRecord
```

---

## 2. Cursor Pagination

Replace offset pagination for large history datasets.

---

## 3. Backend Feature Capability API

Avoid duplicated frontend/backend feature flags.

Backend becomes the source of truth.

---

## 4. Integration Test Coverage

Add complete workflow tests:

```
Assignment
 -> Session
 -> Submit
 -> Score
 -> Report
 -> History
```

---

# Out of Scope

The following are intentionally deferred:

- microservice split
- full domain rewrite
- large directory migration

They add complexity without immediate value.
