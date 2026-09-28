import { useAuthLinks } from '../components/app-shell/useAuthLinks'
import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { BookOpen, Loader2, ArrowLeft } from 'lucide-react'
import apiClient from '../api/client'


const StudentCourseLogin: React.FC = () => {
  const authLink = useAuthLinks()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [courseCode, setCourseCode] = useState('')

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!courseCode.trim()) return

    setLoading(true)
    setError('')

    try {
      // 验证课程码
      const response = await apiClient.post<{ courseId: string; courseName: string }>(
        '/courses/verify-code',
        { courseCode: courseCode.trim() }
      )

      if (response.code === 0 && response.data) {
        const verifiedCourseCode = courseCode.trim()
        // 将本次验证结果带入注册页，避免同一流程重复验证。
        navigate(
          authLink(`/student/register?course=${encodeURIComponent(verifiedCourseCode)}`),
          {
            state: {
              verifiedCourseCode,
              verifiedCourse: response.data,
            },
          }
        )
      } else {
        setError(response.message || '课程码无效或课程已结束')
      }
    } catch (err: any) {
      setError(err.message || '验证失败，请检查课程码')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back Button */}
        <Link
          to="/"
          className="inline-flex items-center text-gray-600 hover:text-gray-800 mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 mr-1" />
          返回入口
        </Link>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <BookOpen className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">学生注册</h1>
          <p className="text-gray-500 mt-2">输入课程码加入课程</p>
        </div>

        {/* Form */}
        <div className="card">
          {error && (
            <div role="alert" id="auth-error" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div>
              <label htmlFor="auth-courseCode" className="block text-sm font-medium text-gray-700 mb-1">
                课程码
              </label>
              <input aria-describedby={error ? "auth-error" : undefined} id="auth-courseCode"
                type="text"
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                className="input"
                placeholder="请输入课程码（如：ABC123）"
                required
              />
              <p className="mt-2 text-xs text-gray-500">
                课程码由教师创建，向您的教师索取
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>验证中...</span>
                </>
              ) : (
                <span>下一步</span>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t text-center">
            <p className="text-sm text-gray-500 mb-3">已经注册过？用账号密码登录即可，不必再填课程码。</p>
            <Link to={authLink("/student/login")} className="inline-flex justify-center w-full btn-secondary">
              已有账号，去登录
            </Link>
          </div>

          {/* Info */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
            <p className="font-medium mb-1">💡 注册流程</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>输入课程码验证</li>
              <li>设置账号信息（用户名、密码、姓名）</li>
              <li>完成注册加入课程</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StudentCourseLogin
