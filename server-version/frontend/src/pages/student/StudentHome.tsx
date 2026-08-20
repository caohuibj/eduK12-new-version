import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users, BookOpen, Clock, ChevronRight, Keyboard, Brain } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import apiClient from '../../api/client'
import type { Course } from '../../types'
import { cognitiveModuleEnabled } from '../../modules/cognitive/feature'

const StudentHome: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [courseCode, setCourseCode] = useState('')
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    fetchCourses()
  }, [])

  const fetchCourses = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get('/courses/my')
      if (response.code === 0) {
        setCourses(response.data.list)
      }
    } catch (error) {
      console.error('获取课程列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleJoinCourse = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!courseCode.trim()) return

    setJoining(true)
    try {
      const response = await apiClient.post('/courses/join', {
        courseCode: courseCode.trim(),
      })
      if (response.code === 0) {
        alert('加入课程成功！')
        setShowJoinModal(false)
        setCourseCode('')
        fetchCourses()
      } else {
        alert(response.message || '加入课程失败')
      }
    } catch (error: any) {
      alert(error.message || '加入课程失败')
    } finally {
      setJoining(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">我的课程</h1>
          <p className="text-gray-500 mt-1">
            欢迎回来，{user?.nickname || user?.username}
          </p>
        </div>
        <div className="flex gap-3">
          {cognitiveModuleEnabled && (
            <button
              onClick={() => navigate('/student/cognitive')}
              className="px-4 py-2 bg-white text-primary border border-primary/40 rounded-lg flex items-center gap-2 hover:bg-primary/5"
            >
              <Brain className="w-5 h-5" />
              <span>认知测评</span>
            </button>
          )}
          <button
            onClick={() => navigate('/student/classroom/enter')}
            className="px-4 py-2 bg-primary text-white rounded-lg flex items-center gap-2 hover:bg-primary/90"
          >
            <Keyboard className="w-5 h-5" />
            <span>加入课堂</span>
          </button>
          <button
            onClick={() => setShowJoinModal(true)}
            className="btn-primary flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>加入课程</span>
          </button>
        </div>
      </div>

      {/* Course List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : courses.length === 0 ? (
        <div className="card text-center py-12">
          <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-800 mb-2">还没有加入任何课程</h3>
          <p className="text-gray-500 mb-4">点击"加入课程"按钮，输入课程号开始吧</p>
          <button
            onClick={() => setShowJoinModal(true)}
            className="btn-primary"
          >
            加入课程
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <div
              key={course.id}
              onClick={() => navigate(`/student/courses/${course.id}`)}
              className="card hover:shadow-lg transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-primary" />
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>

              <h3 className="text-lg font-semibold text-gray-800 mb-2">{course.title}</h3>
              {course.description && (
                <p className="text-gray-500 text-sm mb-4 line-clamp-2">{course.description}</p>
              )}

              <div className="flex items-center justify-between text-sm text-gray-500 pt-4 border-t">
                <div className="flex items-center space-x-1">
                  <Users className="w-4 h-4" />
                  <span>{course.studentCount || 0} 人</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Clock className="w-4 h-4" />
                  <span>{formatDate(course.createdAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Join Course Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card w-full max-w-md mx-4">
            <h3 className="text-xl font-bold text-gray-800 mb-4">加入课程</h3>
            <p className="text-gray-500 mb-4">请输入课程号加入课程</p>

            <form onSubmit={handleJoinCourse}>
              <input
                type="text"
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                placeholder="请输入课程号（如：ABC123）"
                className="input mb-4"
                required
              />

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 btn-secondary"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={joining || !courseCode.trim()}
                  className="flex-1 btn-primary"
                >
                  {joining ? '加入中...' : '加入'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default StudentHome
