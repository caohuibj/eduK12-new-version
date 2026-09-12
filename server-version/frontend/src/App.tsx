import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { CapabilitiesProvider, useCapabilities } from './contexts/CapabilitiesContext'
import AppShell from './components/app-shell/AppShell'
import { ProductButton, ProductPage, ProductStatus } from './components/product-ui'
import { RouteAccess, RouteLoading } from './components/app-shell/RouteAccess'

// Portal & Auth Pages
import Portal from './pages/Portal'
import AdminLogin from './pages/AdminLogin'
import TeacherLogin from './pages/TeacherLogin'
import TeacherRegister from './pages/TeacherRegister'
import TeacherAccountLogin from './pages/TeacherAccountLogin'
import StudentLogin from './pages/StudentLogin'
import StudentCourseLogin from './pages/StudentCourseLogin'
import StudentRegister from './pages/student/StudentRegister'

// Admin/Teacher Pages
const CourseList = React.lazy(() => import('./pages/CourseList'))
const CourseStudents = React.lazy(() => import('./pages/CourseStudents'))
const StudentManagement = React.lazy(() => import('./pages/StudentManagement'))
const AssignmentList = React.lazy(() => import('./pages/AssignmentList'))
const CheckinList = React.lazy(() => import('./pages/CheckinList'))
const VideoLibrary = React.lazy(() => import('./pages/VideoLibrary'))
const ImageLibrary = React.lazy(() => import('./pages/ImageLibrary'))
const DocumentLibrary = React.lazy(() => import('./pages/DocumentLibrary'))
const UserList = React.lazy(() => import('./pages/UserList'))
const TeacherCodeList = React.lazy(() => import('./pages/TeacherCodeList'))
const MaterialGrants = React.lazy(() => import('./pages/admin/MaterialGrants'))
const InstrumentAuthorization = React.lazy(() => import('./pages/admin/InstrumentAuthorization'))
const TeacherProfile = React.lazy(() => import('./pages/teacher/TeacherProfile'))
const ScaleList = React.lazy(() => import('./pages/ScaleList'))
const ScaleEdit = React.lazy(() => import('./pages/ScaleEdit'))
const ScaleLibrary = React.lazy(() => import('./pages/ScaleLibrary'))
const QuestionnaireList = React.lazy(() => import('./pages/QuestionnaireList'))
const QuestionnaireEdit = React.lazy(() => import('./pages/QuestionnaireEdit'))
const TeacherCourseDetail = React.lazy(() => import('./pages/teacher/TeacherCourseDetail'))
const GeneralQuestionnaireList = React.lazy(() => import('./pages/teacher/GeneralQuestionnaireList'))
const GeneralQuestionnaireCreate = React.lazy(() => import('./pages/teacher/GeneralQuestionnaireCreate'))
const GeneralQuestionnaireEdit = React.lazy(() => import('./pages/teacher/GeneralQuestionnaireEdit'))
const ClassroomList = React.lazy(() => import('./pages/teacher/ClassroomList'))
const ClassroomControl = React.lazy(() => import('./pages/teacher/ClassroomControl'))
const ClassroomCreate = React.lazy(() => import('./pages/teacher/ClassroomCreate'))
const ClassroomEdit = React.lazy(() => import('./pages/teacher/ClassroomEdit'))
const ClassroomQRCode = React.lazy(() => import('./pages/teacher/ClassroomQRCode'))
const ClassroomQuestionEdit = React.lazy(() => import('./pages/teacher/ClassroomQuestionEdit'))
const CompositeAssessmentList = React.lazy(() => import('./pages/teacher/CompositeAssessmentList'))
const CompositeAssessmentEdit = React.lazy(() => import('./pages/teacher/CompositeAssessmentEdit'))
const CompositeAssessmentResults = React.lazy(() => import('./pages/teacher/CompositeAssessmentResults'))
const CognitiveAssignmentList = React.lazy(() => import('./pages/teacher/CognitiveAssignmentList'))
const CognitiveAssignmentEdit = React.lazy(() => import('./pages/teacher/CognitiveAssignmentEdit'))

// Public Pages
const PublicQuestionnaire = React.lazy(() => import('./pages/public/PublicQuestionnaire'))
const PublicQuestionnaireAssessment = React.lazy(() => import('./pages/public/PublicQuestionnaireAssessment'))
const PublicQuestionnaireResult = React.lazy(() => import('./pages/public/PublicQuestionnaireResult'))
const PublicCheckin = React.lazy(() => import('./pages/public/PublicCheckin'))

// Student Pages
const StudentHome = React.lazy(() => import('./pages/student/StudentHome'))
const CourseDetail = React.lazy(() => import('./pages/student/CourseDetail'))
const AssignmentSubmit = React.lazy(() => import('./pages/student/AssignmentSubmit'))
const CheckinSubmit = React.lazy(() => import('./pages/student/CheckinSubmit'))
const StudentCheckins = React.lazy(() => import('./pages/student/StudentCheckins'))
const StudentAssignments = React.lazy(() => import('./pages/student/StudentAssignments'))
const StudentProfile = React.lazy(() => import('./pages/student/StudentProfile'))
const SituationalHome = React.lazy(() => import('./modules/situational/pages/SituationalHome'))
const SituationalRunner = React.lazy(() => import('./modules/situational/pages/SituationalRunner'))
const SituationalResult = React.lazy(() => import('./modules/situational/pages/SituationalResult'))
const SituationalHistory = React.lazy(() => import('./modules/situational/pages/SituationalHistory'))
const StudentScales = React.lazy(() => import('./pages/student/StudentScales'))
const ScaleAssessment = React.lazy(() => import('./pages/student/ScaleAssessment'))
const ScaleResult = React.lazy(() => import('./pages/student/ScaleResult'))
const StudentQuestionnaires = React.lazy(() => import('./pages/student/StudentQuestionnaires'))
const QuestionnaireAssessment = React.lazy(() => import('./pages/student/QuestionnaireAssessment'))
const QuestionnaireResult = React.lazy(() => import('./pages/student/QuestionnaireResult'))
const ClassroomJoin = React.lazy(() => import('./pages/student/ClassroomJoin'))
const ClassroomAnswer = React.lazy(() => import('./pages/student/ClassroomAnswer'))
const ClassroomEnter = React.lazy(() => import('./pages/student/ClassroomEnter'))
const CompositeAssessmentPage = React.lazy(() => import('./modules/composite/CompositeAssessmentPage'))
const CompositeReportPage = React.lazy(() => import('./modules/composite/CompositeReportPage'))

// Cognitive 页面（Stage B：URL 以 Assignment/Session 为核心；flag=false 时不注册 → 隐藏入口）
const CognitiveHome = React.lazy(() => import('./modules/cognitive/pages/CognitiveHome'))
const CognitiveAssignmentEntry = React.lazy(() => import('./modules/cognitive/pages/CognitiveAssignmentEntry'))
const CognitiveRunner = React.lazy(() => import('./modules/cognitive/pages/CognitiveRunner'))
const CognitiveResult = React.lazy(() => import('./modules/cognitive/pages/CognitiveResult'))
const CognitiveHistory = React.lazy(() => import('./modules/cognitive/pages/CognitiveHistory'))
const PublicCognitiveAssignment = React.lazy(() => import('./modules/cognitive/pages/PublicCognitiveAssignment'))


// BigScreen Pages
const BigScreen = React.lazy(() => import('./pages/bigscreen/BigScreen'))

class RouteErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: '' }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : '页面暂时无法加载',
    }
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('路由渲染错误', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <ProductPage><ProductStatus kind="error" title="页面加载失败" announce="assertive" actions={<><ProductButton onClick={() => window.location.reload()}>重新加载页面</ProductButton> <Link to="/">返回入口</Link></>}>暂时无法显示此页面。本机草稿不会被清除，请重新加载后按页面提示恢复。</ProductStatus></ProductPage>
    )
  }
}

// Guards decide access only; AppShell owns chrome outside the route tree.
const ProtectedRoute: React.FC<{ children: React.ReactNode; roles?: ('STUDENT' | 'TEACHER' | 'ADMIN')[] }> = ({ children, roles = ['TEACHER', 'ADMIN'] }) => <RouteAccess roles={roles}>{children}</RouteAccess>
const StudentProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => <RouteAccess roles={['STUDENT']}>{children}</RouteAccess>
const ScaleLibraryRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => <RouteAccess roles={['STUDENT', 'TEACHER', 'ADMIN']}>{children}</RouteAccess>
const OptionalStudentRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoading } = useAuth()
  return isLoading ? <RouteLoading /> : <>{children}</>
}

// Entry Route - for portal page (redirect if authenticated)
const EntryRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user, isLoading } = useAuth()

  if (isLoading) {
    return <RouteLoading />
  }

  // 已登录用户跳转到对应首页
  if (isAuthenticated) {
    if (user?.role === 'STUDENT') {
      return <Navigate to="/student" replace />
    }
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  const { cognitiveEnabled: cognitiveModuleEnabled, isLoading } = useCapabilities()

  if (isLoading) {
    return <RouteLoading />
  }

  return (
    <React.Suspense fallback={<RouteLoading />}>
      <Routes>
          {/* Portal - Entry Point */}
          <Route
            path="/"
            element={
              <EntryRoute>
                <Portal />
              </EntryRoute>
            }
          />

          {/* Admin Login - no auth check to allow switching accounts */}
          <Route
            path="/admin/login"
            element={<AdminLogin />}
          />

          {/* Teacher Login/Register - no auth check to allow switching accounts */}
          <Route
            path="/teacher/login"
            element={<TeacherLogin />}
          />
          <Route
            path="/teacher/register"
            element={<TeacherRegister />}
          />
          <Route
            path="/teacher/account-login"
            element={<TeacherAccountLogin />}
          />

          {/* Student Login/Register - no auth check to allow switching accounts */}
          <Route
            path="/student/login"
            element={<StudentLogin />}
          />
          <Route
            path="/student/course-login"
            element={<StudentCourseLogin />}
          />
          <Route
            path="/student/register"
            element={<StudentRegister />}
          />

          {/* Admin/Teacher Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <CourseList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/courses"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <CourseList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/courses/:courseId/students"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <CourseStudents />
              </ProtectedRoute>
            }
          />
          <Route
            path="/courses/:courseId/detail"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <TeacherCourseDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/students"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <StudentManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/assignments"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <AssignmentList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/checkins"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <CheckinList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scales"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <ScaleList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scales/:id"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <ScaleEdit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/questionnaires"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <QuestionnaireList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/questionnaires/:id"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <QuestionnaireEdit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/general-questionnaires"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <GeneralQuestionnaireList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/general-questionnaires/create"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <GeneralQuestionnaireCreate />
              </ProtectedRoute>
            }
          />
          <Route
            path="/general-questionnaires/:id/edit"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <GeneralQuestionnaireEdit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/composite-assessments"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <CompositeAssessmentList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/composite-assessments/:id/results"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <CompositeAssessmentResults />
              </ProtectedRoute>
            }
          />
          <Route
            path="/composite-assessments/:id/attempts/:attemptId/report"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <CompositeReportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/composite-assessments/:id"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <CompositeAssessmentEdit />
              </ProtectedRoute>
            }
          />
          {cognitiveModuleEnabled && (
            <>
              <Route
                path="/cognitive-assignments"
                element={
                  <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                    <CognitiveAssignmentList />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cognitive-assignments/:id"
                element={
                  <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                    <CognitiveAssignmentEdit />
                  </ProtectedRoute>
                }
              />
            </>
          )}
          <Route
            path="/teacher/classrooms"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <ClassroomList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/classrooms/create"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <ClassroomCreate />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/classrooms/:id/control"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <ClassroomControl />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/classrooms/:id/edit"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <ClassroomEdit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/classrooms/:id/qrcode"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <ClassroomQRCode />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/classrooms/:id/questions"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <ClassroomQuestionEdit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/videos"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <VideoLibrary />
              </ProtectedRoute>
            }
          />
          <Route
            path="/images"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <ImageLibrary />
              </ProtectedRoute>
            }
          />
          <Route
            path="/documents"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <DocumentLibrary />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute roles={['ADMIN']}>
                <UserList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher-codes"
            element={
              <ProtectedRoute roles={['ADMIN']}>
                <TeacherCodeList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/material-grants"
            element={
              <ProtectedRoute roles={['ADMIN']}>
                <MaterialGrants />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/instrument-authorizations"
            element={
              <ProtectedRoute roles={['ADMIN']}>
                <InstrumentAuthorization />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute roles={['TEACHER', 'ADMIN']}>
                <TeacherProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scale-library"
            element={
              <ScaleLibraryRoute>
                <ScaleLibrary />
              </ScaleLibraryRoute>
            }
          />
          <Route
            path="/scale-library/:instrumentKey/:instrumentVersion"
            element={
              <ScaleLibraryRoute>
                <ScaleLibrary />
              </ScaleLibraryRoute>
            }
          />

          {/* Student Routes */}
          <Route
            path="/student"
            element={
              <StudentProtectedRoute>
                <StudentHome />
              </StudentProtectedRoute>
            }
          />
          <Route
            path="/student/classroom/enter"
            element={
              <OptionalStudentRoute>
                <ClassroomEnter />
              </OptionalStudentRoute>
            }
          />
          <Route
            path="/student/courses/:courseId"
            element={
              <StudentProtectedRoute>
                <CourseDetail />
              </StudentProtectedRoute>
            }
          />
          <Route
            path="/student/assignments/:assignmentId"
            element={
              <StudentProtectedRoute>
                <AssignmentSubmit />
              </StudentProtectedRoute>
            }
          />
          <Route
            path="/student/assignments"
            element={
              <StudentProtectedRoute>
                <StudentAssignments />
              </StudentProtectedRoute>
            }
          />
          <Route
            path="/student/checkins"
            element={
              <StudentProtectedRoute>
                <StudentCheckins />
              </StudentProtectedRoute>
            }
          />
          <Route
            path="/student/checkins/:checkinId"
            element={
              <StudentProtectedRoute>
                <CheckinSubmit />
              </StudentProtectedRoute>
            }
          />
          <Route
            path="/student/profile"
            element={
              <StudentProtectedRoute>
                <StudentProfile />
              </StudentProtectedRoute>
            }
          />
          <Route
            path="/student/situational"
            element={
              <StudentProtectedRoute>
                <SituationalHome />
              </StudentProtectedRoute>
            }
          />
          <Route
            path="/student/situational/history"
            element={
              <StudentProtectedRoute>
                <SituationalHistory />
              </StudentProtectedRoute>
            }
          />
          <Route
            path="/student/situational/:instrumentKey"
            element={
              <StudentProtectedRoute>
                <SituationalRunner />
              </StudentProtectedRoute>
            }
          />
          <Route
            path="/student/situational/attempts/:attemptId/result"
            element={
              <StudentProtectedRoute>
                <SituationalResult />
              </StudentProtectedRoute>
            }
          />
          <Route
            path="/student/composite/situational/:attemptId"
            element={
              <StudentProtectedRoute>
                <SituationalRunner />
              </StudentProtectedRoute>
            }
          />
          <Route
            path="/student/scales"
            element={
              <StudentProtectedRoute>
                <StudentScales />
              </StudentProtectedRoute>
            }
          />
          <Route
            path="/student/scales/:scaleId"
            element={
              <StudentProtectedRoute>
                <ScaleAssessment />
              </StudentProtectedRoute>
            }
          />
          <Route
            path="/student/scales/result/:assessmentId"
            element={
              <StudentProtectedRoute>
                <ScaleResult />
              </StudentProtectedRoute>
            }
          />
          <Route
            path="/student/questionnaires"
            element={
              <StudentProtectedRoute>
                <StudentQuestionnaires />
              </StudentProtectedRoute>
            }
          />
          <Route
            path="/student/questionnaires/:questionnaireId"
            element={
              <StudentProtectedRoute>
                <QuestionnaireAssessment />
              </StudentProtectedRoute>
            }
          />
          <Route
            path="/student/questionnaires/result/:assessmentId"
            element={
              <StudentProtectedRoute>
                <QuestionnaireResult />
              </StudentProtectedRoute>
            }
          />
          <Route
            path="/student/classroom/join/:code"
            element={
              <OptionalStudentRoute>
                <ClassroomJoin />
              </OptionalStudentRoute>
            }
          />
          <Route
            path="/student/classroom/answer/:classroomId"
            element={
              <OptionalStudentRoute>
                <ClassroomAnswer />
              </OptionalStudentRoute>
            }
          />

          {/* 综合测评：量表、表单和认知任务在同一容器内按配置顺序完成 */}
          <Route
            path="/student/composite/:assessmentId"
            element={<StudentProtectedRoute><CompositeAssessmentPage /></StudentProtectedRoute>}
          />
          <Route
            path="/student/composite/attempts/:attemptId"
            element={<StudentProtectedRoute><CompositeAssessmentPage /></StudentProtectedRoute>}
          />
          <Route
            path="/student/composite/attempts/:attemptId/report"
            element={<StudentProtectedRoute><CompositeReportPage /></StudentProtectedRoute>}
          />

          {/* Cognitive 路由（Option A：flag=false 时不注册，/student/cognitive* 落 * → /） */}
          {cognitiveModuleEnabled && (
            <>
              <Route
                path="/student/cognitive"
                element={
                  <StudentProtectedRoute>
                    <CognitiveHome />
                  </StudentProtectedRoute>
                }
              />
              <Route
                path="/student/cognitive/assignments/:assignmentId"
                element={
                  <StudentProtectedRoute>
                    <CognitiveAssignmentEntry />
                  </StudentProtectedRoute>
                }
              />
              <Route
                path="/student/cognitive/history"
                element={
                  <StudentProtectedRoute>
                    <CognitiveHistory />
                  </StudentProtectedRoute>
                }
              />
              <Route
                path="/student/cognitive/sessions/:sessionId"
                element={
                  <StudentProtectedRoute>
                    <CognitiveRunner />
                  </StudentProtectedRoute>
                }
              />
              <Route
                path="/student/cognitive/sessions/:sessionId/result"
                element={
                  <StudentProtectedRoute>
                    <CognitiveResult />
                  </StudentProtectedRoute>
                }
              />
              <Route path="/public/cognitive/assignments/:token" element={<PublicCognitiveAssignment />} />
              <Route path="/public/cognitive/sessions/:sessionId" element={<CognitiveRunner />} />
              <Route path="/public/cognitive/sessions/:sessionId/result" element={<CognitiveResult />} />
            </>
          )}

          {/* 综合测评公开匿名入口 */}
          <Route path="/public/composite/situational/:attemptId" element={<SituationalRunner />} />
          <Route path="/public/composite/:token" element={<CompositeAssessmentPage />} />
          <Route path="/public/composite/attempts/:attemptId" element={<CompositeAssessmentPage />} />
          <Route path="/public/composite/attempts/:attemptId/report" element={<CompositeReportPage />} />

          {/* Public Questionnaire Routes (无需认证) */}
          <Route
            path="/public/questionnaire/:token"
            element={<PublicQuestionnaire />}
          />
          <Route
            path="/public/questionnaire/:token/assessment"
            element={<PublicQuestionnaireAssessment />}
          />
          <Route
            path="/public/questionnaire/:token/result"
            element={<PublicQuestionnaireResult />}
          />

          {/* Public Checkin Routes (无需认证 - 匿名打卡) */}
          <Route
            path="/public/checkin/:token"
            element={<PublicCheckin />}
          />

          {/* BigScreen Routes (无需认证) */}
          <Route
            path="/bigscreen/:classroomId"
            element={<BigScreen />}
          />

          {/* Default Redirect */}
          <Route path="*" element={<ProductPage><ProductStatus kind="warning" title="找不到此页面" actions={<Link to="/">返回入口</Link>}>链接可能不完整或该功能当前不可用。请检查原链接，或联系老师获取完整链接。</ProductStatus></ProductPage>} />
      </Routes>
    </React.Suspense>
  )
}

function ApplicationFrame() {
  const location = useLocation()
  return <AppShell><RouteErrorBoundary key={location.pathname}><AppRoutes /></RouteErrorBoundary></AppShell>
}

function App() {
  return (
    <CapabilitiesProvider>
      <AuthProvider>
        <BrowserRouter>
          <ApplicationFrame />
        </BrowserRouter>
      </AuthProvider>
    </CapabilitiesProvider>
  )
}

export default App

