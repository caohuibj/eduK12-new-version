# Organization / Reporting V2.1 — PR5 Product Integration Evidence

PR5 is the product-convergence layer on top of merged PR1–PR4. It does not add a second Organization authority model, Assessment Runtime, reporting engine, Safety classifier, or CSV generator.

## Review follow-up (2026-09-20)

Implemented and reviewed in this follow-up:

- Server-owned `allowedActions` drives navigation; identity changes and focus refresh current Organization authority.
- Organization creation, suspension and resumption require current SYSTEM_ADMIN. Creation can appoint a validated active first administrator. Ordinary governance is unavailable while suspended; existing responsible Safety access remains separately authorized.
- Classification dimensions/labels, temporal label assignments, counselor/client relationships and governance audit history have governed HTTP adapters and product forms.
- The Run builder lists only released server registry resources and narrows choices to their policy. A read-only server preview resolves population and authority before publication; publication rechecks the exact version and all invariants.
- A respondent task inbox supports explicit consent, START and recovery of the same execution. Exact assigned Run ownership permits legacy ADMIN respondents through shared runtime routes without granting access to other attempts; child runtime return navigation preserves the task inbox.
- Failed/denied report and Safety rereads remove previously displayed payloads. Run progress failures are visible. Run list counts avoid a Track/execution Cartesian join.
- Browser acceptance additionally exercises label assignment, consultation relationship ending/history, client mobile navigation, and platform-only lifecycle visibility. The Grade locator is scoped to avoid matching the select option.

Local validation:

- Fresh PostgreSQL migrations succeeded.
- Backend build passed; 26 relevant real-PostgreSQL suites / 82 tests passed with one worker, matching CI's nonparallel file execution. An exploratory two-worker run encountered PostgreSQL serialization failure `40001` in the pre-existing reporting-core publish fixture; the serial rerun passed. This does not establish automatic retry under arbitrary concurrent publication.
- Full frontend suite: 130 files / 487 tests passed.
- Frontend typecheck and production build passed; lint: zero errors, 101 existing warnings.
- Expanded real PostgreSQL/backend/Chromium Organization browser journeys passed. These browser assertions exercise product navigation/governance and negative authority boundaries; they do not establish all full assessment/report/export scenarios below.

### Acceptance still outstanding

The original C0–C7 headings below describe implementation slices, not certification of all C01–C10 requirements in the development plan. Complete school assessment → canonical result → report → CSV, consultation two-wave longitudinal, and protected multi-rater business scenarios have not all been demonstrated through a real browser. Full migration/backup/restore release rehearsal and parent historical report discovery also remain unverified here. The production resource registry remains intentionally empty until governed resources are released; no scientific content or Safety trigger is auto-published.

The final push requests the existing Ready-PR exact-head CI. Per the user's request this task stops immediately after triggering CI; final CI results and merge readiness are not asserted.

## Baseline

- Base: `main@e10b77af73e3fad6bc62aa941dc883b7bd452c21` (merged PR4 baseline).
- PR3 and PR4 were merged before PR5 branched.
- PR5 remains PR-only and must pass the repository Ready-PR exact-head Full Gate before merge.

## C0 — Final-main contract reconciliation

`pr5-product-contract.md` freezes the final PR1–PR4 contract and the product seams PR5 is allowed to add.

Confirmed invariants:

- Organization authority is `PlatformRole + current Membership + orgRole + Persona + Capability + explicit deny`.
- legacy `User.role` is not Organization authority.
- Organization Run remains orchestration over the existing Assessment Runtime.
- reporting statistics/privacy/longitudinal matching/protected feedback/Safety remain server-authoritative.
- CSV remains server-generated and reauthorized.

## C1 — Organization identity/context product projection

Implemented:

- authenticated Organization discovery;
- current `OrganizationAccessContext` projection;
- frontend `OrganizationProvider` and Organization selector;
- Organization product routes independent of legacy `ProtectedRoute` role checks.

Real-PostgreSQL/HTTP coverage locks:

- STANDARD users discover current direct Membership only;
- Parent relationship evidence does not become Organization Membership;
- ended Membership immediately removes current discovery/context;
- SYSTEM_ADMIN does not require synthetic Membership for platform context;
- explicit deny remains visible and outranks ordinary governance;
- cross-Organization ID guessing fails closed.

## C2 — Organization administration

PR5 exposes thin governed HTTP adapters over the already-authoritative structure services and adds product UI for:

- temporal Membership episodes;
- ORG_ADMIN/MEMBER role changes;
- Persona and Capability history;
- Grade/Class structure;
- Student/Class and Staff/Class temporal relationships;
- platform-only Organization create/suspend/resume;
- classification labels, counselor/client relationships and audit history;
- explicit-deny break-glass management.

The UI preserves current vs historical episodes; it does not collapse membership or class relations into mutable booleans.

## C3 — Assessment Run product journey

Added bounded Run list/detail read models over the existing Run graph and a product flow for:

`create -> add Track -> review -> publish(expectedVersion) -> progress -> close/cancel`.

The read model projects existing Run/Track/frozen actor/frozen relationship/execution facts only. It adds no new Run state machine.

Publish remains server-authoritative: frozen population/resource/policy resolution happens in the existing publish service, not in React.

## C4 — Organization Reporting workspace

Added bounded discovery for:

- published ReportingAnalysisSpec summaries;
- currently authorized Run/Track reporting sources;
- subject-scoped protected-feedback sources;
- Organization Series/Wave summaries.

The frontend consumes the existing PR3/PR4 analysis APIs for:

- `GROUP`;
- `REPEATED_COHORT`;
- `MATCHED_LONGITUDINAL` (`PAIRWISE` / `FULL_CASE`);
- `PROTECTED_FEEDBACK`.

Rendering is projection-driven. The browser does not calculate:

- cohort identity or N;
- statistics/quartiles/SD;
- privacy floors or suppression;
- longitudinal matching;
- multi-rater synthesis;
- scientific maturity/evidence ceilings.

Real-PG discovery tests verify current workspace authority and ensure discovery does not expose raw observations or hidden population counts.

## C5 — Safety and CSV delivery

Added a server-filtered Safety inbox. It returns only currently authorized safe summaries and then re-runs the exact-case authorization path before returning a candidate.

Safety exact-case projection remains server-selected:

- `FULL` — current responsible viewer with Psychology Staff capability;
- `ACTION` — current responsible Teacher/Counselor viewer;
- `SUMMARY` — permitted Organization administrative summary.

The inbox does not return subject identity, trigger detail, owner identity, or raw event detail.

CSV delivery uses the existing immutable export-ticket contract:

1. request export target (`AGGREGATE`, `MEMBER`, or `SAFETY`);
2. server reauthorizes underlying read + export capability;
3. server creates a viewer-bound short-lived ticket;
4. download reauthorizes again;
5. browser downloads the server-generated CSV blob.

The frontend never reconstructs CSV from page data.

A navigation correction preserves Safety responsibility during Organization suspension: suspended responsible staff may still reach the Delivery surface even though ordinary Reporting generation is unavailable.

## C6 — Cross-role real-DB/browser acceptance

PR5 extends the existing seeded browser Full Gate. The Organization fixture and Playwright acceptance use the same live PostgreSQL, backend and frontend processes as the exact-head browser job; Organization routes are not mocked.

The fixture deliberately gives ORG_ADMIN and Teacher-persona actors legacy `STUDENT` roles to prove Organization authority is independent of legacy `User.role`.

Browser journeys cover:

| Actor | Real product assertions |
| --- | --- |
| ORG_ADMIN (legacy STUDENT) | enters Organization governance, creates Grade, creates durable DRAFT Run, reload/direct-link works, reaches Reporting and Delivery |
| Teacher Persona (legacy STUDENT) | gets read-only tenant context, no governance Runs entry, can reach Reporting and Safety/CSV surfaces |
| Student Membership | discovers Organization, receives read-only context, gets no governance/reporting/Safety escalation |
| Parent relationship only | does not discover Organization and direct Organization URL fails closed |
| Cross-tenant guess | foreign Organization context returns hidden/404 |
| Ended Membership | current context and discovery disappear immediately after ending the exact episode |

The fixture uses dependencies from `backend/node_modules`, matching the established seeded-browser fixture layout, so the Full Gate exercises the same install topology as CI.

## C7 — Release gate

The final candidate must be marked Ready and pass the existing exact-head Full Gate:

- backend migrate/build/full regression on real PostgreSQL;
- frontend lint/typecheck/full tests/build;
- seeded browser acceptance, including PR5 real-DB Organization journeys;
- Docker production builds/scans;
- CodeQL;
- fail-closed `merge gate / ready PR`.

PR5-specific real-PG suites are part of backend full regression:

- `organizationProductContext.postgres.integration.test.ts`;
- `organizationProductAdmin.postgres.integration.test.ts`;
- `assessmentRunProductRead.postgres.integration.test.ts`;
- `reportingDiscovery.postgres.integration.test.ts`;
- `safetyDiscovery.postgres.integration.test.ts`.

Exact-head GitHub workflow/run evidence should be recorded on PR #123 after the Ready Full Gate completes. No code or documentation commit may be added after that evidence without rerunning the exact-head gate.

## Explicit non-goals preserved

PR5 does not:

- redesign Organization authority;
- infer tenant authority from legacy `User.role`;
- create a second Assessment Runtime;
- alter ONE UNIT / ONE FINAL;
- change scoring or CanonicalUnitResult identity;
- invent reporting statistics or new scientific interpretation;
- perform privacy, matching, multi-rater or Safety decisions in the browser;
- auto-publish governed reporting specs;
- auto-enable production Safety triggers;
- expose raw protected respondent observations;
- weaken export reauthorization;
- introduce a universal report renderer that owns domain science.
