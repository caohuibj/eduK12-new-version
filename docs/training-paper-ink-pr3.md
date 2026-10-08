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
2. **Global account vs roster authority**: Course creators retain listing and removal of their CourseStudent relationships. The shared `/courses/:courseId/students/:studentId/{freeze,reset-password}` global mutations now require legacy ADMIN at route/controller/service layer and **current `platformRole=SYSTEM_ADMIN`** in the canonical account services. Non-system or former admin cannot reset credentials/freeze accounts through the course path.
3. **Credential reset security**: Old course reset is a membership-checked alias to the existing `resetPasswordForPlatformAdmin` flow with a shared rate budget (`platform_password_reset`), bounded admission, current SystemAdmin validation, usable Organization admin invariant, credential handoff cleanup and token invalidation. No duplicate direct `prisma.user.update` credential path remains.
4. **Freeze security**: `setCourseStudentFrozenState` now revalidates current SystemAdmin inside its transaction and preserves the existing no-last-usable-admin / protected-SystemAdmin-target safeguards. A dead direct-update legacy freeze controller was removed (it had no active route).
5. **UI consistency**: `CourseStudents` exposes global freeze/reset only for `ADMIN + SYSTEM_ADMIN` accounts; Trainer/Teacher sees only course-level member removal, and training text/back button are course-contextual. UI hiding is supplementary, not the security boundary.
6. **Validation sources added/updated**: role/menu tests for the Admin workspace, Trainer vs SystemAdmin roster actions, service rejection of Teacher global freeze, and existing PostgreSQL invariants now exercised by true SystemAdmin actors.

## Important cross-product behavior change — requires explicit review before merge

**This is a shared backend authorization change.** The old generic Teacher experience also loses permission to freeze a student's global User account or force-reset global credentials from a Course roster. This is intentional to protect multi-course and future multi-product accounts, but can affect existing operational playbooks. Do not call this a Training-subdomain-only adjustment. System admin handling continues through the central platform account lifecycle.

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
- HTTP: Teacher `PUT /courses/:courseId/students/:studentId/freeze` and `POST .../reset-password` return 403 and change zero DB rows; teacher can still `GET roster` and `DELETE course member` when course owner. Legacy ADMIN with `platformRole=STANDARD` must be denied global mutations. Only `ADMIN + SYSTEM_ADMIN` may use the course alias, and account target invariants must still be enforced.
- Canonical `POST /users/:id/reset-password` and the course alias share the same credential admission and rate budget. Handoff is never written before checking SYSTEM_ADMIN.
- Visual/keyboard: Admin workspace accessible and only in Admin navigation; Teacher/Learner Training host stays calm and course-first at 390/768/1440. Canonical non-Training UI navigation otherwise unaffected.
- Compatibility: test the global shared-API policy change against current legacy Course and organization administration clients, including the mini program.
- Performance: no per-row roster/account requests on Training landing, no duplicate DB reads to infer platform role from the browser alone.
- Revalidate all three stacked PRs at exact HEAD before marking ready; CI must be explicitly resumed per user's chosen consolidated-gate policy.

## Pending decisions / limitations

- Backend `Course` is still not scoped to `training` product realm; future school version sharing Course needs a server-owned `ProductRealm` decision, including migrations and login-role switching policy.
- The current Admin Training page is an **organizing hub**, not a new standalone material CRUD product. Access policies and grant authority remain canonical.
- The training lecturer/course-authoring picker is grant-aware through existing resource APIs, but does **not** universally require explicit admin grants for self-authored scales / OPEN cognitive configs. That change requires separate policy approval to avoid breaking other domains.
- Training GROUP / longitudinal and formally released Student↔Trainer relationship measures are deliberately outside PR3 and must not be labeled shipped.
- No TypeScript, lint, unit, integration, browser or CI result is asserted until actually run.
