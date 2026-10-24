import {isTrainingAdminPath} from '../admin/trainingPages'
import SurveyAdminOrigin from '../components/app-shell/SurveyAdminOrigin'
import { productOrigins, SURVEY_ADMIN_PATH } from '../products/origins'
import SurveyAdminEntryShell from '../survey/SurveyAdminEntryShell'
import { SurveyAdminAppearance } from '../survey/SurveyAdminAppearance'
import { useSurveyAppearance } from '../survey/SurveyAppearance'
import { surveyAppearanceHref } from '../survey/survey-appearance-links'
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
import TrainingAdminLoginShell from '../training/TrainingAdminLoginShell'
import { readReauthReturn } from '../components/app-shell/access'
import '../training/training-admin-auth.css'

const AdminLogin: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const { mode } = useSurveyAppearance()
  const origins=productOrigins()
  const surveyEntry=Boolean(origins&&new URLSearchParams(location.search).get('returnTo')===SURVEY_ADMIN_PATH)
  const trainingEntry=isTrainingAdminPath(new URLSearchParams(location.search).get('returnTo')??'')
  const homeOrigin=new URL(origins?.admin??window.location.origin)
  if(import.meta.env.DEV&&['localhost','127.0.0.1'].includes(homeOrigin.hostname))homeOrigin.hostname='training.localhost'
  const trainingHome=homeOrigin.origin+'/'
  const Shell = trainingEntry ? TrainingAdminLoginShell : surveyEntry ? SurveyAdminEntryShell : AuthShell
  const trainingRecovery = trainingEntry && readReauthReturn()?.target === new URLSearchParams(location.search).get('returnTo')
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
    <Shell tone="admin" title={trainingEntry?'培训管理员登录':'管理员登录'} description={trainingEntry?'使用管理员账号与手机验证器动态码登录。':surveyEntry?'Survey · 研究者资格、邀请与工具授权':'密码与 Authenticator 动态码验证，按入口授权管理'}
      {...(trainingEntry?{
        brand:<a className="hui-auth-brand" href={trainingHome} aria-label="Training 首页"><TrainingBrand /></a>,
        className:'training-admin-auth',backTo:trainingHome,backLabel:'返回 Training 首页',
        heroTitle:'培训有序，\n管理有据。',heroDescription:'在独立的培训管理空间，连接账号、课程与资源，让教与学各得其所。',
        heroBullets:['培训师审核与账号管理','培训课程监管与查询','教学素材与测评资源授权'],
        heroLabel:'Training 培训管理介绍',tagline:'仅限已获 Training 管理授权的账号',
      }:{})}>
      {!surveyEntry&&!trainingEntry&&<div className="hui-auth-note mt-0 mb-5">
        <strong>{trainingEntry?'Training 管理身份':'管理员身份'}</strong>
        <div>{trainingEntry?'使用已获培训管理授权的账号、密码与手机验证器动态码登录。系统治理和其他产品管理分别授权。':'使用密码与手机验证器的六位动态码登录。微软 Authenticator 等兼容验证器均可使用；每个入口分别授权。'}</div>
      </div>}

      {(!trainingEntry || trainingRecovery) && <LoginRecoveryNotice />}
      {error && (
        <div role="alert" id="auth-error" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className={trainingEntry ? "training-admin-login-form" : "space-y-4"}>
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
          <select className="input" value={method} disabled={loading} aria-describedby={method==='SECURITY_KEY'?'admin-security-key-help':undefined} onChange={e=>{setMethod(e.target.value as typeof method);setCode('');setError('')}}>
            <option value="TOTP">Authenticator 动态码</option><option value="SECURITY_KEY">已绑定的硬件安全密钥</option>
          </select>
        </label>
        {method==='TOTP'&&<label className="block" htmlFor="admin-totp-code">Authenticator 六位动态码
          <input aria-describedby={trainingEntry ? "training-login-totp-help" : undefined} id="admin-totp-code" className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
            value={code} required disabled={loading} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/>
        </label>}
        {trainingEntry && method==='TOTP' && <p id="training-login-totp-help" className="training-login-field-help">打开已绑定的 Authenticator，输入当前显示的 6 位数字。</p>}
        {method==='SECURITY_KEY'&&<p id="admin-security-key-help" className="survey-admin-key-note">连接已绑定的实体安全密钥，按提示输入密钥 PIN 或验证指纹。没有密钥时，可选 Authenticator 动态码。</p>}

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
      {surveyEntry?<div className="survey-admin-auth-tools">
        <Link to={surveyAppearanceHref('/admin/security/enroll?returnTo='+encodeURIComponent(SURVEY_ADMIN_PATH),mode)}>首次绑定 Authenticator</Link>
      </div>:trainingEntry?<>
        <div className="training-login-enroll"><span>第一次使用？</span><Link to="/admin/security/enroll?returnTo=%2Fadmin%2Ftraining">首次绑定 Authenticator</Link></div>
        <details className="training-login-help">
          <summary>登录方法说明</summary>
          <div className="training-login-instructions">
            <p><strong>首次使用</strong>：准备管理员账号、密码和有效的一次性绑定码，点击「首次绑定 Authenticator」，按提示扫码并完成绑定。</p>
            <ol>
              <li><strong>输入账号和密码</strong>：使用已获 Training 管理授权的账号。</li>
              <li><strong>完成身份验证</strong>：打开 Microsoft Authenticator、Google Authenticator 等验证器，找到已绑定的管理账号，输入当前显示的 6 位动态码。若倒计时即将结束，请等待下一组数字。</li>
              <li><strong>进入管理页面</strong>：点击「管理员登录」，进入培训管理或继续原来的操作。</li>
            </ol>
            <p>已绑定实体安全密钥时，可在「验证方式」中切换为硬件安全密钥，再按提示连接密钥并验证。尚未绑定时，请使用 Authenticator。</p>
          </div>
        </details>
      </>:<p className="mt-4"><Link to="/admin/security/enroll">首次绑定 Authenticator</Link></p>}
    </Shell>
  )
}

export default function AdminLoginEntry() {
  // Only known product aliases require canonicalization; other legacy admin entries retain their routes.
  const origins = productOrigins()
  return origins && origins.admin !== window.location.origin
    ? <SurveyAdminOrigin login><SurveyAdminAppearance><AdminLogin /></SurveyAdminAppearance></SurveyAdminOrigin>
    : <SurveyAdminAppearance><AdminLogin /></SurveyAdminAppearance>
}
