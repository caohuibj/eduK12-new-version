# Training PR1 — 纸墨 · 见山（Draft）

Design: https://app.notion.com/p/3f3d27635a3881ff90e1eb79adaaea63

## Goal
Create a minimal course-based Training entry at `training.eduk12.top` for **Learner** and **Trainer**, with a distinct ink-and-paper visual theme, while preserving the existing `eduk12.top` portal and all backend/runtime contracts.

## Current implementation
- Strict hostname test with a Vite-dev `training.localhost` alias; this is a **frontend product context**, not a permission boundary.
- Training landing: two routes only, `/student/login` and `/teacher/account-login`; existing course-code and teacher-code account lifecycles remain authoritative.
- Authenticated Learner / Trainer home: course list only, plus join-course / create-course dialogs via existing `/courses/my`, `/courses`, `/courses/join`, and `POST /courses`.
- Training navigation reduces to My Courses and My Account. Hides generic organization/admin/research menu links, selectors, and the global assessment task shortcut **in the training presentation only**.
- `paper-ink.css` implements edition-scoped paper/ink/bamboo/cinnabar tokens and an original lightweight inline SVG study sketch on the entry page. No external font or image dependency.
- Added test sources for strict hostname, nav, entry role links, course cards, and joining courses.

## Boundaries
- **Not** a new Git repository/long-running branch, new user role, new Course schema or reporting engine.
- Does **not** grant or remove backend permissions. Direct API authorization and old URLs remain authoritative; do not treat hidden navigation as isolation.
- No changes to Scale, Cognitive, SJT, Bundle, FINAL, scientific/report contracts, cookies, database, production ingress, or CI workflows.
- Admin access is intentionally not offered as a third training identity. The platform admin still uses the canonical platform entry.
- Separate domain DNS/TLS/ingress is **not** configured by this PR.
- Group/longitudinal reporting and released teacher/student relational products are separate, later design tasks.

## Tests / gate status
Test files are present but **have not been run in this chat**; no claim of build/CI/browser green. Every commit is tagged `[skip ci]`; keep this PR in Draft and do not trigger full CI until explicitly authorized.

Before ready:
1. Run frontend lint, typecheck (includes the route inventory/guard gate), relevant vitest and prod build in an isolated development checkout.
2. Exercise both identities in desktop and 390px/768px mobile widths, check modal focus/escape, dark/system forced colors and real course-code registration.
3. Verify exact host routing and browser session/CSRF under staging TLS reverse proxy with same-origin `/api`.
4. Confirm unauthorized role routes fail closed at API and test old generic host remains unchanged.
5. Separately confirm that course and global account actions do not cross realm or impact other courses; service authorization changes belong in PR3.

## Next PRs
PR2: consolidate actual course content (assignment, check-in and course-authorized assessments) and training-specific course detail UX.
PR3: Admin Training management workspace, material authorization visibility and restrictive course-roster vs global-account authority.
