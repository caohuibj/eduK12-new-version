import React, { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Users, Loader2, ArrowLeft, CheckCircle } from 'lucide-react'
import apiClient from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import type { User } from '../types'

interface TeacherRegisterData {
  token?: string
  pendingApproval?: boolean
  user: User
}

const TeacherRegister: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const teacherCode = searchParams.get('code') || ''
  const { loginWithToken } = useAuth()
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    nickname: '',
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)

  const validateUsername = (username: string) => {
    const regex = /^[a-zA-Z0-9]+$/
    if (!regex.test(username)) {
      return '用户名只能包含字母和数字'
    }
    if (username.length < 4 || username.length > 20) {
      return '用户名长度为4-20个字符'
    }
    return ''
  }

  const validatePassword = (password: string) => {
    const regex = /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d]{8,12}$/
    if (!regex.test(password)) {
      return '密码必须包含字母和数字，长度8-12位'
    }
    return ''
  }

  const validateForm = () => {
    const errors: Record<string, string> = {}
    
    const usernameError = validateUsername(formData.username)
    if (usernameError) errors.username = usernameError
    
    const passwordError = validatePassword(formData.password)
    if (passwordError) errors.password = passwordError
    
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = '两次输入的密码不一致'
    }
    
    if (!formData.nickname.trim()) {
      errors.nickname = '请输入真实姓名'
    }
    
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return
    
    setLoading(true)
    setError('')

    try {
      const response = await apiClient.post<TeacherRegisterData>('/auth/teacher-register', {
        teacherCode: teacherCode.trim(),
        username: formData.username.trim(),
        password: formData.password,
        nickname: formData.nickname.trim(),
      })

      if (response.code === 0 && response.data?.pendingApproval) {
        setSubmitted(true)
      } else if (response.code === 0 && response.data?.token) {
        loginWithToken(response.data.token, response.data.user)
        navigate('/dashboard')
      } else {
        setError(response.message || '注册失败')
      }
    } catch (err: any) {
      setError(err.message || '注册失败，请检查输入信息')
    } finally {
      setLoading(false)
    }
  }

  if (!teacherCode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="card text-center">
          <p className="text-red-500 mb-4">无效的访问</p>
          <p className="text-gray-600 mb-4">请通过教师码登录页面进入</p>
          <Link to="/teacher/login" className="btn-primary inline-block">
            返回教师登录
          </Link>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="card max-w-md text-center">
          <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-800 mb-2">已提交，等待管理员审核</h1>
          <p className="text-gray-600 mb-6">
            账号已创建。管理员在「用户管理」中点通过后，即可用刚才设置的用户名和密码登录。
          </p>
          <Link to="/teacher/account-login" className="btn-primary inline-block">
            前往教师登录
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back Button */}
        <Link
          to="/teacher/login"
          className="inline-flex items-center text-gray-600 hover:text-gray-800 mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 mr-1" />
          返回
        </Link>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Users className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">教师账号注册</h1>
          <p className="text-gray-500 mt-2">设置您的登录账号</p>
        </div>

        {/* Teacher Code Info */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center space-x-2 text-green-700">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">教师码验证成功</span>
          </div>
          <p className="text-sm text-green-600 mt-1">
            请设置您的教师账号信息，设置完成后该教师码将失效
          </p>
        </div>

        {/* Form */}
        <div className="card">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                用户名 <span className="text-xs text-gray-500">(字母+数字组合)</span>
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className={`input ${fieldErrors.username ? 'border-red-500' : ''}`}
                placeholder="如：teacher01"
                required
              />
              {fieldErrors.username && (
                <p className="mt-1 text-xs text-red-500">{fieldErrors.username}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                真实姓名 <span className="text-xs text-gray-500">(必填)</span>
              </label>
              <input
                type="text"
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                className={`input ${fieldErrors.nickname ? 'border-red-500' : ''}`}
                placeholder="请输入您的真实姓名"
                required
              />
              {fieldErrors.nickname && (
                <p className="mt-1 text-xs text-red-500">{fieldErrors.nickname}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                密码 <span className="text-xs text-gray-500">(字母+数字，8-12位)</span>
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className={`input ${fieldErrors.password ? 'border-red-500' : ''}`}
                placeholder="请输入密码"
                required
              />
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                确认密码
              </label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className={`input ${fieldErrors.confirmPassword ? 'border-red-500' : ''}`}
                placeholder="请再次输入密码"
                required
              />
              {fieldErrors.confirmPassword && (
                <p className="mt-1 text-xs text-red-500">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>注册中...</span>
                </>
              ) : (
                <span>完成注册</span>
              )}
            </button>
          </form>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
            <p className="font-medium mb-1">💡 账号说明</p>
            <p>提交后教师码即失效。账号需管理员审核通过后才能登录，有效期为1年。</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TeacherRegister
