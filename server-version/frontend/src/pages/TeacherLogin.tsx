import { isTrainingHost } from '../training/context'
import { useAuthLinks } from '../components/app-shell/useAuthLinks'
import AuthShell from '../components/auth/AuthShell'
import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import apiClient from '../api/client'

const TeacherLogin: React.FC = () => {
  const authLink = useAuthLinks()
  const training = isTrainingHost()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [teacherCode, setTeacherCode] = useState('')

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!teacherCode.trim()) return

    setLoading(true)
    setError('')

    try {
      // 验证教师码是否有效且未使用
      const response = await apiClient.post<{ isValid: boolean; isUsed: boolean }>('/auth/verify-teacher-code', {
        teacherCode: teacherCode.trim(),
      })

      if (response.code === 0 && response.data) {
        if (response.data.isUsed) {
          setError('该教师码已被使用，请直接使用用户名密码登录')
        } else {
          // 教师码有效且未使用，跳转到注册页面
          navigate(authLink(`/teacher/register?code=${encodeURIComponent(teacherCode.trim())}`))
          return
        }
      } else {
        setError(response.message || '教师码无效或已过期')
      }
    } catch (err: any) {
      setError(err.message || '验证失败，请检查教师码')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      tone="teacher"
      title="教师注册"
      description="使用教师邀请码创建账号"
      heroTitle="从一个清晰的入口，开始课程与测评管理"
      heroDescription="教师邀请码用于首次创建账号；已有账号可直接返回教师登录。"
    >
      {error && (
        <div role="alert" id="auth-error" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleVerifyCode} className="space-y-4">
        <div>
          <label htmlFor="auth-teacherCode" className="block text-sm font-medium text-gray-700 mb-1">
            {training ? '培训师注册码' : '教师邀请码'}
          </label>
          <input aria-describedby={error ? "auth-error" : undefined} id="auth-teacherCode"
            type="text"
            value={teacherCode}
            onChange={(e) => setTeacherCode(e.target.value)}
            className="input"
            placeholder="请输入教师邀请码"
            required
          />
          <p className="mt-2 text-xs text-gray-500">
            {training ? '培训师注册码由平台管理员创建，仅能使用一次' : '教师邀请码由管理员创建，仅限使用一次'}
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
            <span>验证并注册</span>
          )}
        </button>
      </form>

      <div className="mt-6 pt-6 border-t text-center">
        <p className="text-sm text-gray-500 mb-2">{training ? '已有培训师账号？' : '已有教师账号？'}</p>
        <Link to={authLink("/teacher/account-login")} className="text-action hover:underline font-medium">
          直接登录
        </Link>
      </div>

      <div className="hui-auth-note">
        <strong>注册流程</strong>
        <ol className="list-decimal list-inside mt-1 space-y-1">
          <li>输入教师邀请码</li>
          <li>设置用户名、密码和真实姓名</li>
          <li>提交后等待管理员审核，通过后即可登录</li>
        </ol>
      </div>
    </AuthShell>
  )
}

export default TeacherLogin
