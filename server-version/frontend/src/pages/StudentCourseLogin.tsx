import { isTrainingHost } from '../training/context'
import { useAuthLinks } from '../components/app-shell/useAuthLinks'
import AuthShell from '../components/auth/AuthShell'
import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import apiClient from '../api/client'

const StudentCourseLogin: React.FC = () => {
  const authLink = useAuthLinks()
  const training = isTrainingHost()
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
    <AuthShell
      tone="student"
      title="学生注册"
      description={training ? "先验证课程码，再创建学员账号" : "输入课程码加入课程"}
      heroTitle="用课程码加入班级，再创建自己的学生账号"
      heroDescription="课程码只用于找到正确的课程；已经注册过的学生可以直接返回账号登录。"
    >
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
            {training ? '课程码由培训师提供，请向培训师索取' : '课程码由教师创建，向您的教师索取'}
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full btn-primary flex items-center justify-center space-x-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>验证中...</span>
            </>
          ) : (
            <span>{training ? "验证并继续" : "下一步"}</span>
          )}
        </button>
      </form>

      <div className={training ? "training-auth-register-entry" : "mt-6 pt-6 border-t text-center"}>
        <p className={training ? "text-sm text-gray-500" : "text-sm text-gray-500 mb-3"}>{training ? "已有学员账号？" : "已经注册过？用账号密码登录即可，不必再填课程码。"}</p>
        <Link to={authLink("/student/login")} className={training ? "text-action hover:underline font-medium" : "inline-flex justify-center w-full btn-secondary"}>
          已有账号，去登录
        </Link>
      </div>

      <div className="hui-auth-note">
        <strong>{training ? "接下来" : "注册流程"}</strong>
        {training ? <p>验证后设置用户名、昵称和密码，即可加入课程。</p> : <ol className="list-decimal list-inside mt-1 space-y-1">
          <li>输入课程码验证</li>
          <li>设置用户名、昵称和密码</li>
          <li>完成注册加入课程</li>
        </ol>}
      </div>
    </AuthShell>
  )
}

export default StudentCourseLogin
