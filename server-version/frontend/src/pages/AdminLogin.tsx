import SurveyAdminOrigin from '../components/app-shell/SurveyAdminOrigin'
import { productOrigins, SURVEY_ADMIN_PATH } from '../products/origins'
import { SurveyBrand } from '../survey/SurveyBrand'
import '../survey/survey-admin-auth.css'
import LoginRecoveryNotice from '../components/app-shell/LoginRecoveryNotice'
import AuthShell from '../components/auth/AuthShell'
import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { adminReturnTo } from '../admin/authority'
import { useAuth } from '../contexts/AuthContext'
import { Link } from 'react-router-dom'
import TrainingBrand from '../training/TrainingBrand'
import '../training/training-admin-auth.css'

const AdminLogin: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const origins=productOrigins()
  const surveyEntry=Boolean(origins&&new URLSearchParams(location.search).get('returnTo')===SURVEY_ADMIN_PATH)
  const trainingEntry=new URLSearchParams(location.search).get('returnTo')==='/admin/training'
  const homeOrigin=new URL(origins?.admin??window.location.origin)
  if(import.meta.env.DEV&&['localhost','127.0.0.1'].includes(homeOrigin.hostname))homeOrigin.hostname='training.localhost'
  const trainingHome=homeOrigin.origin+'/'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [method, setMethod] = useState<'TOTP' | 'SECURITY_KEY'>('TOTP')
  const [code, setCode] = useState('')
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const user = await login(formData.username, formData.password, undefined, 'admin', {method,...(method==='TOTP'?{code}:{})})
      if(user) navigate(adminReturnTo(user,new URLSearchParams(location.search).get('returnTo')),{replace:true})
    } catch (err: any) {
      setError(err.message || '登录失败')
    } finally {
      setCode('')
      setLoading(false)
    }
  }

  return (
    <AuthShell tone="admin" title={trainingEntry?'培训管理员登录':'管理员登录'} description={trainingEntry?'账号审核、课程监管与资源授权，从这里开始。':surveyEntry?'Survey · 研究者资格、邀请与工具授权':'密码与 Authenticator 动态码验证，按入口授权管理'}
      {...(trainingEntry?{
        brand:<a className="hui-auth-brand" href={trainingHome} aria-label="Training 首页"><TrainingBrand /></a>,
        className:'training-admin-auth',backTo:trainingHome,backLabel:'返回 Training 首页',
        heroTitle:'培训有序，\n管理有据。',heroDescription:'在独立的培训管理空间，连接账号、课程与资源，让教与学各得其所。',
        heroBullets:['培训师审核与账号管理','培训课程监管与查询','教学素材与测评资源授权'],
        heroLabel:'Training 培训管理介绍',tagline:'仅限已获 Training 管理授权的账号',
      }:{})}
      {...(surveyEntry&&origins?{
        brand:<SurveyBrand href={origins.survey+'/'}/>,className:'survey-admin-auth',
        backTo:origins.survey+'/',backLabel:'返回 Survey 首页',
        heroTitle:'让研究有序开展，边界清晰可见。',
        heroDescription:'为研究者开通独立身份，核对工具的精确授权版本，让研究从清晰的起点开始。',
        heroBullets:['研究者资格与安全恢复','一次性邀请与受控交付','工具对象与精确版本授权'],
        tagline:'观风知微 · 心理与教育测量研究平台',
      }:{})}>
      <div className="hui-auth-note mt-0 mb-5">
        <strong>{trainingEntry?'Training 管理身份':'管理员身份'}</strong>
        <div>{trainingEntry?'使用已获培训管理授权的账号、密码与手机验证器动态码登录。系统治理和其他产品管理分别授权。':'使用密码与手机验证器的六位动态码登录。微软 Authenticator 等兼容验证器均可使用；每个入口分别授权。'}</div>
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

        <label className="block">验证方式
          <select className="input" value={method} disabled={loading} onChange={e=>{setMethod(e.target.value as typeof method);setCode('');setError('')}}>
            <option value="TOTP">Authenticator 动态码</option><option value="SECURITY_KEY">已登记的安全密钥</option>
          </select>
        </label>
        {method==='TOTP'&&<label className="block" htmlFor="admin-totp-code">Authenticator 六位动态码
          <input id="admin-totp-code" className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
            value={code} required disabled={loading} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/>
        </label>}

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
      <p className="mt-4"><Link to={trainingEntry?'/admin/security/enroll?returnTo=%2Fadmin%2Ftraining':surveyEntry?'/admin/security/enroll?returnTo='+encodeURIComponent(SURVEY_ADMIN_PATH):'/admin/security/enroll'}>首次绑定 Authenticator</Link></p>
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
