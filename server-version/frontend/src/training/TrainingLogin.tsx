import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import AuthShell from '../components/auth/AuthShell'
import LoginRecoveryNotice from '../components/app-shell/LoginRecoveryNotice'
import { useAuthLinks } from '../components/app-shell/useAuthLinks'
import { useLoginReturn } from '../components/app-shell/useLoginReturn'
import { useAuth } from '../contexts/AuthContext'

export default function TrainingLogin() {
  const authLink = useAuthLinks()
  const completeLogin = useLoginReturn()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (loading) return
    setLoading(true); setError('')
    try { await login(username, password); completeLogin() }
    catch (err) { setError(err instanceof Error ? err.message : '登录失败，请重试') }
    finally { setLoading(false) }
  }
  return <AuthShell tone="student" trainingUnified title="登录 Huitraining" description="使用账号登录，自动进入你的工作台。">
    <LoginRecoveryNotice />
    {error && <div role="alert" id="auth-error" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}{error.includes('管理员入口')&&<p><Link to={authLink('/admin/login')}>使用管理员入口</Link></p>}</div>}
    <form onSubmit={submit} className="space-y-4">
      <div><label htmlFor="auth-username" className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
        <input id="auth-username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} aria-describedby={error ? 'auth-error' : undefined} className="input" placeholder="请输入用户名" required /></div>
      <div><label htmlFor="auth-password" className="block text-sm font-medium text-gray-700 mb-1">密码</label>
        <input id="auth-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} aria-describedby={error ? 'auth-error' : undefined} className="input" placeholder="请输入密码" required /></div>
      <button type="submit" disabled={loading} className="w-full btn-primary flex items-center justify-center space-x-2">
        {loading && <Loader2 size={20} className="animate-spin" aria-hidden="true" />}<span>{loading ? '登录中…' : '登录'}</span></button>
    </form>
    <div className="training-auth-register-entry"><span>还没有账号？</span><Link to={authLink('/register')} className="text-action hover:underline font-medium">使用注册码注册</Link></div>
    <div className="hui-auth-note">培训师账号审核通过后可登录。账号身份由系统识别，无需选择。</div>
  </AuthShell>
}
