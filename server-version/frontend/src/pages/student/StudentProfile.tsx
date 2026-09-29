import React, { useEffect, useState } from 'react'
import { CheckCircle, Eye, EyeOff, Loader2, Lock, Save, User } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import apiClient from '../../api/client'
import { isValidPassword, passwordPolicyMessage } from '../../utils/password'
import { PageHeader } from '../../components/product-ui/PageHeader'
import { ProductPage } from '../../components/product-ui/ProductPage'

const StudentProfile: React.FC = () => {
  const { user, setUser } = useAuth()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [nickname, setNickname] = useState(user?.nickname || '')
  const [nicknameError, setNicknameError] = useState('')
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showOldPassword, setShowOldPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchUserInfo()
  }, [])

  const fetchUserInfo = async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const response = await apiClient.get('/users/me')
      if (response.code === 0 && response.data) {
        setNickname(response.data.nickname || '')
        setUser(response.data)
      } else {
        setLoadError(response.message || '获取用户信息失败')
      }
    } catch (fetchError) {
      console.error('获取用户信息失败:', fetchError)
      setLoadError((fetchError as { message?: string }).message || '获取用户信息失败')
    } finally {
      setLoading(false)
    }
  }

  const validateNickname = (value: string) => {
    const regex = /^(?:[\u4e00-\u9fa5]{2,10}|[a-zA-Z\s]{2,20})$/
    return regex.test(value) ? '' : '请输入中文昵称（中文2-10字或英文2-20字母）'
  }

  const validatePassword = (password: string) => (
    isValidPassword(password) ? '' : passwordPolicyMessage
  )

  const handleUpdateProfile = async (event: React.FormEvent) => {
    event.preventDefault()

    const validationError = validateNickname(nickname)
    if (validationError) {
      setNicknameError(validationError)
      return
    }
    setNicknameError('')

    try {
      setSaving(true)
      setMessage(null)
      const response = await apiClient.put(`/users/${user?.id}`, { nickname: nickname.trim() })
      if (response.code === 0) {
        setUser(response.data)
        setMessage({ type: 'success', text: '姓名修改成功' })
      } else {
        setMessage({ type: 'error', text: response.message || '修改失败' })
      }
    } catch (operationError: any) {
      setMessage({ type: 'error', text: operationError.message || '修改失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault()

    const errors: Record<string, string> = {}
    if (!oldPassword) errors.oldPassword = '请输入原密码'

    const newPasswordError = validatePassword(newPassword)
    if (newPasswordError) errors.newPassword = newPasswordError
    if (newPassword !== confirmPassword) errors.confirmPassword = '两次输入的密码不一致'

    if (Object.keys(errors).length > 0) {
      setPasswordErrors(errors)
      return
    }

    setPasswordErrors({})
    try {
      setSaving(true)
      setMessage(null)
      const response = await apiClient.post('/users/change-password', { oldPassword, newPassword })
      if (response.code === 0) {
        setMessage({ type: 'success', text: '密码修改成功' })
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setShowPasswordForm(false)
      } else {
        setMessage({ type: 'error', text: response.message || '修改失败' })
      }
    } catch (operationError: any) {
      setMessage({ type: 'error', text: operationError.message || '修改失败' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <ProductPage width="reading" className="hui-student-page hui-student-profile space-y-6">
      <PageHeader title="个人资料" description="管理显示姓名与登录密码。" />

      {loadError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{loadError}</span>
            <button type="button" className="btn-secondary" onClick={() => void fetchUserInfo()}>重试</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-action" aria-hidden="true" />
          <span className="sr-only">正在加载个人资料</span>
        </div>
      ) : (
        <>
          {message && (
            <div
              role={message.type === 'error' ? 'alert' : 'status'}
              className={`rounded-lg border p-4 ${message.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}
            >
              <div className="flex items-center gap-2">
                {message.type === 'success' && <CheckCircle className="h-5 w-5" aria-hidden="true" />}
                <span>{message.text}</span>
              </div>
            </div>
          )}

          <section className="card" aria-labelledby="student-profile-info-title">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-action/10">
                <User className="h-8 w-8 text-action" aria-hidden="true" />
              </div>
              <div>
                <h2 id="student-profile-info-title" className="text-lg font-semibold text-gray-800">{user?.nickname || user?.username}</h2>
                <p className="text-gray-500">{user?.username}</p>
              </div>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label htmlFor="profile-nickname" className="mb-1 block text-sm font-medium text-gray-700">
                  中文昵称 <span className="text-xs text-gray-500">(中文2-10字或英文2-20字母)</span>
                </label>
                <input
                  id="profile-nickname"
                  aria-invalid={Boolean(nicknameError)}
                  aria-describedby={nicknameError ? 'profile-nickname-error' : undefined}
                  type="text"
                  value={nickname}
                  onChange={event => {
                    setNickname(event.target.value)
                    setNicknameError('')
                  }}
                  className={`input ${nicknameError ? 'border-red-500' : ''}`}
                  placeholder="请输入中文昵称"
                />
                {nicknameError && <p role="alert" id="profile-nickname-error" className="mt-1 text-xs text-red-500">{nicknameError}</p>}
              </div>

              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-gray-500">账号状态: <span className="font-medium text-green-600">正常</span></div>
                <button type="submit" disabled={saving} className="btn-primary inline-flex items-center justify-center gap-2">
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /><span>保存中...</span></> : <><Save className="h-4 w-4" aria-hidden="true" /><span>保存修改</span></>}
                </button>
              </div>
            </form>
          </section>

          <section className="card" aria-labelledby="student-password-title">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-gray-600" aria-hidden="true" />
                <h2 id="student-password-title" className="text-lg font-semibold text-gray-800">修改密码</h2>
              </div>
              <button type="button" onClick={() => setShowPasswordForm(current => !current)} className="text-sm text-action hover:underline" aria-expanded={showPasswordForm}>
                {showPasswordForm ? '取消' : '修改密码'}
              </button>
            </div>

            {showPasswordForm && (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label htmlFor="profile-oldPassword" className="mb-1 block text-sm font-medium text-gray-700">原密码</label>
                  <div className="relative">
                    <input
                      id="profile-oldPassword"
                      aria-invalid={Boolean(passwordErrors.oldPassword)}
                      aria-describedby={passwordErrors.oldPassword ? 'profile-oldPassword-error' : undefined}
                      type={showOldPassword ? 'text' : 'password'}
                      value={oldPassword}
                      onChange={event => {
                        setOldPassword(event.target.value)
                        setPasswordErrors({ ...passwordErrors, oldPassword: '' })
                      }}
                      className={`input pr-10 ${passwordErrors.oldPassword ? 'border-red-500' : ''}`}
                      placeholder="请输入原密码"
                    />
                    <button type="button" aria-label={showOldPassword ? '隐藏原密码' : '显示原密码'} onClick={() => setShowOldPassword(current => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showOldPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                  {passwordErrors.oldPassword && <p role="alert" id="profile-oldPassword-error" className="mt-1 text-xs text-red-500">{passwordErrors.oldPassword}</p>}
                </div>

                <div>
                  <label htmlFor="profile-newPassword" className="mb-1 block text-sm font-medium text-gray-700">
                    新密码 <span className="text-xs text-gray-500">(字母+数字，8-128位)</span>
                  </label>
                  <div className="relative">
                    <input
                      id="profile-newPassword"
                      aria-invalid={Boolean(passwordErrors.newPassword)}
                      aria-describedby={passwordErrors.newPassword ? 'profile-newPassword-error' : undefined}
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={event => {
                        setNewPassword(event.target.value)
                        setPasswordErrors({ ...passwordErrors, newPassword: '' })
                      }}
                      className={`input pr-10 ${passwordErrors.newPassword ? 'border-red-500' : ''}`}
                      placeholder="请输入新密码"
                    />
                    <button type="button" aria-label={showNewPassword ? '隐藏新密码' : '显示新密码'} onClick={() => setShowNewPassword(current => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showNewPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                  {passwordErrors.newPassword && <p role="alert" id="profile-newPassword-error" className="mt-1 text-xs text-red-500">{passwordErrors.newPassword}</p>}
                </div>

                <div>
                  <label htmlFor="profile-confirmPassword" className="mb-1 block text-sm font-medium text-gray-700">确认新密码</label>
                  <input
                    id="profile-confirmPassword"
                    aria-invalid={Boolean(passwordErrors.confirmPassword)}
                    aria-describedby={passwordErrors.confirmPassword ? 'profile-confirmPassword-error' : undefined}
                    type="password"
                    value={confirmPassword}
                    onChange={event => {
                      setConfirmPassword(event.target.value)
                      setPasswordErrors({ ...passwordErrors, confirmPassword: '' })
                    }}
                    className={`input ${passwordErrors.confirmPassword ? 'border-red-500' : ''}`}
                    placeholder="请再次输入新密码"
                  />
                  {passwordErrors.confirmPassword && <p role="alert" id="profile-confirmPassword-error" className="mt-1 text-xs text-red-500">{passwordErrors.confirmPassword}</p>}
                </div>

                <div className="pt-4">
                  <button type="submit" disabled={saving} className="btn-primary flex w-full items-center justify-center gap-2">
                    {saving ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /><span>修改中...</span></> : <span>确认修改密码</span>}
                  </button>
                </div>
              </form>
            )}
          </section>
        </>
      )}
    </ProductPage>
  )
}

export default StudentProfile