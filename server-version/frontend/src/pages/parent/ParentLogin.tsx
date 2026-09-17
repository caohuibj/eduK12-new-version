import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Users } from 'lucide-react'
import LoginRecoveryNotice from '../../components/app-shell/LoginRecoveryNotice'
import { useLoginReturn } from '../../components/app-shell/useLoginReturn'
import { useAuth } from '../../contexts/AuthContext'

export default function ParentLogin() {
  const completeLogin = useLoginReturn()
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
  return <div className="min-h-screen bg-gradient-to-br from-sky-50 to-indigo-50 flex items-center justify-center p-4">
    <div className="w-full max-w-md">
      <Link to="/" className="inline-flex items-center text-gray-600 hover:text-gray-800 mb-6"><ArrowLeft className="w-5 h-5 mr-1" />返回入口</Link>
      <div className="text-center mb-8"><div className="w-16 h-16 bg-gradient-to-br from-sky-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"><Users className="w-10 h-10 text-white" /></div><h1 className="text-2xl font-bold text-gray-800">家长登录</h1><p className="text-gray-500 mt-2">使用学校为您建立的家长账号</p></div>
      <div className="card"><LoginRecoveryNotice />{error && <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}
        <form onSubmit={submit} className="space-y-4">
          <div><label htmlFor="parent-username" className="block text-sm font-medium text-gray-700 mb-1">用户名</label><input id="parent-username" autoComplete="username" className="input" value={username} onChange={(event) => setUsername(event.target.value)} required /></div>
          <div><label htmlFor="parent-password" className="block text-sm font-medium text-gray-700 mb-1">密码</label><input id="parent-password" type="password" autoComplete="current-password" className="input" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
          <button type="submit" disabled={loading} className="w-full btn-primary flex items-center justify-center gap-2">{loading && <Loader2 className="w-5 h-5 animate-spin" />}{loading ? '登录中…' : '登录'}</button>
        </form>
      </div>
    </div>
  </div>
}
