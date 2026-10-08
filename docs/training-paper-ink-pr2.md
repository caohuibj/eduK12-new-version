# Training PR2 — 课程内作业、打卡、测评整合（Stacked Draft）

- Design authority: https://app.notion.com/p/3f3d27635a3881ff90e1eb79adaaea63
- Depends on PR #246 `feat/training-paper-ink-entry`; **base this PR on the PR1 branch**, not main.
- This PR is frontend integration only: do not change scoring, FINAL, scientific release, database or resource authorization.
- **No CI has been run. No production domain or API configuration has been changed.**

## Product structure

Training learner:
`我的课程 → 进入课程 → 作业 / 打卡 / 测评 → original submission or runner → original feedback`

Training trainer:
`我的课程 → 课程 → 作业 / 打卡 / 测评`; short links to exact course roster and existing assessment results workbench. Course code copying is optional and safe (manual fallback).

## Implementation in this branch

1. Host-aware routes in `App.tsx`: Training learner and trainer course detail components replace only the generic course pages on the exact Training host; all other hosts keep existing pages.
2. `TrainingLearnerCourse`: three tabs; reuses course-specific assignment/check-in APIs and the original submission pages. Assessment list is loaded on demand, shows source-specific failure, does not invent completion or score.
3. `courseAssessments.ts`: independent read-only sources from `/questionnaires/available?courseId`, `/scales/available`, `/cognitive/assignments/my` (behind cognitive capability), `/composite-assessments/available` and the authorized, paginated `/courses/my/tasks` course-delivery feed when needed.
4. **Actual Scale API contract** is `courses[]`, not `course`; course binding is checked against this array. PUBLIC standalone scales are not treated as course assignments merely because visible.
5. Student Composite may be assigned to multiple courses while `composite.course` is null. Associate only from the caller's task feed, never from its general visibility. Avoid merging items by title; keys include resource type and id.
6. Reuse original Cognitive Assignment entry for start/continue; it is not a new cognitive runner. Retake, report and ability availability are still evaluated by backend.
7. `TrainingTrainerCourse`: display the course's existing assignments, check-ins and course questionnaires; published, listed cognitive assignments are scoped by `courseId` and creator. Publishing links open the existing editors with a suggested course context.
8. Original `CheckinList`, `QuestionnaireProductEdit`, `CognitiveAssignmentList` now accept explicit, authorized course preselection on `?courseId=...`. A foreign id cannot be selected by URL alone. Original authoring and scientific publish gates stay intact.

## WIP validation matrix — must run before Ready

- `npm run typecheck`: includes route inventory and session authorization gate. Unexecuted.
- `npm run lint` for changed files. Unexecuted.
- Targeted vitest: `src/training/*test.{ts,tsx}`, `src/pages/questionnaire/__tests__/QuestionnaireProducts.test.tsx`, `src/pages/teacher/__tests__/CognitiveAssignmentList.grants.test.tsx`; plus relevant student/course regressions. Unexecuted.
- Build with app source, dynamic route loads and CSS. Unexecuted.
- Browser: 390/768/1440 screens, keyboard focus, loss of one assessment source without loss of other tasks, multiple courses and course selection, no external URL injection.
- Backend / real isolated PostgreSQL acceptance: correct course membership, course creator authorization, capability switches and course-code join lifecycle; use no production credentials.
- Quiz/Scale, Cognitive, SJT-in-composite and Bundle: only actually published accessible tasks; existing original runners and FINAL must preserve state, consent and report restrictions.
- Report access remains governed by the existing product contract, not by training host or course membership alone.
- No CI / production deployment until PR1 + PR2 + PR3 all reviewed.

## Known boundaries — not resolved by PR2

- Training domain is still a presentation context; backend course/product realm isolation is not established by host-only routing.
- Existing course roster's global-account actions should be narrowed in PR3 with server-side permission rules.
- New training Admin work area and explicit material grant management are PR3.
- Course GROUP / longitudinal reports and released Teacher↔Learner relational content are separate reporting work, not solved in this PR.
- Separate SJT standalone discovery is not treated as a current course task; SJT-in-composite reuses the existing product.
- Composites' multi-course memberships are discovered from the current task feed; the page cap is intentionally bounded and fails visibly rather than silently pretending to show a complete list.

## Acceptance requirements

- Each training course page is readable immediately with **three** primary task groups and no cognitive jargon in the navigation.
- The content source maps exact current course ids and respects source permissions.
- Adding course-context links never bypasses original owned-course verification and grants.
- Retry and partial failures are distinct from a successfully loaded empty task list.
- Off-host, the entire original app experience remains unchanged.
- Deployment of DNS/TLS/ingress and future SSO/cross-subdomain auth are **not** included.

Review/CI/merge/deployment evidence is pending and must be tied to an exact head SHA when run.
