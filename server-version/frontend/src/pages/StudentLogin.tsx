import LoginRecoveryNotice from '../components/app-shell/LoginRecoveryNotice'
import { useAuthLinks } from '../components/app-shell/useAuthLinks'
import AuthShell from '../components/auth/AuthShell'
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useLoginReturn } from '../components/app-shell/useLoginReturn'
import { useAuth } from '../contexts/AuthContext'

const StudentLogin: React.FC = () => {
  const authLink = useAuthLinks()
  const completeLogin = useLoginReturn()
  const { login } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await login(formData.username, formData.password)
      completeLogin()
    } catch (err: any) {
      setError(err.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell tone="student" title="学生登录" description="使用已注册的账号登录">
      <LoginRecoveryNotice />
      {error && (
        <div role="alert" id="auth-error" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="auth-username" className="block text-sm font-medium text-gray-700 mb-1">
            用户名
          </label>
          <input autoComplete="username" aria-describedby={error ? "auth-error" : undefined} id="auth-username"
            type="text"
            value={formData.username}
            onChange={(e) =>
              setFormData({ ...formData, username: e.target.value })
            }
            className="input"
            placeholder="请输入用户名"
            required
          />
        </div>

        <div>
          <label htmlFor="auth-password" className="block text-sm font-medium text-gray-700 mb-1">
            密码
          </label>
          <input autoComplete="current-password" aria-describedby={error ? "auth-error" : undefined} id="auth-password"
            type="password"
            value={formData.password}
            onChange={(e) =>
              setFormData({ ...formData, password: e.target.value })
            }
            className="input"
            placeholder="请输入密码"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full btn-primary flex items-center justify-center space-x-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>登录中...</span>
            </>
          ) : (
            <span>登录</span>
          )}
        </button>
      </form>

      <div className="mt-6 flex items-center justify-between gap-4 text-sm">
        <span className="text-gray-500">还没有账号？</span>
        <Link
          to={authLink("/student/course-login")}
          className="text-primary hover:underline font-medium"
        >
          使用课程码注册
        </Link>
      </div>

      <div className="hui-auth-note">
        <strong>学生注册说明</strong>
        <div>注册后使用课程号加入课程，即可查看作业和打卡任务。</div>
      </div>
    </AuthShell>
  )
}

export default StudentLogin
