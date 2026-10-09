import { isTrainingHost } from '../training/context'
import { useAuthLinks } from '../components/app-shell/useAuthLinks'
import AuthShell from '../components/auth/AuthShell'
import React, { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Loader2, CheckCircle } from 'lucide-react'
import apiClient from '../api/client'
import type { User } from '../types'

interface TeacherRegisterData {
  pendingApproval?: boolean
  user: User
}

const TeacherRegister: React.FC = () => {
  const authLink = useAuthLinks()
  const training = isTrainingHost()
  const [searchParams] = useSearchParams()
  const teacherCode = searchParams.get('code') || ''
  
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
    const regex = /^(?=.*[a-zA-Z])(?=.*\d).{8,128}$/
    if (!regex.test(password)) {
      return '密码必须包含字母和数字，长度8-128位'
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
      <AuthShell tone="teacher" title="教师账号注册" description="需要先完成教师邀请码验证" registrationStep="verify" backTo={authLink("/teacher/login")} backLabel={training ? "返回注册码验证" : "返回邀请码验证"}>
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <strong className="block mb-1">无效的访问</strong>
          <span>{training ? '请先验证培训师注册码，再创建账号。' : '请先验证教师邀请码，再创建账号。'}</span>
        </div>
        <Link to={authLink("/teacher/login")} className="btn-primary inline-flex w-full mt-5 items-center justify-center">
          返回邀请码验证
        </Link>
      </AuthShell>
    )
  }

  if (submitted) {
    return (
      <AuthShell tone="teacher" title="教师账号注册" description="注册信息已提交" registrationStep="submitted" backTo={authLink("/teacher/account-login")} backLabel="返回教师登录">
        <div className="text-center py-2">
          <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" aria-hidden="true" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">已提交，等待管理员审核</h2>
          <p className="text-gray-600 mb-6 text-sm leading-7">
            账号已创建。管理员在「用户管理」中点通过后，即可用刚才设置的用户名和密码登录。
          </p>
          <Link to={authLink("/teacher/account-login")} className="btn-primary inline-flex w-full items-center justify-center">
            {training ? '前往培训师登录' : '前往教师登录'}
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell tone="teacher" title="教师账号注册" description="设置您的教师登录账号" backTo={authLink("/teacher/login")} backLabel={training ? "返回注册码验证" : "返回邀请码验证"}>
      {training ? <div className="training-auth-verified" role="status">
        <CheckCircle size={18} aria-hidden="true" /><span>注册码已验证，完成注册后失效。</span>
      </div> : <div className="p-4 mb-5 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center space-x-2 text-green-700">
          <CheckCircle className="w-5 h-5" aria-hidden="true" />
          <span className="font-medium">{training ? '培训师注册码验证成功' : '教师码验证成功'}</span>
        </div>
        <p className="text-sm text-green-600 mt-1">
          {training ? '请设置您的培训师账号信息，注册完成后该注册码失效' : '请设置您的教师账号信息，设置完成后该教师码将失效'}
        </p>
      </div>}

      {error && (
        <div role="alert" id="auth-error" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="auth-username" className="block text-sm font-medium text-gray-700 mb-1">
            用户名 <span className="text-xs text-gray-500">(字母+数字组合)</span>
          </label>
          <input autoComplete="username" aria-invalid={Boolean(fieldErrors.username)} aria-describedby={fieldErrors.username ? "auth-username-error" : undefined} id="auth-username"
            type="text"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            className={`input ${fieldErrors.username ? 'border-red-500' : ''}`}
            placeholder="如：teacher01"
            required
          />
          {fieldErrors.username && (
            <p role="alert" id="auth-username-error" className="mt-1 text-xs text-red-500">{fieldErrors.username}</p>
          )}
        </div>

        <div>
          <label htmlFor="auth-nickname" className="block text-sm font-medium text-gray-700 mb-1">
            真实姓名 <span className="text-xs text-gray-500">(必填)</span>
          </label>
          <input aria-invalid={Boolean(fieldErrors.nickname)} aria-describedby={fieldErrors.nickname ? "auth-nickname-error" : undefined} id="auth-nickname"
            type="text"
            value={formData.nickname}
            onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
            className={`input ${fieldErrors.nickname ? 'border-red-500' : ''}`}
            placeholder="请输入您的真实姓名"
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
            <span>完成注册</span>
          )}
        </button>
      </form>

      {training && <div className="training-auth-register-entry">
        <span>已有培训师账号？</span>
        <Link to={authLink("/teacher/account-login")} className="text-action hover:underline font-medium">已有账号，去登录</Link>
      </div>}
      <div className="hui-auth-note">
        <strong>账号说明</strong>
        <div>{training ? '注册码仅用于首次注册。账号经平台管理员审核后可以登录，有效期为1年。' : '提交后教师码即失效。账号需管理员审核通过后才能登录，有效期为1年。'}</div>
      </div>
    </AuthShell>
  )
}

export default TeacherRegister
