# Huiteacher single-branch development checkpoint

Baseline: `main@2c3b9ed518a7652108b19b2ffbace2308678ca56`
Branch: `feat/huiteacher-pr1-education-identity`
Checkpoint: `0463e94ca0fb1d0d4f56ce5473635c718a95f0ba`
Authoritative specification: [Notion Huiteacher v1.2](https://app.notion.com/p/3f6d27635a38818d9bbddaf9ec8a48fa).

**This is a development checkpoint, not a release, merge or CI acceptance record.**
The user explicitly paused CI; no official PR, CI activation, merge or production deployment is authorized by this checkpoint.
Changes for PR1 and PR2 currently share one stacked branch; PR1 security amendments after early PR2 commits are part of the *same final cumulative diff*, not separate reviewed PRs.

## Phase status

| Scope | Implemented on feature branch | Still required before claiming complete |
| --- | --- | --- |
| PR1: shared education identity | Separate School/Teacher host-only sessions and CSRF, shared User/campusAccount, school entitlements, per-product admin grants, Teacher-only bootstrap, staff/student invites, product-specific School psychology admission, basic Teacher landing and school admin UI | Exhaustive shared-route authority audit; actual isolated DB migration/contract tests; role/registration/backward-compatibility checks; production auth/config review |
| PR2: evaluation foundation | Stable person/team/org/activity/artifact/project targets, event lifecycle, Teacher-owned immutable Survey Form V2 authoring, shared ResearchFormEditor without researcher-media access, atomic canonical Run draft binding, track/preview/publish/lifecycle endpoints, Teacher-vs-School Run authority hardening, manager UIs | **Blocker:** Teacher Form V2 must be a formally authorized canonical Run resource with a real START/FINAL adapter. Existing Composite Form launch semantics and Survey RESEARCH_ONLY publications cannot be silently treated as Teacher's release. Permission-filtered task inbox and recipient/subject event linking also outstanding. |
| PR3: teacher development and school diagnosis | Shared user, organization, activity and draft content foundations only | Teacher personal/self assessment participation, authorized instrument catalogs and scientific qualification, schools surveys, source-specific aggregate reporting, small-cell/differencing protection and personal report separation |
| PR4: field/expert/multi-rater | Event kinds include classroom, meeting, teaching research and field visit | Evidence/drafts, scoped expert projects, private reflection, independent evaluation and deliberated consensus |
| PR5: student evaluation of teaching | Reusable education student ID and class relations | Teacher-linked evaluation task eligibility, student's restricted Teacher session, repeat/identity protections, safe cohort feedback, text disclosure review |
| PR6: follow-up and release | Branding shell and target/event keys | Stable cross-event comparison, action tracking, full workspace/nav, responsive QA, TLS/Nginx/Compose feature flags, release/rollback evidence |

## Scope and security invariants

1. Scheme A: shared education identity, **separate logins**, no SSO; School-only, Teacher-only, dual-product schools.
2. Student and teacher accounts never duplicated merely because the school opens the other product; School psychology enrollment is a separate authorization decision.
3. A shared `ORG_ADMIN` membership **does not** grant either product's protected business authority. Existing School administrators are backfilled into explicit HUISCHOOL product-admin grants. Teacher rights are separately granted.
4. Teacher-linked Assessment Run is created transactionally; School Activity cannot bind that Run. Run management and publisher checks distinguish the exact Teacher event binding.
5. Teacher Form is **unscored**, reuses Survey V2 definition checks, and is immutable after publication. This authoring completion **does not** imply a usable FINAL runtime.
6. Student academic grades/exams/matching, full School/Teacher SSO, full educational timetable/OA, and AI scoring are not in the current release scope.
7. No test result has been reported as PASS. Integration tests committed to `huiteacherSharedIdentity.postgres.integration.test.ts` and `huiteacherEvaluation.postgres.integration.test.ts` are **not executed**.

## PR2 release-blocking adapter decision

- A published `HuiteacherFormInstrument` is presently *only* a Teacher-owned frozen authoring record, not a `registered_assessment_resources` release or a Composite launch target.
- `productionRunResourceAuthorityRegistry` supports `FORM` only when its authoritative release resolves to the existing canonical Composite launch contract. It cannot launch the richer Survey Form V2 by pretending the content is a Composite form section.
- The next development task must implement and validate an explicit supported Survey Form V2 → canonical Run START/FINAL bridge (with idempotency and protected result source), or extend an existing officially supported Form runtime to preserve all V2 semantics. Do not publish fake scores, fake qualified research content, or parallel mutable answer stores.
- Only after a real Teacher-form respondent FINAL can PR3's school group report adapter safely consume a product-scoped verified source.

## Future checks — deferred under user's no-CI instruction

| Change | Fault detected by required check | Single primary location | Reusable evidence | Budget |
| --- | --- | --- | --- | --- |
| Prisma migrations, scoped grants, reused School admissions | Old school regression, product escalation, destructive migration, invalid DDL | Official GitHub isolated Postgres / migration contract | None yet; per frozen input only | Size after final diff freeze |
| Shared Assessment Run and Teacher product boundaries | Wrong run attribution, unsafe release, unauthorized FINAL | Official GitHub affected backend integration | None yet | Freeze after runtime adapter |
| Form V2 authoring & UI | Schema/preview inconsistency, TS errors, responsive editor | GitHub affected frontend checks | None yet | Freeze after frontend completion |
| Deployment config | Wrong host, cookies, feature gate or artifact | GitHub selected candidate, then server only version/readiness/one flow/rollback | Only same candidate digest | Production time-limited |

**Do not initiate CI or any full test battery for this checkpoint.** Before a real PR/merge/release, re-read exact `AGENTS.md` and `docs/release/README.md`, classify full diff and use only official, verifiable evidence.
