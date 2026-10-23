import {useState} from 'react'
import {Link,useLocation} from 'react-router-dom'
import {QRCodeSVG} from 'qrcode.react'
import AuthShell from '../components/auth/AuthShell'
import SurveyAdminEntryShell from '../survey/SurveyAdminEntryShell'
import {beginTotpEnrollment,confirmTotpEnrollment,enrollSecurityKey} from './securityKey'
import api from '../api/client'
import {productOrigins,SURVEY_ADMIN_PATH} from '../products/origins'
import {SurveyAdminAppearance} from '../survey/SurveyAdminAppearance'
import {useSurveyAppearance} from '../survey/SurveyAppearance'
import {surveyAppearanceHref} from '../survey/survey-appearance-links'
import '../survey/survey-admin-auth.css'
import TrainingBrand from '../training/TrainingBrand'
import '../training/training-admin-auth.css'

function errorMessage(error:unknown,fallback:string){
  return error&&typeof error==='object'&&'message' in error&&typeof error.message==='string'?error.message:fallback
}

function AdminKeyEnrollment(){
  const location=useLocation(),origins=productOrigins()
  const {mode}=useSurveyAppearance()
  const surveyEntry=Boolean(origins&&new URLSearchParams(location.search).get('returnTo')===SURVEY_ADMIN_PATH)
  const trainingEntry=new URLSearchParams(location.search).get('returnTo')==='/admin/training'
  const homeOrigin=new URL(origins?.admin??window.location.origin)
  if(import.meta.env.DEV&&['localhost','127.0.0.1'].includes(homeOrigin.hostname))homeOrigin.hostname='training.localhost'
  const trainingHome=homeOrigin.origin+'/'
  const Shell=surveyEntry?SurveyAdminEntryShell:AuthShell
  const loginPath=surveyEntry?surveyAppearanceHref('/admin/login?returnTo='+encodeURIComponent(SURVEY_ADMIN_PATH),mode):trainingEntry?'/admin/login?returnTo=%2Fadmin%2Ftraining':'/admin/login'
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[ticket,setTicket]=useState('')
  const [method,setMethod]=useState<'TOTP'|'SECURITY_KEY'>('TOTP')
  const [uri,setUri]=useState(''),[code,setCode]=useState('')
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[registered,setRegistered]=useState(false)
  const setup=async(input:{username:string;password:string;enrollmentToken:string})=>{
    setBusy(true);setMessage('')
    try{
      await api.get('/auth/csrf')
      if(method==='TOTP')setUri((await beginTotpEnrollment(input.username,input.password,input.enrollmentToken)).data!.otpauthUri)
      else{await enrollSecurityKey(input.username,input.password,input.enrollmentToken);setRegistered(true);setMessage('安全密钥已登记，请前往管理员登录。')}
      setPassword('');setTicket('')
    }catch(error){setMessage(errorMessage(error,'绑定未完成'))}
    finally{setBusy(false)}
  }
  const confirm=async()=>{
    setBusy(true);setMessage('')
    try{await confirmTotpEnrollment(code);setUri('');setRegistered(true);setMessage('Authenticator 已绑定。请等待动态码更新，再使用密码与新的动态码登录。')}
    catch(error){setUri('');setMessage(errorMessage(error,'验证未完成')+'；请重新填写登记信息开始绑定。')}
    finally{setCode('');setBusy(false)}
  }
  return <Shell tone="admin" title={trainingEntry?'Training 管理员首次绑定':'绑定管理员验证方式'} description={trainingEntry?'用手机验证器，为培训管理账号完成首次安全设置。':'使用账号、密码与一次性绑定码，绑定你的验证方式'}
    {...(trainingEntry?{
      brand:<a className="hui-auth-brand" href={trainingHome} aria-label="Training 首页"><TrainingBrand /></a>,
      className:'training-admin-auth training-admin-enrollment',backTo:trainingHome,backLabel:'返回 Training 首页',
      heroTitle:'先完成绑定，\n再开始管理。',heroDescription:'绑定手机验证器后，即可使用培训管理账号审核账号、监管课程与授权资源。',
      heroBullets:['准备已获授权的培训管理账号','扫码绑定自己的手机验证器','验证完成后返回 Training 管理员登录'],
      heroLabel:'Training 管理员绑定介绍',tagline:'仅限已获 Training 管理授权的账号',
    }:surveyEntry?{backTo:loginPath,backLabel:'返回 Survey 管理员登录'}:{})}>
    {trainingEntry&&<>
      <ol className="training-enrollment-steps" aria-label="首次绑定步骤">
        {['填写凭据','绑定验证器','返回登录'].map((label,index)=><li key={label} aria-current={index===(registered?2:uri?1:0)?'step':undefined}>
          <span>{index+1}</span>{label}
        </li>)}
      </ol>
      {!registered&&!uri&&<div className="hui-auth-note training-enrollment-intro">
        <strong>开始前，请准备好</strong>
        <p>运维人员提供的 Training 管理员账号、对应密码和一次性绑定码。此页为已有账号绑定验证方式，不会创建新账号。</p>
        <p>请检查浏览器自动填充的账号，避免误用 Survey 管理员或培训师账号。</p>
      </div>}
    </>}
    {trainingEntry&&!registered&&<details className="training-enrollment-help">
      <summary>第一次使用？查看{method==='TOTP'?' Authenticator 操作说明':'硬件安全密钥操作说明'}</summary>
      {method==='TOTP'?<ol>
        <li>先在手机安装并打开 Microsoft Authenticator 或其他兼容的动态码验证器。</li>
        <li>填写本次管理账号、密码和绑定码，点击“生成绑定二维码”。绑定码有效期为签发后 15 分钟。</li>
        <li>手机选择“添加账号 → 其他账号”，扫描网页二维码；不能扫码时展开手动绑定密钥。</li>
        <li>将手机上该账号的六位动态码填回本页，点击“确认绑定”。二维码最多五分钟内有效，临近更新时请等待下一组动态码。</li>
        <li>绑定成功后返回 Training 管理员登录，使用账号、密码及新的一组动态码。以后登录也需要手机动态码。</li>
      </ol>:<ol>
        <li>准备支持 FIDO2 的实体安全密钥，并连接到当前电脑或手机。</li>
        <li>填写管理账号、密码和一次性绑定码，点击“登记安全密钥”。</li>
        <li>按浏览器提示触碰密钥，并输入密钥 PIN 或验证指纹；完成后返回管理员登录，选择硬件安全密钥。</li>
      </ol>}
    </details>}
    <p>{method==='TOTP'
      ?'请向平台运维人员获取一次性绑定码（15 分钟内有效），然后按提示绑定手机验证器。绑定码只能使用一次。'
      :'请先向单位领取或自行准备硬件安全密钥，再向平台运维人员获取一次性绑定码。密钥需支持 FIDO2 和 PIN 或指纹验证。'}</p>
    {!registered&&!uri&&<form className="space-y-4" onInvalid={event=>{
      event.preventDefault()
      const labels:Record<string,string>={username:'管理账号',password:'当前密码',enrollmentToken:'一次性绑定码'}
      const missing=Array.from(event.currentTarget.querySelectorAll('input')).filter(input=>input.validity.valueMissing).map(input=>labels[input.name]).filter(Boolean)
      setMessage(`请填写${missing.join('、')||'所有必填项'}后再${method==='TOTP'?'生成绑定二维码':'登记安全密钥'}。`)
    }} onSubmit={event=>{
      event.preventDefault()
      // Read the submitted controls too: browser autofill may not emit React's change event.
      const values=new FormData(event.currentTarget)
      void setup({username:String(values.get('username')||''),password:String(values.get('password')||''),enrollmentToken:String(values.get('enrollmentToken')||'')})
    }}>
      <label>验证方式<select className="input" value={method} disabled={busy} onChange={e=>{setMethod(e.target.value as typeof method);setMessage('')}}>
        <option value="TOTP">Authenticator 动态码</option><option value="SECURITY_KEY">硬件安全密钥（需自备）</option>
      </select></label>
      <label>管理账号<input name="username" className="input" value={username} autoComplete="username" required disabled={busy} onChange={e=>setUsername(e.target.value)}/></label>
      <label>当前密码<input name="password" className="input" type="password" autoComplete="current-password" required value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>
      <label>一次性绑定码<input name="enrollmentToken" className="input" type="password" autoComplete="off" required value={ticket} disabled={busy} onChange={e=>setTicket(e.target.value)}/></label>
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
    <p role={message&&!registered?'alert':'status'} className={message&&!registered?'rounded-lg bg-red-50 p-3 text-red-700':undefined}>{message}</p>
    {trainingEntry&&message==='登记凭据无效'&&<p className="training-enrollment-error-help">账号或密码不匹配。请核对本次 Training 管理员的账号与对应密码，并覆盖浏览器自动填入的其他账号；重新签发绑定码不会修改密码。</p>}
    <p>无法访问已绑定的验证器？请通过受控后台恢复账号后重新绑定。</p>
    <Link to={loginPath}>前往管理员登录</Link>
  </Shell>
}

export default function AdminKeyEnrollmentEntry(){
  return <SurveyAdminAppearance><AdminKeyEnrollment/></SurveyAdminAppearance>
}
