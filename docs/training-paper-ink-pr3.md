# Training PR3 — 统一管理端培训专区与课程账号权限收口（Stacked Draft）

- Notion: https://app.notion.com/p/3f3d27635a3881ff90e1eb79adaaea63
- Parent PR2: https://github.com/caohuibj/eduK12-new-version/pull/247
- Original PR1: https://github.com/caohuibj/eduK12-new-version/pull/246
- **Stacked base must be `feat/training-course-flow`. No main merge, release or CI has been performed.**
- All commit messages use `[skip ci]`; platform security checks are awaiting joint acceptance.

## Objective
Put the Training product under the existing Huisurvey admin, and make course participation rights explicitly distinct from global user-account rights. Training edition remains a visual/product context; it is not a new user role, new credential store or organization tenant.

## Changes

1. **Admin Training workspace**: `/admin/training` is protected by the existing `ADMIN` web route; the Admin navigation exposes it. It groups:
   - Teacher account approval / teacher-code issuance (links into existing `/users`, `/teacher-codes`).
   - Materials and instrument authorization (links into canonical `/admin/material-grants` and `/admin/instrument-authorizations`).
   - Course oversight via the existing `/courses` screen.
   - Bundle release and reporting-content governance via canonical Admin routes.
   No second MaterialGrant table, account API, material lifecycle or evaluation rule is introduced.
2. **Global account vs roster authority**: A TEACHER may list and remove participants from their own course and **reset an ACTIVE/APPROVED enrolled learner's password**. Reset is a deliberately scoped support action; it affects the participant's shared Huisurvey credential, not a course-local password. Teachers remain barred from globally freezing any account. SYSTEM_ADMIN still controls platform-wide freezes and administrative resets.
3. **Credential reset security**: `POST /courses/:courseId/students/:studentId/reset-password` has two distinct authorized branches. TEACHER is admitted only if current DB role/approval/usability, **course.creatorId**, non-library course, valid `CourseStudent` relation (ACTIVE/APPROVED), target role STUDENT and platformRole STANDARD all pass revalidation **inside a row-locked transaction**. SYSTEM_ADMIN targets and current ORG_ADMIN learners are excluded. Org usable-admin invariant, tokenVersion increment and mustChangePassword=true remain effective. The secret is CSPRNG-generated, rate/gate bounded, transmitted once as `temporaryPassword` only to the requesting teacher with `Cache-Control: no-store`, and displayed in a transient UI dialog. No secret enters logs, database audits, URLs or local/session storage. The password mutation and non-secret `COURSE_STUDENT_PASSWORD_RESET` governance audit commit atomically. ADMIN+SYSTEM_ADMIN retains the old course-alias compatibility path through `resetPasswordForPlatformAdmin`, which writes a protected handoff file instead of returning the password in the response. Both aliases consume the shared `platform_password_reset` budget plus a target reset fuse.
4. **Freeze security**: `setCourseStudentFrozenState` now revalidates current SystemAdmin inside its transaction and preserves the existing no-last-usable-admin / protected-SystemAdmin-target safeguards. A dead direct-update legacy freeze controller was removed (it had no active route).
5. **UI consistency**: `CourseStudents` and `StudentManagement` expose Teacher-initiated password reset only for active/unfrozen, non-PENDING learners on their enrolled course roster, while global freeze stays `ADMIN + SYSTEM_ADMIN`-only. A successful Teacher reset opens a keyboard-accessible **one-time credential handoff dialog** that is cleared on close. Legacy `ADMIN + STANDARD` has neither account action. UI hiding is supplementary; backend authorization is mandatory.
6. **Validation sources added/updated**: role/menu tests, CourseStudents/StudentManagement Teacher reset and SystemAdmin freeze gating, controller no-store/secret generation tests, real PostgreSQL tests for owned ACTIVE membership success + token invalidation + atomic audit, outsider course, PENDING, high-privilege target and demoted/unapproved instructor. Existing Organization safeguards continue to run for SYSTEM_ADMIN routes.

## Important cross-product behavior change — requires explicit review before merge

**This is a shared backend authorization change.** The old generic Teacher and Training Teacher can manage members of courses they own and reset passwords of valid enrolled learners, while **global freeze remains SYSTEM_ADMIN-only**. The temporary-password response is a new Teacher-only one-time handoff contract and MUST NOT be exposed through public routes, analytics or logs. A course teacher can see a participant's new global login secret once; this is a deliberate support-power risk requiring explicit course-scope authorization and non-secret audit. Organization admin and platform-admin targets are blocked. Do not call this a Training-subdomain-only adjustment; test web and mini-program consumers.

The present product contexts still share the same `Course`, `User.role` and `MaterialGrant` tables. `/admin/training` does **not** filter data to an independently recorded training realm. True per-edition backend data/ownership isolation requires a future authoritative realm design, not HTTP Host headers or a CSS/navigation switch.

## Resource-grant boundaries

- Existing `MaterialGrant` types: `SCALE`, `COGNITIVE_CONFIG`, `REPORT_PACKAGE`, `ASSESSMENT_BUNDLE`. Admin Training routes into the exact current grant UI; does not create an independent grant service.
- Self-owned Scale and OPEN Cognitive config may remain permitted by existing product policy; publishing a scientific resource and authorizing its use are distinct.
- Training Course authoring uses the existing Questionnaire resource catalog, which filters Scale access by `canUseScale`; standalone cognitive creation keeps its original backend config and profile admission.
- Training access to an assessment is **not** grant to read a participant's raw answers or personal psychological report. Keep the product-specific disclosure, consent, minimum-N and finalized report contract unchanged.
- Group and longitudinal reports are a follow-up project. This PR does not assert that plain `CourseStudent` automatically satisfies Organization Reporting V2.2 authority.

## Joint release acceptance (not yet executed)

- Frontend: `npm run typecheck`, lint, relevant `src/training` and admin/roster auth tests, all old student/teacher/admin auth/portal tests, production build.
- Backend: build and focused auth/controller/service tests. PostgreSQL `organizationReview` and `organizationAccountAuthority` suites must **run (not skip)** against an isolated database and prove last usable ORG_ADMIN and SYSTEM_ADMIN target protection.
- HTTP: TEACHER `PUT /courses/:courseId/students/:studentId/freeze` returns 403; TEACHER who owns a course **can POST reset-password only for its enrolled active learner** and gets the temporary password only once with no-store headers; unrelated teacher, non-STUDENT actor, PENDING/removed/frozen target, privileged target and revoked teacher all fail closed and change zero DB rows. `POST /courses/join` requires STUDENT. Legacy ADMIN with `platformRole=STANDARD` cannot freeze or reset; `ADMIN + SYSTEM_ADMIN` preserves the guarded admin alias. PostgreSQL audit and tokenVersion/mustChangePassword must be inspected after success.
- Admin `POST /users/:id/reset-password` and its Course alias retain their protected handoff-file flow; only the platform-admin path writes such files. The Teacher Course path uses an independent bounded password-work gate, the shared principal rate budget and a per-target limiter; it never writes a handoff file. No temporary password may be logged or replayed.
- Visual/keyboard: Admin workspace accessible and only in Admin navigation; Teacher/Learner Training host stays calm and course-first at 390/768/1440. Canonical non-Training UI navigation otherwise unaffected.
- Compatibility: test the global shared-API policy change against current legacy Course and organization administration clients, including the mini program.
- Performance: no per-row roster/account requests on Training landing, no duplicate DB reads to infer platform role from the browser alone.
- Revalidate all three stacked PRs at exact HEAD before marking ready; CI must be explicitly resumed per user's chosen consolidated-gate policy.

## Teacher-led password recovery acceptance
- Course creation yields a unique course code; new students can register by code, existing STUDENT accounts can join, and no other role may enroll via `POST /courses/join`.
- Teacher finds an ACTIVE/APPROVED member via own course roster and requests a reset. The shared User tokenVersion increments; existing sessions stop authenticating. Student signs in with one-time displayed password and is required to change it before any other backend operation.
- HTTP no-store/no-referrer, one-time browser dialog and limited teacher/target budgets are mandatory. Closing the dialog discards the value; lost-response resets require an explicitly authorized new reset (no retrieval endpoint).
- Audit event stores actor, target and owning course ID **without** the password or password hash. Aborted mutations produce no audit event.
- PENDING, removed, non-owner, disapproved/deactivated teacher, frozen/expired/privileged target, and org-admin learner cases are denied. Retained `SYSTEM_ADMIN` account controls are tested separately. **These tests must actually run against isolated PostgreSQL and browser before Ready.**

## Pending decisions / limitations

- Backend `Course` is still not scoped to `training` product realm; future school version sharing Course needs a server-owned `ProductRealm` decision, including migrations and login-role switching policy.
- The current Admin Training page is an **organizing hub**, not a new standalone material CRUD product. Access policies and grant authority remain canonical.
- The training lecturer/course-authoring picker is grant-aware through existing resource APIs, but does **not** universally require explicit admin grants for self-authored scales / OPEN cognitive configs. That change requires separate policy approval to avoid breaking other domains.
- Training GROUP / longitudinal and formally released Student↔Trainer relationship measures are deliberately outside PR3 and must not be labeled shipped.
- No TypeScript, lint, unit, integration, browser or CI result is asserted until actually run.
