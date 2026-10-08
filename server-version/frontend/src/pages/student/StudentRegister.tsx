import { isTrainingHost } from '../../training/context'
import { returnAfterLogin } from '../../components/app-shell/access'
import { useAuthLinks } from '../../components/app-shell/useAuthLinks'
import AuthShell from '../../components/auth/AuthShell'
import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Loader2, CheckCircle } from 'lucide-react'
import apiClient from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import type { User } from '../../types'

interface StudentRegisterData {
  user: User
}

interface CourseInfo {
  courseId: string
  courseName: string
}

interface StudentRegisterLocationState {
  verifiedCourseCode?: string
  verifiedCourse?: CourseInfo
}

type CourseVerificationState = 'verifying' | 'verified' | 'invalid'

const StudentRegister: React.FC = () => {
  const authLink = useAuthLinks()
  const training = isTrainingHost()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const courseCode = searchParams.get('course') || ''
  const { setAuthenticatedUser } = useAuth()

  const locationState = location.state as StudentRegisterLocationState | null
  const preverifiedCourseInfo =
    locationState?.verifiedCourseCode === courseCode
      ? locationState.verifiedCourse ?? null
      : null

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [courseInfo, setCourseInfo] = useState<CourseInfo | null>(() => preverifiedCourseInfo)
  const [verificationState, setVerificationState] = useState<CourseVerificationState>(() => {
    if (!courseCode) return 'invalid'
    return preverifiedCourseInfo ? 'verified' : 'verifying'
  })
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    nickname: '',
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false

    if (!courseCode) {
      setCourseInfo(null)
      setVerificationState('invalid')
      setError('')
      return
    }

    if (preverifiedCourseInfo) {
      setCourseInfo(preverifiedCourseInfo)
      setVerificationState('verified')
      setError('')
      return
    }

    setCourseInfo(null)
    setVerificationState('verifying')
    setError('')

    const verifyCourseCode = async () => {
      try {
        const response = await apiClient.post<CourseInfo>(
          '/courses/verify-code',
          { courseCode }
        )
        if (cancelled) return
        if (response.code === 0 && response.data) {
          setCourseInfo(response.data)
          setVerificationState('verified')
        } else {
          setError(response.message || '课程码无效或课程已结束')
          setVerificationState('invalid')
        }
      } catch {
        if (cancelled) return
        setError('验证课程码失败')
        setVerificationState('invalid')
      }
    }

    void verifyCourseCode()
    return () => { cancelled = true }
  }, [courseCode, preverifiedCourseInfo])

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
    const regex = /^(?=.*[a-zA-Z])(?=.*\d).{8,128}$/
    if (!regex.test(password)) {
      return '密码必须包含字母和数字，长度8-128位'
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
        setAuthenticatedUser(response.data.user)
        navigate(returnAfterLogin(searchParams.get('returnTo'), response.data.user.role), { replace: true })
      } else {
        setError(response.message || '注册失败')
      }
    } catch (err: any) {
      setError(err.message || '注册失败，请检查输入信息')
    } finally {
      setLoading(false)
    }
  }

  if (verificationState === 'verifying') {
    return (
      <AuthShell tone="student" title="学生账号注册" description="正在确认课程码" backTo={authLink("/student/course-login")} backLabel="返回输入课程码">
        <div className="hui-auth-note mt-0 text-center" role="status" aria-live="polite">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-blue-600" aria-hidden="true" />
          正在验证课程码...
        </div>
      </AuthShell>
    )
  }

  if (!courseCode || verificationState === 'invalid' || !courseInfo) {
    return (
      <AuthShell tone="student" title="学生账号注册" description="需要先完成课程码验证" backTo={authLink("/student/course-login")} backLabel="返回输入课程码">
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <strong className="block mb-1">{error || '无效的访问'}</strong>
          <span>请先输入课程码。</span>
        </div>
        <Link to={authLink("/student/course-login")} className="btn-primary inline-flex w-full mt-5 items-center justify-center">
          返回输入课程码
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell tone="student" title="学生账号注册" description={`加入课程：${courseInfo.courseName}`} backTo={authLink("/student/course-login")} backLabel="返回课程码">
      <div className="p-4 mb-5 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center space-x-2 text-green-700">
          <CheckCircle className="w-5 h-5" aria-hidden="true" />
          <span className="font-medium">课程码验证成功</span>
        </div>
        <p className="text-sm text-green-600 mt-1">
          {training ? '请设置您的学员账号信息' : '请设置您的学生账号信息'}
        </p>
      </div>

      {error && (
        <div role="alert" id="auth-error" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="auth-username" className="block text-sm font-medium text-gray-700 mb-1">
            用户名 <span className="text-xs text-gray-500">(字母+数字)</span>
          </label>
          <input autoComplete="username" aria-invalid={Boolean(fieldErrors.username)} aria-describedby={fieldErrors.username ? "auth-username-error" : undefined} id="auth-username"
            type="text"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            className={`input ${fieldErrors.username ? 'border-red-500' : ''}`}
            placeholder="如：student01"
            required
          />
          {fieldErrors.username && (
            <p role="alert" id="auth-username-error" className="mt-1 text-xs text-red-500">{fieldErrors.username}</p>
          )}
        </div>

        <div>
          <label htmlFor="auth-nickname" className="block text-sm font-medium text-gray-700 mb-1">
            中文昵称 <span className="text-xs text-gray-500">(中文或英文)</span>
          </label>
          <input aria-invalid={Boolean(fieldErrors.nickname)} aria-describedby={fieldErrors.nickname ? "auth-nickname-error" : undefined} id="auth-nickname"
            type="text"
            value={formData.nickname}
            onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
            className={`input ${fieldErrors.nickname ? 'border-red-500' : ''}`}
            placeholder="请输入中文昵称"
            required
          />
          {fieldErrors.nickname && (
            <p role="alert" id="auth-nickname-error" className="mt-1 text-xs text-red-500">{fieldErrors.nickname}</p>
          )}
        </div>

        <div>
          <label htmlFor="auth-password" className="block text-sm font-medium text-gray-700 mb-1">
            密码 <span className="text-xs text-gray-500">(字母+数字，8-128位)</span>
          </label>
          <input autoComplete="new-password" aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "auth-password-error" : undefined} id="auth-password"
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            className={`input ${fieldErrors.password ? 'border-red-500' : ''}`}
            placeholder="请输入密码"
            required
          />
          {fieldErrors.password && (
            <p role="alert" id="auth-password-error" className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>
          )}
        </div>

        <div>
          <label htmlFor="auth-confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
            确认密码
          </label>
          <input autoComplete="new-password" aria-invalid={Boolean(fieldErrors.confirmPassword)} aria-describedby={fieldErrors.confirmPassword ? "auth-confirmPassword-error" : undefined} id="auth-confirmPassword"
            type="password"
            value={formData.confirmPassword}
            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
            className={`input ${fieldErrors.confirmPassword ? 'border-red-500' : ''}`}
            placeholder="请再次输入密码"
            required
          />
          {fieldErrors.confirmPassword && (
            <p role="alert" id="auth-confirmPassword-error" className="mt-1 text-xs text-red-500">{fieldErrors.confirmPassword}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full btn-primary flex items-center justify-center space-x-2"
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
        <Link to={authLink("/student/login")} className="inline-flex justify-center w-full btn-secondary">
          已有账号，去登录
        </Link>
      </div>

      <div className="hui-auth-note">
        <strong>账号说明</strong>
        <div>注册后即可用该账号登录。结束课程不会冻结账号，你仍可参加其他课程。</div>
      </div>
    </AuthShell>
  )
}

export default StudentRegister
