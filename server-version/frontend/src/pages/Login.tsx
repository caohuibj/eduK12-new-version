import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { GraduationCap } from 'lucide-react'

const Login: React.FC = () => {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [isRegister, setIsRegister] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    nickname: '',
    teacherCode: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isRegister) {
        if (formData.password !== formData.confirmPassword) {
          setError('两次输入的密码不一致')
          setLoading(false)
          return
        }
        await login(formData.username, formData.password)
      } else {
        await login(formData.username, formData.password)
      }
      navigate('/')
    } catch (err: any) {
      setError(err.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-action rounded-full mb-4">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">
              {isRegister ? '注册账号' : '教学管理系统'}
            </h1>
            <p className="text-gray-500 mt-2">
              {isRegister ? '创建新账号开始使用' : '登录您的账号'}
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">用户名</label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="input"
                placeholder="请输入用户名"
                required
              />
            </div>

            <div>
              <label className="label">密码</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="input"
                placeholder="请输入密码"
                required
              />
            </div>

            {isRegister && (
              <>
                <div>
                  <label className="label">确认密码</label>
                  <input
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="input"
                    placeholder="请再次输入密码"
                    required
                  />
                </div>

                <div>
                  <label className="label">昵称（可选）</label>
                  <input
                    type="text"
                    value={formData.nickname}
                    onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                    className="input"
                    placeholder="请输入昵称"
                  />
                </div>

                <div>
                  <label className="label">教师码（注册教师账号需要）</label>
                  <input
                    type="text"
                    value={formData.teacherCode}
                    onChange={(e) => setFormData({ ...formData, teacherCode: e.target.value })}
                    className="input"
                    placeholder="没有则注册为学生账号"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 font-medium disabled:opacity-50"
            >
              {loading ? '请稍候...' : isRegister ? '注册' : '登录'}
            </button>
          </form>

          {/* Toggle */}
          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsRegister(!isRegister)
                setError('')
              }}
              className="text-action hover:underline text-sm"
            >
              {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
            </button>
          </div>
        </div>

        <p className="text-center text-gray-500 text-sm mt-6">
          © 2026 教学管理系统 · 独立服务器版本
        </p>
      </div>
    </div>
  )
}

export default Login
