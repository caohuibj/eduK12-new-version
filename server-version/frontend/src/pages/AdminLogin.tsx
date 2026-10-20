import SurveyAdminOrigin from '../components/app-shell/SurveyAdminOrigin'
import { productOrigins } from '../products/origins'
import LoginRecoveryNotice from '../components/app-shell/LoginRecoveryNotice'
import AuthShell from '../components/auth/AuthShell'
import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { adminReturnTo } from '../admin/authority'
import { useAuth } from '../contexts/AuthContext'

const AdminLogin: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const user = await login(formData.username, formData.password, undefined, 'admin')
      if(user) navigate(adminReturnTo(user,new URLSearchParams(location.search).get('returnTo')),{replace:true})
    } catch (err: any) {
      setError(err.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell tone="admin" title="管理员登录" description="密码与安全密钥验证，按入口授权管理">
      <div className="hui-auth-note mt-0 mb-5">
        <strong>管理员身份</strong>
        <div>管理账号需要密码与支持用户验证的安全密钥。每个入口分别授权，具体数据范围以当前权限为准。</div>
      </div>

      <LoginRecoveryNotice />
      {error && (
        <div role="alert" id="auth-error" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="auth-username" className="block text-sm font-medium text-gray-700 mb-1">
            管理员账号
          </label>
          <input autoComplete="username" aria-describedby={error ? "auth-error" : undefined} id="auth-username"
            type="text"
            value={formData.username}
            onChange={(e) =>
              setFormData({ ...formData, username: e.target.value })
            }
            className="input"
            placeholder="请输入管理员账号"
            required
          />
        </div>

        <div>
          <label htmlFor="auth-password" className="block text-sm font-medium text-gray-700 mb-1">
            密码
          </label>
          <input autoComplete="current-password" aria-describedby={error ? "auth-error" : undefined} id="auth-password"
            type="password"
            value={formData.password}
            onChange={(e) =>
              setFormData({ ...formData, password: e.target.value })
            }
            className="input"
            placeholder="请输入密码"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full btn-primary flex items-center justify-center space-x-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>登录中...</span>
            </>
          ) : (
            <span>管理员登录</span>
          )}
        </button>
      </form>
    </AuthShell>
  )
}

export default function AdminLoginEntry() {
  // Only known product aliases require canonicalization; other legacy admin entries retain their routes.
  const origins = productOrigins()
  return origins && origins.admin !== window.location.origin
    ? <SurveyAdminOrigin login><AdminLogin /></SurveyAdminOrigin>
    : <AdminLogin />
}
