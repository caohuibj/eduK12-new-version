# Huisurvey Modern Education — Staff Workspace

Stack base: PR #180 Modern Education foundation.

## Presentation scope

The existing StaffNavigation / staff-ui interaction primitives are retained and visually converged:

- grouped/searchable dark navigation
- PageHeader hierarchy
- staff toolbar/search/segmented controls
- course/catalog cards
- staff and legacy tables
- detail/profile surfaces
- staff dialogs and legacy fixed overlays
- sticky action footer
- Ant Design management/editor compatibility

Responsive intent:

- Desktop: productivity-first persistent navigation and dense management UI.
- Tablet: collapsed navigation, two-column card layouts where appropriate, local table scrolling.
- Mobile: single-column toolbars/cards, full-width page actions, bottom-sheet-like legacy modals, safe-area-aware sticky actions, local table scrolling rather than page-level overflow.

## Interaction / logic findings excluded from the visual PR

1. Staff confirmation UX is not fully converged. Several pages still use browser-native/global `confirm()` or older confirmation flows while newer pages use `useStaffFeedback`. Confirmed examples include `ClassroomList`, `CognitiveAssignmentEdit`, `CompositeAssessmentEdit`, `ClassroomQuestionEdit`, `GeneralQuestionnaireEdit`, and `MaterialGrants`.
2. `TeacherCourseDetail` uses a partial-loading pattern: the assignment request ends the shared loading state while the course/check-in/questionnaire requests are independent. A slow course-detail response can transiently produce an unavailable-course state.
3. `TeacherCourseDetail` defines `scales` and `fetchScales` but does not call the fetcher or render the scale state. Confirm whether the course detail intentionally omits scale management or whether this is dead/incomplete logic.
