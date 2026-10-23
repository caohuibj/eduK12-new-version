import {useState} from 'react'
import {Link,useLocation} from 'react-router-dom'
import {QRCodeSVG} from 'qrcode.react'
import AuthShell from '../components/auth/AuthShell'
import EducationAdminEntryShell from '../pages/admin/EducationAdminEntryShell'
import {educationEntry} from '../pages/admin/education-entry'
import SurveyAdminEntryShell from '../survey/SurveyAdminEntryShell'
import {beginTotpEnrollment,confirmTotpEnrollment,enrollSecurityKey} from './securityKey'
import api from '../api/client'
import {productOrigins,SURVEY_ADMIN_PATH} from '../products/origins'
import {SurveyAdminAppearance} from '../survey/SurveyAdminAppearance'
import {useSurveyAppearance} from '../survey/SurveyAppearance'
import {surveyAppearanceHref} from '../survey/survey-appearance-links'
import '../survey/survey-admin-auth.css'

function AdminKeyEnrollment(){
  const location=useLocation(),origins=productOrigins()
  const {mode}=useSurveyAppearance()
  const surveyEntry=Boolean(origins&&new URLSearchParams(location.search).get('returnTo')===SURVEY_ADMIN_PATH)
  const trainingEntry=new URLSearchParams(location.search).get('returnTo')==='/admin/training'
  const educationProduct=educationEntry(location.search)
  const Shell=educationProduct?EducationAdminEntryShell:surveyEntry?SurveyAdminEntryShell:AuthShell
  const loginPath=educationProduct?`/admin/login?returnTo=${encodeURIComponent(educationProduct==='School'?'/admin/huischool':'/admin/huiteacher')}`:surveyEntry?surveyAppearanceHref('/admin/login?returnTo='+encodeURIComponent(SURVEY_ADMIN_PATH),mode):trainingEntry?'/admin/login?returnTo=%2Fadmin%2Ftraining':'/admin/login'
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[ticket,setTicket]=useState('')
  const [method,setMethod]=useState<'TOTP'|'SECURITY_KEY'>('TOTP')
  const [uri,setUri]=useState(''),[code,setCode]=useState('')
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[registered,setRegistered]=useState(false)
  const setup=async()=>{
    setBusy(true);setMessage('')
    try{
      await api.get('/auth/csrf')
      if(method==='TOTP')setUri((await beginTotpEnrollment(username,password,ticket)).data!.otpauthUri)
      else{await enrollSecurityKey(username,password,ticket);setRegistered(true);setMessage('安全密钥已登记，请前往管理员登录。')}
      setPassword('');setTicket('')
    }catch(error){setMessage(error instanceof Error?error.message:'绑定未完成')}
    finally{setBusy(false)}
  }
  const confirm=async()=>{
    setBusy(true);setMessage('')
    try{await confirmTotpEnrollment(code);setUri('');setRegistered(true);setMessage('Authenticator 已绑定。请等待动态码更新，再使用密码与新的动态码登录。')}
    catch(error){setUri('');setMessage((error instanceof Error?error.message:'验证未完成')+'；请重新填写登记信息开始绑定。')}
    finally{setCode('');setBusy(false)}
  }
  return <Shell tone="admin" title="绑定管理员验证方式" description="使用账号、密码与一次性绑定码，绑定你的验证方式"
    {...(educationProduct?{backTo:loginPath,backLabel:`返回 ${educationProduct} 管理员登录`}:surveyEntry?{backTo:loginPath,backLabel:'返回 Survey 管理员登录'}:{})}>
    <p>{method==='TOTP'
      ?'请向平台运维人员获取一次性绑定码（15 分钟内有效），然后按提示绑定手机验证器。绑定码只能使用一次。'
      :'请先向单位领取或自行准备硬件安全密钥，再向平台运维人员获取一次性绑定码。密钥需支持 FIDO2 和 PIN 或指纹验证。'}</p>
    {!registered&&!uri&&<form className="space-y-4" onSubmit={e=>{e.preventDefault();void setup()}}>
      <label>验证方式<select className="input" value={method} disabled={busy} onChange={e=>{setMethod(e.target.value as typeof method);setMessage('')}}>
        <option value="TOTP">Authenticator 动态码</option><option value="SECURITY_KEY">硬件安全密钥（需自备）</option>
      </select></label>
      <label>管理账号<input className="input" value={username} autoComplete="username" required disabled={busy} onChange={e=>setUsername(e.target.value)}/></label>
      <label>当前密码<input className="input" type="password" autoComplete="current-password" required value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>
      <label>一次性绑定码<input className="input" type="password" autoComplete="off" required value={ticket} disabled={busy} onChange={e=>setTicket(e.target.value)}/></label>
      <button className="btn-primary" type="submit" disabled={busy}>{busy?'正在准备…':method==='TOTP'?'生成绑定二维码':'登记安全密钥'}</button>
    </form>}
    {uri&&<section aria-label="Authenticator 绑定">
      <h2>扫描二维码</h2><p>在微软 Authenticator 中选择“添加账号 → 其他账号”，扫描此二维码。</p>
      <QRCodeSVG value={uri} size={180} aria-label="管理员 Authenticator 绑定二维码"/>
      <details><summary>无法扫码？查看手动绑定密钥</summary><code className="break-all">{new URL(uri).searchParams.get('secret')}</code></details>
      <p>绑定信息仅在本页显示，请勿分享二维码或密钥。二维码最多五分钟内有效。</p>
      <form className="space-y-4" onSubmit={e=>{e.preventDefault();void confirm()}}>
        <label>Authenticator 六位动态码<input className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
          required value={code} disabled={busy} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>
        <button className="btn-primary" disabled={busy}>{busy?'正在确认…':'确认绑定'}</button>
      </form>
    </section>}
    <p role="status">{message}</p>
    <p>无法访问已绑定的验证器？请通过受控后台恢复账号后重新绑定。</p>
    <Link to={loginPath}>前往管理员登录</Link>
  </Shell>
}

export default function AdminKeyEnrollmentEntry(){
  return <SurveyAdminAppearance><AdminKeyEnrollment/></SurveyAdminAppearance>
}
