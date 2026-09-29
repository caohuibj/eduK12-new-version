import React, { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BookOpen, Brain, Clock, Keyboard, Plus, Users } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import apiClient from '../../api/client'
import ModalSurface from '../../components/shared-ui/ModalSurface'
import type { Course } from '../../types'
import { useCognitiveEnabled } from '../../contexts/CapabilitiesContext'
import { DiscoveryCard, PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'

const StudentHome: React.FC = () => {
  const { user } = useAuth()
  const location = useLocation()
  const cognitiveModuleEnabled = useCognitiveEnabled()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [courseCode, setCourseCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const joinInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void fetchCourses()
  }, [])

  const openJoinModal = () => {
    setJoinError(null)
    setShowJoinModal(true)
  }

  const closeJoinModal = () => {
    setShowJoinModal(false)
    setJoinError(null)
  }

  const fetchCourses = async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const response = await apiClient.get('/courses/my')
      if (response.code !== 0) throw new Error(response.message || '获取课程列表失败')
      setCourses(response.data.list)
    } catch (error) {
      console.error('获取课程列表失败:', error)
      setLoadError(error instanceof Error ? error.message : '获取课程列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinCourse = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!courseCode.trim() || joining) return

    setJoining(true)
    setJoinError(null)
    try {
      const response = await apiClient.post('/courses/join', { courseCode: courseCode.trim() })
      if (response.code !== 0) throw new Error(response.message || '加入课程失败')
      closeJoinModal()
      setCourseCode('')
      await fetchCourses()
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : '加入课程失败')
    } finally {
      setJoining(false)
    }
  }

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('zh-CN')
  const routeNotice = typeof (location.state as { notice?: unknown } | null)?.notice === 'string'
    ? (location.state as { notice: string }).notice
    : null

  return (
    <ProductPage width="management" className="hui-student-page hui-student-home">
      <PageHeader
        title="我的课程"
        description={`欢迎回来，${user?.nickname || user?.username || '同学'}。从课程进入作业、打卡、问卷和综合测评。`}
        actions={(
          <div className="flex flex-wrap gap-2">
            {cognitiveModuleEnabled ? (
              <Link to="/student/cognitive" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 no-underline hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
                <Brain className="h-5 w-5" aria-hidden="true" />认知测评
              </Link>
            ) : null}
            <Link to="/student/classroom/enter" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 no-underline hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
              <Keyboard className="h-5 w-5" aria-hidden="true" />加入课堂
            </Link>
            <ProductButton variant="primary" onClick={openJoinModal}>
              <Plus className="mr-1 inline h-5 w-5" aria-hidden="true" />加入课程
            </ProductButton>
          </div>
        )}
      />

      {routeNotice ? (
        <ProductStatus kind="info" title="课堂提示" announce="polite">{routeNotice}</ProductStatus>
      ) : null}

      {loading ? (
        <ProductStatus kind="pending" title="正在加载课程" announce="polite" />
      ) : loadError ? (
        <ProductStatus kind="error" title="课程列表加载失败" announce="assertive" actions={<ProductButton onClick={() => void fetchCourses()}>重试</ProductButton>}>{loadError}</ProductStatus>
      ) : courses.length === 0 ? (
        <ProductStatus kind="info" title="还没有加入任何课程" actions={<ProductButton variant="primary" onClick={openJoinModal}>加入课程</ProductButton>}>
          输入老师提供的课程号即可加入。
        </ProductStatus>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <DiscoveryCard
              key={course.id}
              to={`/student/courses/${course.id}`}
              title={course.title}
              ariaLabel={`${course.title}，打开课程`}
              leading={<span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><BookOpen className="h-5 w-5" /></span>}
              description={course.description}
              meta={(
                <>
                  <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden="true" />{course.studentCount || 0} 人</span>
                  <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden="true" />{formatDate(course.createdAt)}</span>
                </>
              )}
            />
          ))}
        </div>
      )}

      {showJoinModal ? (
        <ModalSurface open={showJoinModal} onClose={closeJoinModal} initialFocusRef={joinInputRef} className="hui-student-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="join-course-title" className="hui-student-dialog card w-full max-w-md" tabIndex={-1}>
            <h2 id="join-course-title" className="text-xl font-bold text-gray-800 mb-2">加入课程</h2>
            <p className="text-gray-500 mb-4">请输入老师提供的课程号。</p>
            {joinError ? <p role="alert" className="mb-4 text-sm text-red-600">{joinError}</p> : null}
            <form onSubmit={handleJoinCourse}>
              <label className="block text-sm font-medium text-slate-700" htmlFor="join-course-code">课程号</label>
              <input
                ref={joinInputRef}
                id="join-course-code"
                type="text"
                value={courseCode}
                onChange={(event) => setCourseCode(event.target.value)}
                placeholder="例如：ABC123"
                className="input mt-1 mb-4"
                required
              />
              <div className="flex flex-wrap justify-end gap-3">
                <ProductButton onClick={closeJoinModal}>取消</ProductButton>
                <ProductButton type="submit" variant="primary" disabled={joining || !courseCode.trim()}>{joining ? '加入中...' : '加入'}</ProductButton>
              </div>
            </form>
          </section>
        </ModalSurface>
      ) : null}
    </ProductPage>
  )
}

export default StudentHome
