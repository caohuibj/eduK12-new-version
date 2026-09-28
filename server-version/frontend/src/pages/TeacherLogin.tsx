import '../components/staff-ui/auth-ui.css'
import { useAuthLinks } from '../components/app-shell/useAuthLinks'
import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Users, Loader2, ArrowLeft } from 'lucide-react'
import apiClient from '../api/client'

const TeacherLogin: React.FC = () => {
  const authLink = useAuthLinks()
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
    <div className="hui-staff-auth min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center p-4">
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
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Users className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">教师注册</h1>
          <p className="text-gray-500 mt-2">使用教师邀请码创建账号</p>
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
              <label htmlFor="auth-teacherCode" className="block text-sm font-medium text-gray-700 mb-1">
                教师邀请码
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
                教师邀请码由管理员创建，仅限使用一次
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 flex items-center justify-center space-x-2"
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
            <p className="text-sm text-gray-500 mb-2">已有教师账号？</p>
            <Link to={authLink("/teacher/account-login")} className="text-primary hover:underline font-medium">
              直接登录
            </Link>
          </div>

          {/* Info */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
            <p className="font-medium mb-1">💡 注册流程</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>输入教师邀请码</li>
              <li>设置用户名、密码和真实姓名</li>
              <li>提交后等待管理员审核，通过后即可登录</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TeacherLogin
