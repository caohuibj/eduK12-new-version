import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import AuthShell from '../components/auth/AuthShell'
import { useAuthLinks } from '../components/app-shell/useAuthLinks'
import apiClient from '../api/client'

type CodeEntry = { kind: 'STUDENT'; code: string; course: { courseId: string; courseName: string } }
  | { kind: 'TEACHER'; code: string }

export default function TrainingRegister() {
  const authLink = useAuthLinks()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (loading) return
    setLoading(true); setError('')
    try {
      const response = await apiClient.post<CodeEntry>('/auth/training-resolve-code', { code: code.trim() })
      const entry = response.code === 0 ? response.data : null
      if (entry?.kind === 'STUDENT' && entry.course?.courseId && entry.course.courseName && entry.code) {
        navigate(authLink(`/student/register?course=${encodeURIComponent(entry.code)}`), {
          state: { verifiedCourseCode: entry.code, verifiedCourse: entry.course },
        })
      } else if (entry?.kind === 'TEACHER' && entry.code) {
        navigate(authLink(`/teacher/register?code=${encodeURIComponent(entry.code)}`))
      } else { setError(response.message || '注册码暂不可用，请核实或联系提供者') }
    } catch (err) { setError(err instanceof Error ? err.message : '验证失败，请重试') }
    finally { setLoading(false) }
  }
  return <AuthShell tone="student" trainingUnified title="注册 Huitraining" description="输入注册码，自动进入对应的账号注册。" registrationStep="verify">
    {error && <div role="alert" id="auth-error" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}
    <form onSubmit={submit} className="space-y-4">
      <div><label htmlFor="auth-code" className="block text-sm font-medium text-gray-700 mb-1">注册码</label>
        <input id="auth-code" autoComplete="off" maxLength={128} value={code} onChange={e => setCode(e.target.value)} aria-describedby={error ? 'auth-error' : undefined} className="input" placeholder="请输入课程码或培训师注册码" required />
        <p className="mt-2 text-xs text-gray-500">课程码由培训师提供，培训师注册码由平台管理员提供。</p></div>
      <button type="submit" disabled={loading} className="w-full btn-primary flex items-center justify-center space-x-2">
        {loading && <Loader2 size={20} className="animate-spin" aria-hidden="true" />}<span>{loading ? '验证中…' : '验证并继续'}</span></button>
    </form>
    <div className="training-auth-register-entry"><span>已有账号？</span><Link to={authLink('/login')} className="text-action hover:underline font-medium">直接登录</Link></div>
    <div className="hui-auth-note">验证后设置账号信息。培训师账号仍需管理员审核，学员账号按原课程规则加入课程。</div>
  </AuthShell>
}
