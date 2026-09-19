# PR5 Product Integration Contract

Status: PR5 C0 contract reconciliation  
Baseline: `main@e10b77af73e3fad6bc62aa941dc883b7bd452c21`  
Prerequisites: PR3 #121 and PR4 #122 merged; PR4 exact-head Full Gate and post-merge main smoke passed.  
Scope: Organization / Reporting V2.1 product integration. This document does not change reporting science, Runtime semantics, scoring, authorization policy, or production publication state.

## Review reconciliation (2026-09-20)

The baseline inventory below records pre-PR5 behavior. The reviewed implementation intentionally narrows Organization create/suspend/resume HTTP operations to current SYSTEM_ADMIN, supports a designated active first administrator, and blocks ordinary governance on suspended Organizations. Server-returned action hints drive product navigation; every endpoint still independently authorizes requests.

The completed product adapters now also include classification/relationship history, audit reads, released resource discovery, authoritative read-only Run preview, and exact respondent task discovery. Shared relational runtime routes accept authenticated users at the shell and authorize exact resources on the server; legacy ADMIN access is added only for an exact frozen Run respondent binding. This is not Organization authority inferred from a legacy role.

See `pr5-evidence.md` for the tested scope and outstanding development-plan acceptance evidence. This contract does not certify C01–C10 completion or CI success.

## 1. PR5 objective

PR5 turns the server-authoritative Organization / Run / Reporting capabilities delivered by PR1–PR4 into a usable product surface.

The frontend is a renderer and workflow client. It must not become a second authority or analysis engine.

Hard rule:

`server-owned identity / authority / cohort / privacy / analysis / safety / export -> frontend projection and interaction`

PR5 must not reimplement or infer any of the following in React:

- Organization authority from legacy `User.role`;
- current Membership, Persona, Capability, relationship, or explicit-deny state;
- cohort membership or frozen Run population;
- mean/median/SD/quartiles or longitudinal matching;
- privacy thresholds or suppression;
- multi-rater combination policy;
- scientific maturity/evidence ceilings;
- protected-feedback audience decisions;
- Safety classification or responsibility projection;
- CSV contents from rendered UI state.

## 2. Frozen upstream invariants

PR5 preserves these PR1–PR4 boundaries.

### Identity and authority

- JWT/session is a credential, not an authority snapshot.
- Platform authority is `SYSTEM_ADMIN | STANDARD`, independent from legacy application `User.role`.
- Organization authority derives from current database state: Organization status, temporal Membership, `orgRole`, Persona grants, Capability grants, relationship evidence where applicable, and explicit denies.
- Explicit deny outranks normal Organization access, including ordinary SYSTEM_ADMIN Organization operations; deny-management remains the narrow break-glass surface.
- Rejoining an Organization creates a new Membership episode; historical Membership is never resurrected.

### Assessment Run

- Organization Run orchestrates the existing Assessment Runtime. PR5 must not introduce another runtime.
- Preserve ONE UNIT / ONE FINAL, canonical result identity, START recovery, consent authority, and frozen scientific provenance.
- Publish freezes the selected population/resource/policy facts used by downstream execution and reporting.

### Reporting

- Generic GROUP, REPEATED_COHORT, MATCHED_LONGITUDINAL, and PROTECTED_FEEDBACK are server-side governed analysis contracts.
- Reporting artifacts are immutable and public reads expose only `artifactId`, `generatedAt`, and `projection`.
- Privacy suppression is server-owned at report and metric/cell level.
- Longitudinal comparability and matched-case eligibility are server-owned.
- Protected feedback is an audience-specific projection, not data fetched broadly and hidden in the browser.
- Multi-rater observations remain separated by Track/relationship/perspective/respondent; clients do not average sources.

### Safety and export

- Organization Safety views resolve existing canonical Safety cases; PR5 does not create a second Safety store or browser-side trigger engine.
- Safety FULL/ACTION/SUMMARY is server-selected from current responsibility/authority.
- Aggregate/member/Safety CSV exports are server-generated.
- Export capability must intersect with underlying current read authority.
- Export tickets are viewer-bound, short-lived, and reauthorized on download.
- Revocation must take effect without relying on UI state.

## 3. Exact HTTP surface available at PR5 baseline

All Organization routes are mounted under `/api/organizations`.

### Platform-governed reporting specs

| Method | Route | Current authority / contract |
| --- | --- | --- |
| POST | `/reporting-specs` | authenticated; service requires current `SYSTEM_ADMIN` |
| POST | `/reporting-specs/:specId/review` | authenticated; service requires current `SYSTEM_ADMIN` |
| POST | `/reporting-specs/:specId/publish` | authenticated; service requires current `SYSTEM_ADMIN` |
| POST | `/reporting-specs/:specId/retire` | authenticated; service requires current `SYSTEM_ADMIN` |

No client may weaken or fork spec policy with Organization-admin authority.

### Organization governance

| Method | Route | Current authority / contract |
| --- | --- | --- |
| POST | `/` | any authenticated account may create an Organization and becomes first ORG_ADMIN |
| GET | `/:organizationId/memberships` | `requireOrganizationGovernance`, paginated historical/current episodes |
| POST | `/:organizationId/suspend` | Organization governance |
| POST | `/:organizationId/resume` | Organization governance |
| POST | `/:organizationId/memberships` | Organization governance |
| POST | `/:organizationId/memberships/:membershipId/end` | Organization governance |
| POST | `/:organizationId/memberships/:membershipId/role` | Organization governance |
| POST | `/:organizationId/memberships/:membershipId/personas` | Organization governance |
| POST | `/:organizationId/memberships/:membershipId/personas/revoke` | Organization governance |
| POST | `/:organizationId/memberships/:membershipId/capabilities` | Organization governance |
| POST | `/:organizationId/memberships/:membershipId/capabilities/revoke` | Organization governance |
| POST | `/:organizationId/access-denies` | deny-governance break-glass boundary |
| POST | `/:organizationId/access-denies/lift` | deny-governance break-glass boundary |

Membership mutation inputs are server-validated. Current Persona values are `TEACHER | STUDENT | COUNSELOR | CLIENT`. Current named capabilities are `PSYCHOLOGY_STAFF | REPORT_EXPORT | REPORT_MEMBER_EXPORT`.

### Run lifecycle

| Method | Route | Current authority / contract |
| --- | --- | --- |
| POST | `/:organizationId/runs` | Organization governance; create DRAFT |
| POST | `/:organizationId/runs/:runId/tracks` | Organization governance; add DRAFT Track |
| POST | `/:organizationId/runs/:runId/publish` | server checks current scoped publisher authority |
| GET | `/:organizationId/runs/:runId/progress` | Organization governance |
| POST | `/:organizationId/runs/:runId/close` | Organization governance |
| POST | `/:organizationId/runs/:runId/cancel` | Organization governance |
| POST | `/:organizationId/runs/:runId/executions/:executionId/consent/accept` | server validates execution/actor relationship |
| POST | `/:organizationId/runs/:runId/executions/:executionId/start` | server validates frozen respondent identity and START authority |

Track resource families are `BUNDLE | SCALE | FORM | SITUATIONAL | COGNITIVE`. Requested Track policy is validated server-side and includes subject/respondent roles, relationship kinds, perspectives, analysis mode, visibility policy, and optional minimum-respondent floor.

### Reporting and delivery

| Method | Route | Current contract |
| --- | --- | --- |
| POST | `/:organizationId/reporting/series` | create immutable Organization/resource-scoped Series |
| POST | `/:organizationId/reporting/series/:seriesId/waves` | bind immutable Wave to exact Run/Track |
| POST | `/:organizationId/reporting/analyses` | GROUP / REPEATED_COHORT / MATCHED_LONGITUDINAL / PROTECTED_FEEDBACK dispatch |
| GET | `/:organizationId/reporting/artifacts/:artifactId` | current reauthorization; safe projection only |
| POST | `/:organizationId/reporting/exports` | AGGREGATE / MEMBER artifact export or SAFETY case export |
| GET | `/:organizationId/reporting/exports/:exportId` | viewer-bound reauthorization; CSV; `no-store` |
| GET | `/:organizationId/safety/cases/:caseId` | server-selected FULL/ACTION/SUMMARY projection |

Analysis request identities remain strict:

- GROUP: `{ runId, trackId, specId, options?: {} }`;
- REPEATED_COHORT: `{ analysisKind, seriesId, waveKeys, specId }`;
- MATCHED_LONGITUDINAL: `{ analysisKind, seriesId, waveKeys, specId, options: { mode: 'PAIRWISE' | 'FULL_CASE' } }`;
- PROTECTED_FEEDBACK: `{ analysisKind, runId, trackId, subjectUserId, relationshipKind, perspective, specId }`.

## 4. Existing domain capabilities not yet exposed as product HTTP APIs

C0 found intentional/unfinished integration seams that block a complete UI but do not represent PR3/PR4 correctness failures.

### Organization structure

The backend already owns tested Grade/Class domain services:

- `createOrganizationUnit`;
- `listOrganizationUnits`;
- `deleteOrganizationUnit`.

It also owns tested class-relationship services:

- student -> class assignment and end;
- teacher -> class assignment (`HOMEROOM | TEACHING`) and end;
- current Membership + Persona revalidation;
- database uniqueness/restrict invariants.

These services are not currently mounted in `organization.routes.ts`. PR5 may add thin authenticated/governed HTTP adapters and read projections. It must not duplicate their invariants in controllers or frontend code.

### Organization discovery/current context

There is currently no Organization product read endpoint equivalent to:

- list Organizations currently visible to the signed-in principal;
- read an Organization summary;
- read the principal's current `OrganizationAccessContext` for one Organization.

This is required for safe Organization selection/navigation.

### Platform role projection

Backend authenticated principals contain current `platformRole`, but current login and `/auth/me` response bodies omit it, and frontend `User` contains only legacy `role`.

PR5 must expose current platform role to the product shell without treating it as Organization authority. Organization route access must still use server Organization context and endpoint authorization.

### Run discovery/read model

The server currently exposes create/mutate/progress operations but no general Organization Run list/detail product projection. PR5 needs bounded list/detail reads so users can reopen a Run after navigation/reload rather than relying on transient client state.

The read model must expose only server-owned lifecycle/frozen facts needed by the product; it must not make internal START claims, raw result rows, or mutable authority facts client-owned.

### Governed reporting discovery

Mutation and exact-ID analysis endpoints exist, but a product cannot safely discover IDs from transient state alone. PR5 needs bounded server-owned discovery reads for the minimum required surfaces, such as eligible published reporting specs and existing Series/Waves relevant to the Organization/resource.

Any discovery endpoint must preserve the same current authorization and policy-domain isolation as the existing exact-ID operations.

### Safety discovery

PR4 exposes exact-case read by `caseId`; there is no general Organization Safety case list route at the baseline. If PR5 exposes a Safety inbox/list, it must be a server-filtered responsibility projection. The browser must never fetch all cases and hide unauthorized rows locally.

## 5. Frontend baseline and integration boundary

The current frontend still models the legacy account shell around:

`STUDENT | TEACHER | ADMIN | PARENT`.

`AuthContext` loads `/auth/me` into that legacy `User`, and ordinary protected routes authorize by legacy role. This remains valid for existing legacy product routes but is insufficient for Organization V2.1.

PR5 must not globally reinterpret or replace the existing `ProtectedRoute` in one step.

Instead PR5 introduces a separate Organization product boundary:

1. authenticated account session;
2. current platform role projection;
3. Organization selection/discovery;
4. server-returned current Organization context;
5. Organization-specific navigation and route surfaces;
6. every data/mutation request reauthorized independently by the backend.

Recommended route namespace:

`/organizations/:organizationId/...`

Legacy `/dashboard`, `/courses`, `/students`, assessment runners, and relational routes remain compatible unless a narrow shared-shell change is required.

## 6. PR5 implementation sequence after C0

### C1 — Product authority and Organization context

Deliver the minimal read seams required for safe navigation:

- expose current `platformRole` in authenticated identity projection;
- Organization discovery/summary;
- current OrganizationAccessContext projection;
- frontend Organization context/provider;
- Organization route boundary and navigation;
- tests for SYSTEM_ADMIN, ORG_ADMIN, ordinary member, explicit deny, suspended Organization, ended Membership, and cross-Organization guessing.

Frontend navigation is convenience only. Backend denial remains authoritative.

### C2 — Organization administration

Expose thin governed adapters over existing tested structure services and build UI for:

- Membership episodes;
- role/Persona/Capability grants;
- Grade/Class structure;
- student/staff class relationships;
- current vs historical state;
- suspend/resume and explicit-deny administration where appropriate.

Do not collapse temporal episodes into mutable booleans.

### C3 — Assessment Run product journey

Add bounded Run list/detail projections and implement:

`create -> add Tracks -> review frozen inputs -> publish -> progress -> close/cancel`.

Publish UI must clearly communicate frozen population/resource/policy facts. Participant START/consent continues to reuse existing Runtime flows and server authority.

### C4 — Reporting UI

Build server-projection-driven surfaces for:

- GROUP;
- REPEATED_COHORT;
- MATCHED_LONGITUDINAL;
- PROTECTED_FEEDBACK.

UI must distinguish `AVAILABLE`, `SUPPRESSED`, `NOT_APPLICABLE`, missing/unsupported input, and request/error states when those distinctions are provided by the projection. Suppression must never be represented as a client-calculated threshold.

### C5 — Safety and CSV delivery

- server-filtered Safety responsibility surface if list/discovery is added;
- exact Safety case projection;
- aggregate/member/Safety export requests;
- browser download through viewer-bound export ticket;
- clear revoked/expired/forbidden handling;
- never reconstruct CSV in the frontend.

### C6 — Cross-role end-to-end journeys

Use real PostgreSQL + browser acceptance for Organization-admin/staff/respondent/Parent paths that are actually authorized by the server contracts.

Required negative coverage includes cross-Organization ID guessing, ended Membership, revoked relationship/capability, explicit deny, privacy suppression, protected-feedback subject denial, and export reauthorization.

### C7 — Exact-head release gate

The final PR5 candidate must pass the existing Ready-PR Full Gate on the exact final head:

- backend migrate/build/full regression;
- frontend lint/typecheck/full tests/build;
- browser acceptance;
- Docker production builds/scans;
- CodeQL;
- `merge gate / ready PR` exact success.

PR5 should extend browser acceptance with the Organization product journey rather than replacing existing FE-11 / RA-02 / seeded Bundle coverage.

## 7. Explicit non-goals

PR5 does not:

- redesign Organization authority;
- infer Organization authority from legacy `User.role`;
- add a second Assessment Runtime;
- alter ONE UNIT / ONE FINAL;
- change scoring or canonical result identity;
- invent new aggregation algorithms;
- perform client-side longitudinal matching;
- automatically equate non-comparable waves;
- average multi-rater sources by default;
- calculate Safety status in the browser;
- automatically publish governed reporting specs;
- automatically enable production Safety triggers;
- expose raw protected respondent observations;
- weaken privacy floors for UI convenience;
- create a universal report renderer that erases domain-specific semantics.

## 8. C0 exit decision

PR5 is clear to proceed.

No PR3/PR4 correction PR is required before product integration. The missing pieces found by C0 are product-facing read/adaptor seams and belong inside PR5, provided they remain thin wrappers over the already-authoritative domain services and preserve current authorization.

C1 starts from this exact contract and must first establish trustworthy identity/Organization context before any Organization administration or reporting page is made reachable.
