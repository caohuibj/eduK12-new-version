# Frontend route inventory

Generated from `frontend/src/App.tsx` plus nested `OrganizationProductRoutes.tsx` by `npm run inventory:product-ui`. 106 explicit routes, including fallback. This is an inventory, not a new routing manifest or authorization source. Conditional feature registration is recorded separately from access guards. Page-level/API authorization still applies to unguarded routes. Target/owner are planning classifications; verify them during each migration.

| Path | Page | Route access | Registration | Current shell | Target mode | Owner | Evidence/status |
|---|---|---|---|---|---|---|---|
| / | Portal | Guest; signed-in redirect | — | AppShell (outside guards) | public | FE-02 | FE-02 chrome; domain UI retained |
| /admin/login | AdminLogin | Public / unguarded | — | AppShell (outside guards) | public | FE-02 | FE-02 chrome; domain UI retained |
| /teacher/login | TeacherLogin | Public / unguarded | — | AppShell (outside guards) | public | FE-02 | FE-02 chrome; domain UI retained |
| /teacher/register | TeacherRegister | Public / unguarded | — | AppShell (outside guards) | public | FE-02 | FE-02 chrome; domain UI retained |
| /teacher/account-login | TeacherAccountLogin | Public / unguarded | — | AppShell (outside guards) | public | FE-02 | FE-02 chrome; domain UI retained |
| /parent/login | ParentLogin | Public / unguarded | — | AppShell (outside guards) | public | FE-02 | FE-02 chrome; domain UI retained |
| /student/login | StudentLogin | Public / unguarded | — | AppShell (outside guards) | public | FE-02 | FE-02 chrome; domain UI retained |
| /student/course-login | StudentCourseLogin | Public / unguarded | — | AppShell (outside guards) | public | FE-02 | FE-02 chrome; domain UI retained |
| /student/register | StudentRegister | Public / unguarded | — | AppShell (outside guards) | public | FE-02 | FE-02 chrome; domain UI retained |
| /parent | ParentHome | PARENT | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /relational/tasks | RelationalTasksPage | STUDENT / PARENT / TEACHER | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /relational/attempts/:attemptId | CompositeAssessmentPage | Authenticated; exact server resource authority | — | AppShell (outside guards) | focused | FE-02 + FE-09 | FE-02 chrome; domain UI retained |
| /relational/attempts/:attemptId/report | CompositeReportPage | Authenticated; exact server resource authority | — | AppShell (outside guards) | standard | FE-02 + FE-09 | FE-02 chrome; domain UI retained |
| /relational/composite/situational/:attemptId | SituationalRunner | Authenticated; exact server resource authority | — | AppShell (outside guards) | focused | FE-02 + FE-06 | FE-02 chrome; domain UI retained |
| /dashboard | CourseList | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /courses | CourseList | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /courses/:courseId/students | CourseStudents | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /courses/:courseId/detail | TeacherCourseDetail | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /students | StudentManagement | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /assignments | AssignmentList | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /checkins | CheckinList | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /scales | ScaleList | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /scales/:id | ScaleEdit | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /questionnaires | QuestionnaireProductList | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /questionnaires/legacy | QuestionnaireList | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /questionnaire-products/:id | QuestionnaireProductEdit | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /questionnaires/:id | QuestionnaireEdit | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /general-questionnaires | GeneralQuestionnaireList | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /general-questionnaires/create | GeneralQuestionnaireCreate | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /general-questionnaires/:id/edit | GeneralQuestionnaireEdit | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /bundle-products | BundleProducts | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /bundle-products/:id | BundleProductDetail | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /composite-assessments | CompositeAssessmentList | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-09 | FE-02 chrome; domain UI retained |
| /composite-assessments/:id/results | CompositeAssessmentResults | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-09 | FE-02 chrome; domain UI retained |
| /composite-assessments/:id/attempts/:attemptId/report | CompositeReportPage | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-09 | FE-02 chrome; domain UI retained |
| /composite-assessments/:id | CompositeAssessmentEdit | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-09 | FE-02 chrome; domain UI retained |
| /cognitive-assignments | CognitiveAssignmentList | TEACHER / ADMIN | Cognitive capability | AppShell (outside guards) | standard | FE-02 + FE-07A/B | FE-02 chrome; domain UI retained |
| /cognitive-assignments/:id | CognitiveAssignmentEdit | TEACHER / ADMIN | Cognitive capability | AppShell (outside guards) | standard | FE-02 + FE-07A/B | FE-02 chrome; domain UI retained |
| /teacher/classrooms | ClassroomList | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /teacher/classrooms/create | ClassroomCreate | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /teacher/classrooms/:id/control | ClassroomControl | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /teacher/classrooms/:id/edit | ClassroomEdit | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /teacher/classrooms/:id/qrcode | ClassroomQRCode | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /teacher/classrooms/:id/questions | ClassroomQuestionEdit | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /videos | VideoLibrary | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /images | ImageLibrary | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /documents | DocumentLibrary | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /users | UserList | ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /teacher-codes | TeacherCodeList | ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /admin/material-grants | MaterialGrants | ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /admin/instrument-authorizations | InstrumentAuthorization | ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /profile | TeacherProfile | TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /scale-library | ScaleLibrary | STUDENT / TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-03C | FE-02 chrome; domain UI retained |
| /scale-library/:instrumentKey/:instrumentVersion | ScaleLibrary | STUDENT / TEACHER / ADMIN | — | AppShell (outside guards) | standard | FE-02 + FE-03C | FE-02 chrome; domain UI retained |
| /student | StudentHome | STUDENT | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /student/classroom/enter | ClassroomEnter | Optional student / guest | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /student/courses/:courseId | CourseDetail | STUDENT | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /student/assignments/:assignmentId | AssignmentSubmit | STUDENT | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /student/assignments | StudentAssignments | STUDENT | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /student/checkins | StudentCheckins | STUDENT | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /student/checkins/:checkinId | CheckinSubmit | STUDENT | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /student/profile | StudentProfile | STUDENT | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /student/situational | SituationalHome | STUDENT | — | AppShell (outside guards) | standard | FE-02 + FE-06 | FE-02 chrome; domain UI retained |
| /student/situational/history | SituationalHistory | STUDENT | — | AppShell (outside guards) | standard | FE-02 + FE-06 | FE-02 chrome; domain UI retained |
| /student/situational/:instrumentKey | SituationalRunner | STUDENT | — | AppShell (outside guards) | focused | FE-02 + FE-06 | FE-02 chrome; domain UI retained |
| /student/situational/attempts/:attemptId/result | SituationalResult | STUDENT | — | AppShell (outside guards) | standard | FE-02 + FE-06 | FE-02 chrome; domain UI retained |
| /student/composite/situational/:attemptId | SituationalRunner | STUDENT | — | AppShell (outside guards) | focused | FE-02 + FE-06 | FE-02 chrome; domain UI retained |
| /student/scales | StudentScales | STUDENT | — | AppShell (outside guards) | standard | FE-02 + FE-03C | FE-02 chrome; domain UI retained |
| /student/scales/:scaleId | ScaleAssessment | STUDENT | — | AppShell (outside guards) | focused | FE-02 + FE-03C | FE-02 chrome; domain UI retained |
| /student/scales/result/:assessmentId | ScaleResult | STUDENT | — | AppShell (outside guards) | standard | FE-02 + FE-05 | FE-02 chrome; domain UI retained |
| /student/questionnaires | StudentQuestionnaires | STUDENT | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /student/questionnaires/:questionnaireId | QuestionnaireAssessment | STUDENT | — | AppShell (outside guards) | focused | FE-02 + FE-08 | FE-02 chrome; domain UI retained |
| /student/questionnaires/result/:assessmentId | QuestionnaireResult | STUDENT | — | AppShell (outside guards) | standard | FE-02 + FE-05 | FE-02 chrome; domain UI retained |
| /student/classroom/join/:code | ClassroomJoin | Optional student / guest | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /student/classroom/answer/:classroomId | ClassroomAnswer | Optional student / guest | — | AppShell (outside guards) | standard | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /student/composite/:assessmentId | CompositeAssessmentPage | STUDENT | — | AppShell (outside guards) | focused | FE-02 + FE-09 | FE-02 chrome; domain UI retained |
| /student/composite/attempts/:attemptId | CompositeAssessmentPage | STUDENT | — | AppShell (outside guards) | focused | FE-02 + FE-09 | FE-02 chrome; domain UI retained |
| /student/composite/attempts/:attemptId/report | CompositeReportPage | STUDENT | — | AppShell (outside guards) | standard | FE-02 + FE-09 | FE-02 chrome; domain UI retained |
| /student/cognitive | CognitiveHome | STUDENT | Cognitive capability | AppShell (outside guards) | standard | FE-02 + FE-07A/B | FE-02 chrome; domain UI retained |
| /student/cognitive/assignments/:assignmentId | CognitiveAssignmentEntry | STUDENT | Cognitive capability | AppShell (outside guards) | standard | FE-02 + FE-07A/B | FE-02 chrome; domain UI retained |
| /student/cognitive/history | CognitiveHistory | STUDENT | Cognitive capability | AppShell (outside guards) | standard | FE-02 + FE-07A/B | FE-02 chrome; domain UI retained |
| /student/cognitive/sessions/:sessionId | CognitiveRunner | STUDENT | Cognitive capability | AppShell (outside guards) | focused | FE-02 + FE-07A/B | FE-02 chrome; domain UI retained |
| /student/cognitive/sessions/:sessionId/result | CognitiveResult | STUDENT | Cognitive capability | AppShell (outside guards) | standard | FE-02 + FE-07A/B | FE-02 chrome; domain UI retained |
| /relational/cognitive/sessions/:sessionId | CognitiveRunner | Authenticated; exact server resource authority | Cognitive capability | AppShell (outside guards) | focused | FE-02 + FE-07A/B | FE-02 chrome; domain UI retained |
| /public/cognitive/assignments/:token | PublicCognitiveAssignment | Public / unguarded | Cognitive capability | AppShell (outside guards) | public | FE-02 + FE-07A/B | FE-02 chrome; domain UI retained |
| /public/cognitive/sessions/:sessionId | CognitiveRunner | Public / unguarded | Cognitive capability | AppShell (outside guards) | focused | FE-02 + FE-07A/B | FE-02 chrome; domain UI retained |
| /public/cognitive/sessions/:sessionId/result | CognitiveResult | Public / unguarded | Cognitive capability | AppShell (outside guards) | public | FE-02 + FE-07A/B | FE-02 chrome; domain UI retained |
| /public/composite/situational/:attemptId | SituationalRunner | Public / unguarded | — | AppShell (outside guards) | focused | FE-02 + FE-06 | FE-02 chrome; domain UI retained |
| /public/composite/:token | CompositeAssessmentPage | Public / unguarded | — | AppShell (outside guards) | focused | FE-02 + FE-09 | FE-02 chrome; domain UI retained |
| /public/composite/attempts/:attemptId | CompositeAssessmentPage | Public / unguarded | — | AppShell (outside guards) | focused | FE-02 + FE-09 | FE-02 chrome; domain UI retained |
| /public/composite/attempts/:attemptId/report | CompositeReportPage | Public / unguarded | — | AppShell (outside guards) | public | FE-02 + FE-09 | FE-02 chrome; domain UI retained |
| /public/questionnaire/:token | PublicQuestionnaire | Public / unguarded | — | AppShell (outside guards) | public | FE-02 + FE-08 | FE-02 chrome; domain UI retained |
| /public/questionnaire/:token/assessment | PublicQuestionnaireAssessment | Public / unguarded | — | AppShell (outside guards) | focused | FE-02 + FE-08 | FE-02 chrome; domain UI retained |
| /public/questionnaire/:token/result | PublicQuestionnaireResult | Public / unguarded | — | AppShell (outside guards) | public | FE-02 + FE-08 | FE-02 chrome; domain UI retained |
| /public/checkin/:token | PublicCheckin | Public / unguarded | — | AppShell (outside guards) | public | FE-02 + FE-10 | FE-02 chrome; domain UI retained |
| /bigscreen/:classroomId | BigScreen | Public / unguarded | — | Dedicated display | Dedicated display | FE-02 + FE-10 | Dedicated mode retained |
| * | ProductPage | Public / unguarded | — | AppShell (outside guards) | Not-found / redirect decision | FE-02 | FE-02 chrome; domain UI retained |

| /organizations | OrganizationIndexPage | Authenticated in page; server Organization/assignment authority | — | AppShell (outside guards) | standard | FE-02 + FE-10 | Staff UI chrome; server authority retained |
| /organizations/new | OrganizationCreatePage | Authenticated in page; server Organization/assignment authority | — | AppShell (outside guards) | standard | FE-02 + FE-10 | Staff UI chrome; server authority retained |
| /organization-tasks | OrganizationTasksPage | Authenticated in page; server Organization/assignment authority | — | AppShell (outside guards) | standard | FE-02 + FE-10 | Staff UI chrome; server authority retained |
| /organizations/:organizationId | OrganizationAdminPage | Authenticated in page; server Organization/assignment authority | — | AppShell (outside guards) | standard | FE-02 + FE-10 | Staff UI chrome; server authority retained |
| /organizations/:organizationId/runs | OrganizationRunListPage | Authenticated in page; server Organization/assignment authority | — | AppShell (outside guards) | standard | FE-02 + FE-10 | Staff UI chrome; server authority retained |
| /organizations/:organizationId/runs/:runId | OrganizationRunDetailPage | Authenticated in page; server Organization/assignment authority | — | AppShell (outside guards) | standard | FE-02 + FE-10 | Staff UI chrome; server authority retained |
| /organizations/:organizationId/reporting | OrganizationReportingPage | Authenticated in page; server Organization/assignment authority | — | AppShell (outside guards) | standard | FE-02 + FE-10 | Staff UI chrome; server authority retained |
| /organizations/:organizationId/delivery | OrganizationDeliveryPage | Authenticated in page; server Organization/assignment authority | — | AppShell (outside guards) | standard | FE-02 + FE-10 | Staff UI chrome; server authority retained |
| /organizations/:organizationId/* | OrganizationNotFound | Authenticated in page; server Organization/assignment authority | — | AppShell (outside guards) | standard | FE-02 + FE-10 | Staff UI chrome; server authority retained |

## Additional boundaries

- FirstLoginPasswordChange remains an inline guard flow. FE-02 preserves the original destination through reauthentication.
- Parent login/home are explicitly registered with a PARENT-only route guard. Legacy relational task discovery retains its STUDENT / PARENT / TEACHER guard. Shared exact runtime/report routes accept authenticated sessions and enforce resource ownership on the server, including frozen Organization respondents whose legacy role is ADMIN.
- User roles are STUDENT / TEACHER / ADMIN / PARENT; researcher report projection is not a new frontend login role.
- Public Cognitive access now follows the route namespace; legacy public query parameters remain compatible but do not select the client.
- Bundle child runners retain parent/unit identifiers; focused mode must not create a second shell or attempt.
- BigScreen retains its dedicated presentation layout. Classroom/assignment/check-in business protocols are outside this convergence change.
- Nested Organization routes are included as an audit projection; AppShell and server authority remain the routing/access sources of truth.
- Non-route components and legacy branches are not declared dead code by this inventory.
