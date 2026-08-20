import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
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
import CourseList from './pages/CourseList'
import CourseStudents from './pages/CourseStudents'
import StudentManagement from './pages/StudentManagement'
import AssignmentList from './pages/AssignmentList'
import CheckinList from './pages/CheckinList'
import VideoLibrary from './pages/VideoLibrary'
import ImageLibrary from './pages/ImageLibrary'
import DocumentLibrary from './pages/DocumentLibrary'
import UserList from './pages/UserList'
import TeacherCodeList from './pages/TeacherCodeList'
import TeacherProfile from './pages/teacher/TeacherProfile'
import ScaleList from './pages/ScaleList'
import ScaleEdit from './pages/ScaleEdit'
import QuestionnaireList from './pages/QuestionnaireList'
import QuestionnaireEdit from './pages/QuestionnaireEdit'
import TeacherCourseDetail from './pages/teacher/TeacherCourseDetail'
import GeneralQuestionnaireList from './pages/teacher/GeneralQuestionnaireList'
import GeneralQuestionnaireCreate from './pages/teacher/GeneralQuestionnaireCreate'
import GeneralQuestionnaireEdit from './pages/teacher/GeneralQuestionnaireEdit'
import ClassroomList from './pages/teacher/ClassroomList'
import ClassroomControl from './pages/teacher/ClassroomControl'
import ClassroomCreate from './pages/teacher/ClassroomCreate'
import ClassroomEdit from './pages/teacher/ClassroomEdit'
import ClassroomQRCode from './pages/teacher/ClassroomQRCode'
import ClassroomQuestionEdit from './pages/teacher/ClassroomQuestionEdit'

// Public Pages
import PublicQuestionnaire from './pages/public/PublicQuestionnaire'
import PublicQuestionnaireAssessment from './pages/public/PublicQuestionnaireAssessment'
import PublicQuestionnaireResult from './pages/public/PublicQuestionnaireResult'
import PublicCheckin from './pages/public/PublicCheckin'

// Student Pages
import StudentHome from './pages/student/StudentHome'
import CourseDetail from './pages/student/CourseDetail'
import AssignmentSubmit from './pages/student/AssignmentSubmit'
import CheckinSubmit from './pages/student/CheckinSubmit'
import StudentCheckins from './pages/student/StudentCheckins'
import StudentAssignments from './pages/student/StudentAssignments'
import StudentProfile from './pages/student/StudentProfile'
import StudentScales from './pages/student/StudentScales'
import ScaleAssessment from './pages/student/ScaleAssessment'
import ScaleResult from './pages/student/ScaleResult'
import StudentQuestionnaires from './pages/student/StudentQuestionnaires'
import QuestionnaireAssessment from './pages/student/QuestionnaireAssessment'
import QuestionnaireResult from './pages/student/QuestionnaireResult'
import ClassroomJoin from './pages/student/ClassroomJoin'
import ClassroomAnswer from './pages/student/ClassroomAnswer'
import ClassroomEnter from './pages/student/ClassroomEnter'

// Cognitive 页面（Stage B：URL 以 Assignment/Session 为核心；flag=false 时不注册 → 隐藏入口）
import CognitiveHome from './modules/cognitive/pages/CognitiveHome'
import CognitiveAssignmentEntry from './modules/cognitive/pages/CognitiveAssignmentEntry'
import CognitiveRunner from './modules/cognitive/pages/CognitiveRunner'
import CognitiveResult from './modules/cognitive/pages/CognitiveResult'
import CognitiveHistory from './modules/cognitive/pages/CognitiveHistory'
import { loadCognitiveCapability } from './modules/cognitive/feature'

// BigScreen Pages
import BigScreen from './pages/bigscreen/BigScreen'

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

function App() {
  const [cognitiveModuleEnabled, setCognitiveModuleEnabled] = useState(false)

  useEffect(() => {
    let active = true
    void loadCognitiveCapability().then((enabled) => {
      if (active) setCognitiveModuleEnabled(enabled)
    })
    return () => {
      active = false
    }
  }, [])

  return (
    <AuthProvider>
      <BrowserRouter>
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
            </>
          )}

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
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App

