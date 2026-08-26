import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { GraduationCap, Loader2, ArrowLeft, CheckCircle } from 'lucide-react'
import apiClient from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import type { User } from '../../types'

interface StudentRegisterData {
  token: string
  user: User
}

const StudentRegister: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const courseCode = searchParams.get('course') || '' 
  const { loginWithToken } = useAuth()
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [courseInfo, setCourseInfo] = useState<{ courseId: string; courseName: string } | null>(null)
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    nickname: '',
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (courseCode) {
      // 验证课程码并获取课程信息
      verifyCourseCode()
    }
  }, [courseCode])

  const verifyCourseCode = async () => {
    try {
      const response = await apiClient.post<{ courseId: string; courseName: string }>(
        '/courses/verify-code',
        { courseCode }
      )
      
      if (response.code === 0 && response.data) {
        setCourseInfo(response.data)
      } else {
        setError('课程码无效或课程已结束')
      }
    } catch (err) {
      setError('验证课程码失败')
    }
  }

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

  const validateNickname = (nickname: string) => {
    const regex = /^(?:[\u4e00-\u9fa5]{2,10}|[a-zA-Z\s]{2,20})$/
    if (!regex.test(nickname)) {
      return '请输入中文昵称（中文2-10字或英文2-20字母）'
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
    
    const nicknameError = validateNickname(formData.nickname)
    if (nicknameError) errors.nickname = nicknameError
    
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm() || !courseInfo) return
    
    setLoading(true)
    setError('')

    try {
      const response = await apiClient.post<StudentRegisterData>(
        '/auth/student-register',
        {
          courseCode,
          username: formData.username.trim(),
          password: formData.password,
          nickname: formData.nickname.trim(),
        }
      )

      if (response.code === 0 && response.data) {
        loginWithToken(response.data.token, response.data.user)
        navigate('/student')
      } else {
        setError(response.message || '注册失败')
      }
    } catch (err: any) {
      setError(err.message || '注册失败，请检查输入信息')
    } finally {
      setLoading(false)
    }
  }

  if (!courseCode || !courseInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center p-4">
        <div className="card text-center">
          <p className="text-red-500 mb-4">{error || '无效的访问'}</p>
          <p className="text-gray-600 mb-4">请先输入课程码</p>
          <Link to="/student/course-login" className="btn-primary inline-block">
            返回输入课程码
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back Button */}
        <Link
          to="/student/course-login"
          className="inline-flex items-center text-gray-600 hover:text-gray-800 mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 mr-1" />
          返回
        </Link>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <GraduationCap className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">学生账号注册</h1>
          <p className="text-gray-500 mt-2">加入课程：{courseInfo.courseName}</p>
        </div>

        {/* Course Info */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center space-x-2 text-green-700">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">课程码验证成功</span>
          </div>
          <p className="text-sm text-green-600 mt-1">
            请设置您的学生账号信息
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
                用户名 <span className="text-xs text-gray-500">(字母+数字)</span>
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className={`input ${fieldErrors.username ? 'border-red-500' : ''}`}
                placeholder="如：student01"
                required
              />
              {fieldErrors.username && (
                <p className="mt-1 text-xs text-red-500">{fieldErrors.username}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                中文昵称 <span className="text-xs text-gray-500">(中文或英文)</span>
              </label>
              <input
                type="text"
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                className={`input ${fieldErrors.nickname ? 'border-red-500' : ''}`}
                placeholder="请输入中文昵称"
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
              className="w-full btn-primary bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>注册中...</span>
                </>
              ) : (
                <span>完成注册并加入课程</span>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t text-center">
            <p className="text-sm text-gray-500 mb-3">已经有账号？</p>
            <Link to="/student/login" className="inline-flex justify-center w-full btn-secondary">
              已有账号，去登录
            </Link>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
            <p className="font-medium mb-1">💡 账号说明</p>
            <p>注册后即可用该账号登录。结束课程不会冻结账号，你仍可参加其他课程。</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StudentRegister
