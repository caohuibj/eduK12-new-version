# Huisurvey Modern Education Frontend Specification

Baseline: `main@ae059fc0`  
Visual direction: **Modern Education**  
Scope: presentation convergence only unless a separate interaction/logic PR is explicitly opened.

## 1. Non-negotiable boundaries

Visual work may change layout, typography, spacing, color, icons, responsive composition, presentation-only shell chrome, focus styling, touch target size, empty/loading/error presentation, and non-semantic accessibility markup.

Visual work must not change API calls, authorization, route access, returnTo behavior, assessment state machines, draft persistence, scoring/report semantics, submission timing, validation rules, or workflow transitions.

If a review exposes a behavior/state issue, record it separately and fix it in a dedicated logic PR.

## 2. Responsive contract

| Range | Target | Layout contract |
|---|---|---|
| `< 640px` | Mobile | Single column, 16–20px edge padding, full-width primary actions, compact decorative content, 44px minimum interactive targets |
| `640–1023px` | Tablet | Stacked or two-region layouts, 32–48px side padding where space permits, preserve desktop information hierarchy without desktop-only density |
| `>= 1024px` | Desktop | Multi-column/split layouts where useful, higher information density for staff workflows, stable reading widths for assessment/report content |

Additional requirements:

- Use `100dvh` for full-height entry/focused surfaces.
- Respect safe-area insets on mobile.
- Preserve keyboard focus visibility.
- Support `prefers-reduced-motion`.
- Never rely on hover as the only way to discover an action.
- Avoid horizontal page scrolling. Local horizontal scrolling is acceptable for dense staff tables when a semantic mobile alternative would change workflow behavior.

## 3. Visual foundations

Primary brand blue: `#2F6FED`  
Primary hover: `#255DCE`  
Sky accent: `#38BDF8`  
Success/education green: `#22C55E`  
Warm attention accent: `#F59E0B`  
Primary text: `#14304A`  
Muted text: `#64748B`  
Default border: `#DDE7F0`  
Page background: `#FBFDFF`  
Soft brand surface: `#EFF7FF`

Spacing scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64px.  
Radius scale: 8 / 12 / 16 / 24px plus pill radius.

Chinese-first typography should prefer locally available CJK system fonts. Figma foundations use Noto Sans SC as the reference face; production CSS must retain robust system fallbacks and must not depend on a downloadable font asset.

## 4. Page-family responsive strategy

### Entry and authentication

Desktop uses an educational hero + task card split layout. Tablet stacks hero and form while preserving the hero context. Mobile compresses the hero, removes non-essential benefit chips, and gives the form full available width.

### Student and parent application pages

Mobile-first. One primary task per viewport region; cards collapse to one column; secondary metadata is reduced before primary actions are moved. Navigation must remain thumb-friendly.

### Teacher/admin management

Desktop-first for productivity, but mobile remains usable. Side navigation collapses; toolbars wrap; destructive/secondary actions move into existing overflow patterns. Dense tables may use local horizontal scroll on tablet/mobile unless converting them to cards is demonstrably semantics-preserving.

### Editors and configuration forms

Desktop may use section navigation and multiple columns. Tablet/mobile stack fields and sections. Sticky action bars must not cover inputs or mobile browser safe areas.

### Assessment runners

Focused mode remains visually isolated from management chrome. Do not add decorative UI that competes with stimulus presentation or timing. Responsive changes must not alter task timing, stimulus geometry requirements, input method semantics, or submission behavior.

### Reports

Desktop may use side-by-side metrics/charts. Mobile stacks narrative, key score, then supporting dimensions. Charts must resize rather than clip; tabular evidence may use local scrolling. Report wording and interpretation are immutable in visual PRs.

## 5. Entry/auth implementation

Shared presentation component: `frontend/src/components/auth/AuthShell.tsx`  
Shared styles: `frontend/src/components/auth/auth-shell.css`

Role accents are presentation-only:

- Student: sky/blue
- Teacher: brand blue
- Parent: green
- Administrator: amber

All login/register pages retain their existing handlers and endpoint calls.

## 6. Interaction issues discovered during visual review

These are **not** part of the visual branch:

1. Student course code is verified in `StudentCourseLogin`, then verified again in `StudentRegister`. This is a workflow/API-state concern and should be reviewed in a dedicated PR.
2. `StudentRegister` has no explicit verification-loading state. While `courseInfo` is still null, the current conditional can render the invalid-access state before verification completes. This should be fixed in the same dedicated logic PR.
3. `CourseDetail` clears its shared loading flag when only the assignment request finishes, while course detail/check-ins/scales/questionnaires/composites are still loading independently. A slow course-detail request can therefore transiently render the unavailable-course branch.
4. `CourseDetail` requests course scales and stores them in `scales`, but the current course-detail UI never renders a scale tab or consumes that state. Review whether this is an unnecessary request or a missing course-scale entry.
5. `CourseDetail` counts incomplete check-ins through `checkin.submission` but labels the row action through `checkin.submitted`. The two state fields should be reconciled against the API contract.
6. A completed questionnaire inside `CourseDetail` labels its action “查看报告” but still navigates to `/student/questionnaires/:id`; this differs from the standalone questionnaire list, which resolves a completed assessment to its result route. Confirm the intended destination before changing it.
7. The Student Home “加入课程” dialog does not currently implement a complete modal focus/keyboard contract (focus trap / Escape close / focus return). Treat this as an interaction-accessibility PR rather than a visual-only change.
8. `AssignmentSubmit` and `CheckinSubmit` still use native `alert()` for several upload/submission success and failure states. Replace these with in-page status presentation in a dedicated interaction PR so retry/idempotency behavior remains unchanged.
9. `CheckinSubmit` image preview is a custom full-screen overlay without a complete dialog accessibility contract (dialog semantics, focus trap, Escape close, focus return). Handle this together with the Student Home modal work.

## 7. Visual acceptance checklist

Every migrated family must be checked at representative widths around 390px, 768px, and 1440px.

- No clipped primary text or controls.
- No page-level horizontal overflow.
- Primary actions remain visible and at least 44px high.
- Focus states are visible.
- Error/loading/success states use the same visual language as the normal page.
- Route, API, auth, validation, and submission semantics are unchanged.
- Mobile presentation is intentionally composed, not merely a scaled-down desktop layout.


## 8. Runner / submit / report visual convergence

The Modern Education visual layer now distinguishes three route-level presentation families:

- `hui-app--assessment-runner`: focused Scale / Questionnaire / Cognitive / Situational / Composite runners.
- `hui-app--student-submit`: assignment and check-in submission surfaces.
- `hui-app--report-surface`: student result/report surfaces.

The shared stylesheet is `frontend/src/components/assessment-ui/assessment-ui.css`.

Runner rules deliberately preserve task-owned stimulus geometry and timing semantics. Mobile changes are limited to shell spacing, non-stimulus card layout, navigation/control target sizes, safe-area handling, and legacy questionnaire/composite container composition.

Report rules stack multi-column facts/metrics on mobile, constrain media to the viewport, provide local horizontal overflow for tables, and keep scientific/report wording untouched.

QuestionnaireResult now uses the same `ReportShell` presentation frame as Scale, Situational and Composite reports; its API request and unit-report payloads are unchanged.

Foundation PR merge policy: because this branch also changes TSX and CI routing, it requires the normal full platform gate before merge.
