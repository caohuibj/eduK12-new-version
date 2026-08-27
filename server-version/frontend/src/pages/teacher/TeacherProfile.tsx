import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Lock, Save, Loader2, Eye, EyeOff, CheckCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import apiClient from '../../api/client'
import { isValidPassword, passwordPolicyMessage } from '../../utils/password'

const TeacherProfile: React.FC = () => {
  const navigate = useNavigate()
  const { user, setUser } = useAuth()
  
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  
  // Profile form
  const [nickname, setNickname] = useState(user?.nickname || '')
  const [nicknameError, setNicknameError] = useState('')
  
  // Password form
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
      const response = await apiClient.get('/users/me')
      if (response.code === 0 && response.data) {
        setNickname(response.data.nickname || '')
        setUser(response.data)
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const validateNickname = (value: string) => {
    // 支持中文姓名（2-10字）或英文姓名（2-20字母，允许空格）
    const regex = /^(?:[\u4e00-\u9fa5]{2,10}|[a-zA-Z\s]{2,20})$/
    if (!regex.test(value)) {
      return '请输入真实姓名（中文2-10字或英文2-20字母）'
    }
    return ''
  }

  const validatePassword = (password: string) => {
    if (!isValidPassword(password)) {
      return passwordPolicyMessage
    }
    return ''
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const error = validateNickname(nickname)
    if (error) {
      setNicknameError(error)
      return
    }
    setNicknameError('')

    try {
      setSaving(true)
      setMessage(null)
      
      const response = await apiClient.put(`/users/${user?.id}`, {
        nickname: nickname.trim()
      })
      
      if (response.code === 0) {
        setUser(response.data)
        setMessage({ type: 'success', text: '姓名修改成功' })
      } else {
        setMessage({ type: 'error', text: response.message || '修改失败' })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '修改失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const errors: Record<string, string> = {}
    
    if (!oldPassword) {
      errors.oldPassword = '请输入原密码'
    }
    
    const newPasswordError = validatePassword(newPassword)
    if (newPasswordError) {
      errors.newPassword = newPasswordError
    }
    
    if (newPassword !== confirmPassword) {
      errors.confirmPassword = '两次输入的密码不一致'
    }
    
    if (Object.keys(errors).length > 0) {
      setPasswordErrors(errors)
      return
    }
    
    setPasswordErrors({})

    try {
      setSaving(true)
      setMessage(null)
      
      const response = await apiClient.post('/users/change-password', {
        oldPassword,
        newPassword
      })
      
      if (response.code === 0) {
        setMessage({ type: 'success', text: '密码修改成功' })
        // Reset password form
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setShowPasswordForm(false)
      } else {
        setMessage({ type: 'error', text: response.message || '修改失败' })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '修改失败' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">个人资料</h1>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-700' 
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          <div className="flex items-center space-x-2">
            {message.type === 'success' && <CheckCircle className="w-5 h-5" />}
            <span>{message.text}</span>
          </div>
        </div>
      )}

      {/* Profile Info Card */}
      <div className="card">
        <div className="flex items-center space-x-4 mb-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <User className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{user?.nickname || user?.username}</h2>
            <p className="text-gray-500">{user?.username}</p>
          </div>
        </div>

        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              真实姓名 <span className="text-xs text-gray-500">(中文2-10字或英文2-20字母)</span>
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value)
                setNicknameError('')
              }}
              className={`input ${nicknameError ? 'border-red-500' : ''}`}
              placeholder="请输入真实姓名"
            />
            {nicknameError && (
              <p className="mt-1 text-xs text-red-500">{nicknameError}</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-gray-500">
              账号状态: <span className="text-green-600 font-medium">正常</span>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex items-center space-x-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>保存中...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>保存修改</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Password Change Card */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Lock className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-800">修改密码</h2>
          </div>
          <button
            onClick={() => setShowPasswordForm(!showPasswordForm)}
            className="text-primary hover:underline text-sm"
          >
            {showPasswordForm ? '取消' : '修改密码'}
          </button>
        </div>

        {showPasswordForm && (
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                原密码
              </label>
              <div className="relative">
                <input
                  type={showOldPassword ? 'text' : 'password'}
                  value={oldPassword}
                  onChange={(e) => {
                    setOldPassword(e.target.value)
                    setPasswordErrors({ ...passwordErrors, oldPassword: '' })
                  }}
                  className={`input pr-10 ${passwordErrors.oldPassword ? 'border-red-500' : ''}`}
                  placeholder="请输入原密码"
                />
                <button
                  type="button"
                  onClick={() => setShowOldPassword(!showOldPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordErrors.oldPassword && (
                <p className="mt-1 text-xs text-red-500">{passwordErrors.oldPassword}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                新密码 <span className="text-xs text-gray-500">(字母+数字，8-128位)</span>
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value)
                    setPasswordErrors({ ...passwordErrors, newPassword: '' })
                  }}
                  className={`input pr-10 ${passwordErrors.newPassword ? 'border-red-500' : ''}`}
                  placeholder="请输入新密码"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordErrors.newPassword && (
                <p className="mt-1 text-xs text-red-500">{passwordErrors.newPassword}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                确认新密码
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setPasswordErrors({ ...passwordErrors, confirmPassword: '' })
                }}
                className={`input ${passwordErrors.confirmPassword ? 'border-red-500' : ''}`}
                placeholder="请再次输入新密码"
              />
              {passwordErrors.confirmPassword && (
                <p className="mt-1 text-xs text-red-500">{passwordErrors.confirmPassword}</p>
              )}
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={saving}
                className="w-full btn-primary flex items-center justify-center space-x-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>修改中...</span>
                  </>
                ) : (
                  <span>确认修改密码</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default TeacherProfile
