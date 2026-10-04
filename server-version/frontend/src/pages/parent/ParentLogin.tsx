import { useCapabilities } from '../../contexts/CapabilitiesContext'
import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'
import LoginRecoveryNotice from '../../components/app-shell/LoginRecoveryNotice'
import { useLoginReturn } from '../../components/app-shell/useLoginReturn'
import { ProductButton } from '../../components/product-ui'
import AuthShell from '../../components/auth/AuthShell'
import { useAuth } from '../../contexts/AuthContext'

export default function ParentLogin() {
  const completeLogin = useLoginReturn()
  const { parentPortalEnabled, isLoading, status, retry } = useCapabilities()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true); setError('')
    try { await login(username, password); completeLogin() }
    catch (err: any) { setError(err.message || '登录失败') }
    finally { setLoading(false) }
  }

  return <AuthShell tone="parent" title="家长登录" description="使用学校为您建立的家长账号">
    <LoginRecoveryNotice />
    {!parentPortalEnabled ? <div role="status" className="hui-auth-note">{status==='error'?<>家长入口状态读取失败，请重试。<ProductButton onClick={retry}>重试</ProductButton></>:isLoading ? '正在确认家长入口状态…' : '家长入口尚未开放，请以学校通知为准。您可以返回入口使用其他已开放的身份。'}</div> : <>
    {error && <div role="alert" id="parent-auth-error" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="parent-username" className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
        <input id="parent-username" autoComplete="username" aria-describedby={error ? 'parent-auth-error' : undefined} className="input" value={username} onChange={(event) => setUsername(event.target.value)} required />
      </div>
      <div>
        <label htmlFor="parent-password" className="block text-sm font-medium text-gray-700 mb-1">密码</label>
        <input id="parent-password" type="password" autoComplete="current-password" aria-describedby={error ? 'parent-auth-error' : undefined} className="input" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </div>
      <button type="submit" disabled={loading} className="w-full btn-primary flex items-center justify-center gap-2">
        {loading && <Loader2 className="w-5 h-5 animate-spin" />}{loading ? '登录中…' : '登录'}
      </button>
    </form>
    <div className="hui-auth-note">
      学校建立的家长账号用于观察测评与家长反馈；具体可见内容以当前学校任务为准。
    </div>
    </>}
  </AuthShell>
}
