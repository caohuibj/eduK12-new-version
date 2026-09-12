# Frontend route inventory

Generated from `frontend/src/App.tsx` by `npm run inventory:product-ui`. 86 explicit routes, including fallback. This is an inventory, not a new routing manifest or authorization source. Conditional feature registration is recorded separately from access guards. Page-level/API authorization still applies to unguarded routes. Target/owner are planning classifications; verify them during each migration.

| Path | Page | Route access | Registration | Current shell | Target mode | Owner | Evidence/status |
|---|---|---|---|---|---|---|---|
| / | Portal | Guest; signed-in redirect | — | Page-owned / bare | public | FE-02 | Inventory only; not migrated |
| /admin/login | AdminLogin | Public / unguarded | — | Page-owned / bare | public | FE-02 | Inventory only; not migrated |
| /teacher/login | TeacherLogin | Public / unguarded | — | Page-owned / bare | public | FE-02 | Inventory only; not migrated |
| /teacher/register | TeacherRegister | Public / unguarded | — | Page-owned / bare | public | FE-02 | Inventory only; not migrated |
| /teacher/account-login | TeacherAccountLogin | Public / unguarded | — | Page-owned / bare | public | FE-02 | Inventory only; not migrated |
| /student/login | StudentLogin | Public / unguarded | — | Page-owned / bare | public | FE-02 | Inventory only; not migrated |
| /student/course-login | StudentCourseLogin | Public / unguarded | — | Page-owned / bare | public | FE-02 | Inventory only; not migrated |
| /student/register | StudentRegister | Public / unguarded | — | Page-owned / bare | public | FE-02 | Inventory only; not migrated |
| /dashboard | CourseList | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /courses | CourseList | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /courses/:courseId/students | CourseStudents | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /courses/:courseId/detail | TeacherCourseDetail | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /students | StudentManagement | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /assignments | AssignmentList | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /checkins | CheckinList | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /scales | ScaleList | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /scales/:id | ScaleEdit | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /questionnaires | QuestionnaireList | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /questionnaires/:id | QuestionnaireEdit | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /general-questionnaires | GeneralQuestionnaireList | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /general-questionnaires/create | GeneralQuestionnaireCreate | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /general-questionnaires/:id/edit | GeneralQuestionnaireEdit | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /composite-assessments | CompositeAssessmentList | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-09 | Inventory only; not migrated |
| /composite-assessments/:id/results | CompositeAssessmentResults | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-09 | Inventory only; not migrated |
| /composite-assessments/:id/attempts/:attemptId/report | CompositeReportPage | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-09 | Inventory only; not migrated |
| /composite-assessments/:id | CompositeAssessmentEdit | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-09 | Inventory only; not migrated |
| /cognitive-assignments | CognitiveAssignmentList | TEACHER / ADMIN | Cognitive capability | Layout | standard | FE-02 + FE-07A/B | Inventory only; not migrated |
| /cognitive-assignments/:id | CognitiveAssignmentEdit | TEACHER / ADMIN | Cognitive capability | Layout | standard | FE-02 + FE-07A/B | Inventory only; not migrated |
| /teacher/classrooms | ClassroomList | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /teacher/classrooms/create | ClassroomCreate | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /teacher/classrooms/:id/control | ClassroomControl | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /teacher/classrooms/:id/edit | ClassroomEdit | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /teacher/classrooms/:id/qrcode | ClassroomQRCode | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /teacher/classrooms/:id/questions | ClassroomQuestionEdit | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /videos | VideoLibrary | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /images | ImageLibrary | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /documents | DocumentLibrary | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /users | UserList | ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /teacher-codes | TeacherCodeList | ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /admin/material-grants | MaterialGrants | ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /admin/instrument-authorizations | InstrumentAuthorization | ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /profile | TeacherProfile | TEACHER / ADMIN | — | Layout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /scale-library | ScaleLibrary | STUDENT / TEACHER / ADMIN | — | Role layout | standard | FE-02 + FE-03C | Inventory only; not migrated |
| /scale-library/:instrumentKey/:instrumentVersion | ScaleLibrary | STUDENT / TEACHER / ADMIN | — | Role layout | standard | FE-02 + FE-03C | Inventory only; not migrated |
| /student | StudentHome | STUDENT | — | StudentLayout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /student/classroom/enter | ClassroomEnter | Optional student / guest | — | StudentLayout or bare | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /student/courses/:courseId | CourseDetail | STUDENT | — | StudentLayout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /student/assignments/:assignmentId | AssignmentSubmit | STUDENT | — | StudentLayout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /student/assignments | StudentAssignments | STUDENT | — | StudentLayout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /student/checkins | StudentCheckins | STUDENT | — | StudentLayout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /student/checkins/:checkinId | CheckinSubmit | STUDENT | — | StudentLayout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /student/profile | StudentProfile | STUDENT | — | StudentLayout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /student/situational | SituationalHome | STUDENT | — | StudentLayout | standard | FE-02 + FE-06 | Inventory only; not migrated |
| /student/situational/history | SituationalHistory | STUDENT | — | StudentLayout | standard | FE-02 + FE-06 | Inventory only; not migrated |
| /student/situational/:instrumentKey | SituationalRunner | STUDENT | — | StudentLayout | focused | FE-02 + FE-06 | Inventory only; not migrated |
| /student/situational/attempts/:attemptId/result | SituationalResult | STUDENT | — | StudentLayout | standard | FE-02 + FE-06 | Inventory only; not migrated |
| /student/composite/situational/:attemptId | SituationalRunner | STUDENT | — | StudentLayout | focused | FE-02 + FE-06 | Inventory only; not migrated |
| /student/scales | StudentScales | STUDENT | — | StudentLayout | standard | FE-02 + FE-03C | Inventory only; not migrated |
| /student/scales/:scaleId | ScaleAssessment | STUDENT | — | StudentLayout | focused | FE-02 + FE-03C | Inventory only; not migrated |
| /student/scales/result/:assessmentId | ScaleResult | STUDENT | — | StudentLayout | standard | FE-02 + FE-05 | Inventory only; not migrated |
| /student/questionnaires | StudentQuestionnaires | STUDENT | — | StudentLayout | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /student/questionnaires/:questionnaireId | QuestionnaireAssessment | STUDENT | — | StudentLayout | focused | FE-02 + FE-08 | Inventory only; not migrated |
| /student/questionnaires/result/:assessmentId | QuestionnaireResult | STUDENT | — | StudentLayout | standard | FE-02 + FE-05 | Inventory only; not migrated |
| /student/classroom/join/:code | ClassroomJoin | Optional student / guest | — | StudentLayout or bare | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /student/classroom/answer/:classroomId | ClassroomAnswer | Optional student / guest | — | StudentLayout or bare | standard | FE-02 + FE-10 | Inventory only; not migrated |
| /student/composite/:assessmentId | CompositeAssessmentPage | STUDENT | — | StudentLayout | focused | FE-02 + FE-09 | Inventory only; not migrated |
| /student/composite/attempts/:attemptId | CompositeAssessmentPage | STUDENT | — | StudentLayout | focused | FE-02 + FE-09 | Inventory only; not migrated |
| /student/composite/attempts/:attemptId/report | CompositeReportPage | STUDENT | — | StudentLayout | standard | FE-02 + FE-09 | Inventory only; not migrated |
| /student/cognitive | CognitiveHome | STUDENT | Cognitive capability | StudentLayout | standard | FE-02 + FE-07A/B | Inventory only; not migrated |
| /student/cognitive/assignments/:assignmentId | CognitiveAssignmentEntry | STUDENT | Cognitive capability | StudentLayout | standard | FE-02 + FE-07A/B | Inventory only; not migrated |
| /student/cognitive/history | CognitiveHistory | STUDENT | Cognitive capability | StudentLayout | standard | FE-02 + FE-07A/B | Inventory only; not migrated |
| /student/cognitive/sessions/:sessionId | CognitiveRunner | STUDENT | Cognitive capability | StudentLayout | focused | FE-02 + FE-07A/B | Inventory only; not migrated |
| /student/cognitive/sessions/:sessionId/result | CognitiveResult | STUDENT | Cognitive capability | StudentLayout | standard | FE-02 + FE-07A/B | Inventory only; not migrated |
| /public/cognitive/assignments/:token | PublicCognitiveAssignment | Public / unguarded | Cognitive capability | Page-owned / bare | public | FE-02 + FE-07A/B | Inventory only; not migrated |
| /public/cognitive/sessions/:sessionId | CognitiveRunner | Public / unguarded | Cognitive capability | Page-owned / bare | focused | FE-02 + FE-07A/B | Inventory only; not migrated |
| /public/cognitive/sessions/:sessionId/result | CognitiveResult | Public / unguarded | Cognitive capability | Page-owned / bare | public | FE-02 + FE-07A/B | Inventory only; not migrated |
| /public/composite/situational/:attemptId | SituationalRunner | Public / unguarded | — | Page-owned / bare | focused | FE-02 + FE-06 | Inventory only; not migrated |
| /public/composite/:token | CompositeAssessmentPage | Public / unguarded | — | Page-owned / bare | focused | FE-02 + FE-09 | Inventory only; not migrated |
| /public/composite/attempts/:attemptId | CompositeAssessmentPage | Public / unguarded | — | Page-owned / bare | focused | FE-02 + FE-09 | Inventory only; not migrated |
| /public/composite/attempts/:attemptId/report | CompositeReportPage | Public / unguarded | — | Page-owned / bare | public | FE-02 + FE-09 | Inventory only; not migrated |
| /public/questionnaire/:token | PublicQuestionnaire | Public / unguarded | — | Page-owned / bare | public | FE-02 + FE-08 | Inventory only; not migrated |
| /public/questionnaire/:token/assessment | PublicQuestionnaireAssessment | Public / unguarded | — | Page-owned / bare | focused | FE-02 + FE-08 | Inventory only; not migrated |
| /public/questionnaire/:token/result | PublicQuestionnaireResult | Public / unguarded | — | Page-owned / bare | public | FE-02 + FE-08 | Inventory only; not migrated |
| /public/checkin/:token | PublicCheckin | Public / unguarded | — | Page-owned / bare | public | FE-02 + FE-10 | Inventory only; not migrated |
| /bigscreen/:classroomId | BigScreen | Public / unguarded | — | Page-owned / bare | Dedicated display | FE-02 + FE-10 | Inventory only; not migrated |
| * | Navigate | Public / unguarded | — | Page-owned / bare | Not-found / redirect decision | FE-02 | Inventory only; not migrated |

## Additional boundaries

- FirstLoginPasswordChange is an inline guard flow, not a separate route. FE-02 owns its focus/error and authenticated return behavior.
- Parent ObserverSelfServe and Teacher ObserverAssign exist but are not registered in App.tsx. Do not declare a working Parent journey from component existence.
- User roles are currently STUDENT / TEACHER / ADMIN; researcher report projection is not a new frontend login role.
- Public Cognitive runner currently also uses a public query parameter; FE-02 must reconcile route and client authority.
- Bundle child runners retain parent/unit identifiers; focused mode must not create a second shell or attempt.
- BigScreen retains its dedicated presentation layout. Classroom/assignment/check-in business protocols are outside this convergence change.
- Non-route components and legacy branches are not declared dead code by this inventory.
