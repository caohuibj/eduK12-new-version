import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { CapabilitiesProvider, useCapabilities } from './contexts/CapabilitiesContext'
import Layout from './components/Layout'
import StudentLayout from './components/StudentLayout'

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
import FirstLoginPasswordChange from './pages/FirstLoginPasswordChange'

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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div role="alert" className="max-w-md rounded-lg bg-white p-6 text-center shadow">
          <h1 className="text-xl font-semibold text-gray-900">页面加载失败</h1>
          <p className="mt-2 text-sm text-gray-600">{this.state.message}</p>
          <button
            type="button"
            className="mt-4 rounded bg-primary px-4 py-2 text-white"
            onClick={() => this.setState({ hasError: false, message: '' })}
          >
            重试
          </button>
        </div>
      </div>
    )
  }
}

// Protected Route for Teachers/Admins
const ProtectedRoute: React.FC<{ children: React.ReactNode; roles?: ('STUDENT' | 'TEACHER' | 'ADMIN')[] }> = ({
  children,
  roles,
}) => {
  const { isAuthenticated, user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>加载中...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  if (user?.mustChangePassword) {
    return <FirstLoginPasswordChange />
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return <Layout>{children}</Layout>
}

// Protected Route for Students
const StudentProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>加载中...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/student/login" replace />
  }

  if (user?.role !== 'STUDENT') {
    return <Navigate to="/" replace />
  }

  if (user.mustChangePassword) {
    return <FirstLoginPasswordChange />
  }

  return <StudentLayout>{children}</StudentLayout>
}

// Optional Student Route - 允许未登录用户访问（临时课堂模式）
const OptionalStudentRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>加载中...</div>
      </div>
    )
  }

  // 已登录学生：显示完整布局
  if (isAuthenticated && user?.role === 'STUDENT') {
    return <StudentLayout>{children}</StudentLayout>
  }

  // 未登录或其他角色：允许访问但不显示布局（临时学生模式）
  return <>{children}</>
}

// Public Route (redirect if authenticated)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>加载中...</div>
      </div>
    )
  }

  if (isAuthenticated) {
    if (user?.role === 'STUDENT') {
      return <Navigate to="/student" replace />
    }
    // TEACHER 和 ADMIN 跳转到 dashboard
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

// Entry Route - for portal page (redirect if authenticated)
const EntryRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>加载中...</div>
      </div>
    )
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
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>加载中...</div>
      </div>
    )
  }

  return (
    <React.Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>加载中...</div>}>
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
          <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </React.Suspense>
  )
}

function App() {
  return (
    <CapabilitiesProvider>
      <AuthProvider>
        <BrowserRouter>
          <RouteErrorBoundary>
            <AppRoutes />
          </RouteErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </CapabilitiesProvider>
  )
}

export default App
