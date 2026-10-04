import { loginUrl } from '../components/app-shell/access'
import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import AuthShell, { type AuthTone } from '../components/auth/AuthShell'
import { authApi } from '../api/auth'
import { useAuth } from '../contexts/AuthContext'
import { isValidPassword, passwordPolicyMessage } from '../utils/password'

const authToneForRole = (role?: string): AuthTone => {
  if (role === 'STUDENT') return 'student'
  if (role === 'PARENT') return 'parent'
  if (role === 'ADMIN') return 'admin'
  return 'teacher'
}

const FirstLoginPasswordChange: React.FC = () => {
  const { user, setUser, logout, prepareReauthentication } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const alive = useRef(true)
  const owner = useRef(user?.id)
  const lock = useRef(false)
  owner.current = user?.id
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (lock.current) return
    if (
      !oldPassword ||
      !isValidPassword(newPassword) ||
      newPassword !== confirmPassword
    ) {
      setFeedback(
        newPassword !== confirmPassword
          ? '两次输入的新密码不一致'
          : passwordPolicyMessage,
      )
      return
    }

    const requestOwner = user?.id
    const current = () => alive.current && owner.current === requestOwner
    lock.current = true
    setSubmitting(true)
    setFeedback(null)
    try {
      await authApi.csrf()
      if (!current()) return
      const response = await authApi.changePassword(oldPassword, newPassword)
      if (!current()) return
      if (response.code !== 0)
        throw new Error(response.message || '密码修改失败')

      const target = `${location.pathname}${location.search}${location.hash}`
      prepareReauthentication(target)
      setUser(null)
      navigate(loginUrl(user?.role, target), { replace: true })
    } catch (error) {
      if (current())
        setFeedback(error instanceof Error ? error.message : '密码修改失败')
    } finally {
      lock.current = false
      if (current()) setSubmitting(false)
    }
  }

  const exit = () => {
    void logout()
    navigate('/', { replace: true })
  }

  return (
    <AuthShell
      tone={authToneForRole(user?.role)}
      title="首次登录需要修改密码"
      description="临时密码只能用于首次登录。设置新密码后，需要重新登录才能继续使用系统。"
      backLabel="退出"
      onBack={exit}
      heroTitle="先完成账号安全设置，再进入学习与测评空间"
      heroDescription="这一步只用于替换一次性临时密码，不会改变你的课程、任务或历史记录。"
      heroBullets={[
        '设置符合密码规则的新密码',
        '完成后重新登录确认身份',
        '课程与测评数据保持不变',
      ]}
    >
      {feedback ? (
        <div
          role="alert"
          id="password-change-error"
          className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {feedback}
        </div>
      ) : null}

      <form onSubmit={submit} noValidate>
        <div>
          <label htmlFor="change-old-password">临时密码</label>
          <input
            id="change-old-password"
            className="input mt-1 w-full"
            type="password"
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
            autoComplete="current-password"
            aria-describedby={feedback ? 'password-change-error' : undefined}
            required
          />
        </div>

        <div>
          <label htmlFor="change-new-password">新密码</label>
          <input
            id="change-new-password"
            className="input mt-1 w-full"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            aria-describedby="password-policy"
            required
          />
          <span
            id="password-policy"
            className="mt-2 block text-xs text-slate-500"
          >
            {passwordPolicyMessage}
          </span>
        </div>

        <div>
          <label htmlFor="change-confirm-password">确认新密码</label>
          <input
            id="change-confirm-password"
            className="input mt-1 w-full"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={submitting}
        >
          {submitting ? '修改中...' : '修改密码并重新登录'}
        </button>
      </form>

      <div className="hui-auth-note">
        <strong>密码安全</strong>
        <p className="mt-1 mb-0">
          请使用只属于你的新密码。修改成功后，当前临时登录状态会结束，并要求重新验证身份。
        </p>
      </div>
    </AuthShell>
  )
}

export default FirstLoginPasswordChange
