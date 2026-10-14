import {HuiteacherMyGrowth} from './HuiteacherMyGrowth'
import React, { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import './huiteacher.css'
import { HuiteacherFormStudio } from './HuiteacherFormStudio'
import { HuiteacherClassRelationships } from './HuiteacherClassRelationships'
import { HuiteacherEvaluationStudio } from './HuiteacherEvaluationStudio'
import { HuiteacherMyFormTasks } from './HuiteacherMyFormTasks'
import {HuiteacherMyStudentFeedback} from './HuiteacherMyStudentFeedback'
import { HuiteacherMyScaleTasks } from './HuiteacherMyScaleTasks'
import { HuiteacherPersonalSelf } from './HuiteacherPersonalSelf'
import { HuiteacherFieldWorkspace } from './HuiteacherFieldWorkspace'
import { HuiteacherConsensusReviews } from './HuiteacherConsensus'
import { ReportPrivacyPreferences } from '../components/report-privacy/ReportPrivacyPreferences'
import { ProductPasswordChange } from '../components/account/ProductPasswordChange'
import { HuiteacherLanding } from './HuiteacherLanding'
import './huiteacher-landing.css'

type Envelope<T>={code:string|number;message:string;data:T}
type Scope={organizationId:string;organizationName:string;membershipId:string;orgRole:string;productAdmin:boolean}
type Me={id:string;username:string;role:string;organizations:Scope[];product:'HUITEACHER';mustChangePassword:boolean}
type Unit={id:string;unitKind:'GRADE'|'CLASS';name:string;parentUnitId:string|null}
type Mfa={mfaRequired:true;enrolled:boolean}
type Screen='home'|'join'|'login'|'mfa'|'register'|'student'|'expert'|'workspace'
type WorkspaceTab='teacher'|'school'|'expert'|'platform'

function cookie(name:string){
  const part=document.cookie.split('; ').find(x=>x.startsWith(name+'='))
  if(!part)return ''
  try{return decodeURIComponent(part.slice(name.length+1))}catch{return ''}
}
async function teacherApi<T>(path:string,method='GET',data?:unknown):Promise<T>{
  const headers:Record<string,string>={}
  if(method!=='GET'){
    let csrf=cookie('huiteacher_csrf')
    if(!csrf){
      const resp=await fetch('/api/huiteacher/auth/csrf',{credentials:'same-origin'})
      const payload=await resp.json() as Envelope<{csrfToken:string}>
      csrf=payload.data?.csrfToken??''
    }
    if(!csrf)throw new Error('安全令牌不可用')
    headers['X-CSRF-Token']=csrf
    headers['Content-Type']='application/json'
  }
  const response=await fetch('/api/huiteacher'+path,{
    method,headers,credentials:'same-origin',
    ...(data===undefined?{}:{body:JSON.stringify(data)}),
  })
  const result=await response.json() as Envelope<T>
  if(!response.ok||result.code!==0)throw new Error(result.message||'请求未能完成')
  return result.data
}
const Field=({label,value,set,type='text',required=true}:{
  label:string;value:string;set:(value:string)=>void;type?:string;required?:boolean
})=><label className="ht-field"><span>{label}</span><input
  value={value} onChange={e=>set(e.target.value)} type={type} required={required}
  autoCapitalize="none" spellCheck={false}
  autoComplete={type==='password'?(label==='设置密码'?'new-password':'current-password'):label.includes('账号')?'username':'off'}/></label>

function Brand(){return <div className="ht-brand">
  <img className="ht-brand-symbol ht-brand-b3" src="/huiteacher/huiteacher-b3-emblem.svg"
    width="56" height="64" alt=""/>
  <strong>Huiteacher</strong>
</div>}

export default function HuiteacherApp(){
  const appRoot=useRef<HTMLElement>(null)
  const [workspaceTab,setWorkspaceTab]=useState<WorkspaceTab>('teacher')
  const [screen,setScreen]=useState<Screen>(()=>['/login','/participate'].includes(window.location.pathname)?'login':'home')
  const [me,setMe]=useState<Me|null>(null)
  const [loading,setLoading]=useState(true)
  const [working,setWorking]=useState(false)
  useEffect(()=>{
    const previousTitle=document.title
    const icon=document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    const previousIcon=icon?.getAttribute('href')
    const previousType=icon?.getAttribute('type')
    document.title='Huiteacher · 教师发展与学校改进'
    if(icon){icon.href='/huiteacher/huiteacher-b3-emblem.svg';icon.type='image/svg+xml'}
    return ()=>{
      document.title=previousTitle
      if(icon){
        if(previousIcon!==null&&previousIcon!==undefined)icon.setAttribute('href',previousIcon)
        if(previousType!==null&&previousType!==undefined)icon.setAttribute('type',previousType)
      }
    }
  },[])
  useEffect(()=>{
    if(loading||screen==='home'||screen==='workspace')return
    const heading=appRoot.current?.querySelector<HTMLElement>('.ht-form-panel h1')
    if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true})}
  },[screen,loading])
  const [message,setMessage]=useState('')
  const [username,setUsername]=useState('')
  const [password,setPassword]=useState('')
  const [inviteCode,setInviteCode]=useState('')
  const [studentNumber,setStudentNumber]=useState('')
  const [classId,setClassId]=useState('')
  const [mfaCode,setMfaCode]=useState('')
  const [mfaUri,setMfaUri]=useState('')
  const [mfaEnrolled,setMfaEnrolled]=useState(true)
  const [recoveryCodes,setRecoveryCodes]=useState<string[]>([])
  const [selectedOrg,setSelectedOrg]=useState('')
  const [units,setUnits]=useState<Unit[]>([])
  const [members,setMembers]=useState<Array<{membershipId:string;loginName:string;role:string}>>([])
  const [newUnitName,setNewUnitName]=useState('')
  const [newUnitType,setNewUnitType]=useState<'GRADE'|'CLASS'>('GRADE')
  const [newUnitParent,setNewUnitParent]=useState('')
  const [issuedInvite,setIssuedInvite]=useState('')
  const [roster,setRoster]=useState('')
  const [issuedStudentInvites,setIssuedStudentInvites]=useState<Array<{studentNumber:string;inviteCode:string}>>([])

  const reload=async()=>{
    const user=await teacherApi<Me>('/auth/me')
    setMe(user)
    setSelectedOrg(previous=>user.organizations.some(x=>x.organizationId===previous)
      ?previous:user.organizations[0]?.organizationId??'')
    setScreen('workspace')
  }
  useEffect(()=>{
    let alive=true
    teacherApi<Me>('/auth/me').then(user=>{
      if(!alive)return
      setMe(user);setSelectedOrg(user.organizations[0]?.organizationId??'');setScreen('workspace')
    }).catch(()=>{}).finally(()=>{if(alive)setLoading(false)})
    return ()=>{alive=false}
  },[])
  const run=(work:()=>Promise<void>)=>{
    setMessage('');setWorking(true)
    void work().catch(e=>setMessage(e instanceof Error?e.message:'操作失败')).finally(()=>setWorking(false))
  }
  const login=()=>run(async()=>{
    const response=await teacherApi<(Mfa|{user:{id:string};product:string})>(
      '/auth/login','POST',{username,password},
    )
    setPassword('')
    if('mfaRequired' in response&&response.mfaRequired){
      setMfaEnrolled(response.enrolled);setMfaUri('');setScreen('mfa')
    }else await reload()
  })
  const mfa= (step:'setup'|'confirm'|'verify'|'recovery')=>run(async()=>{
    if(step==='setup'){
      const data=await teacherApi<{otpauthUri:string}>('/auth/mfa/setup','POST',{})
      setMfaUri(data.otpauthUri)
      return
    }
    const data=await teacherApi<{recoveryCodes?:string[]}>('/auth/mfa/'+step,'POST',{code:mfaCode})
    setMfaCode('');setMfaUri('')
    if(data.recoveryCodes?.length)setRecoveryCodes(data.recoveryCodes)
    else await reload()
  })
  const changeScreen=(next:Screen)=>{setMessage('');setScreen(next)}
  const org=me?.organizations.find(o=>o.organizationId===selectedOrg)??null
  useEffect(()=>{
    if(!me||!org||me.role==='STUDENT'){setUnits([]);setMembers([]);return}
    let active=true
    teacherApi<{list:Unit[]}>(`/organizations/${org.organizationId}/units`).then(v=>{
      if(active)setUnits(v.list)
    }).catch(()=>{if(active)setUnits([])})
    if(org.productAdmin)teacherApi<{list:typeof members}>(`/organizations/${org.organizationId}/members`).then(v=>{
      if(active)setMembers(v.list)
    }).catch(()=>{if(active)setMembers([])})
    return ()=>{active=false}
  },[me,selectedOrg,org?.organizationId,org?.productAdmin])
  const refreshOrg=()=>run(async()=>{
    await reload()
    if(!selectedOrg)return
    setUnits((await teacherApi<{list:Unit[]}>(`/organizations/${selectedOrg}/units`)).list)
  })
  const createUnit=()=>run(async()=>{
    if(!org?.productAdmin)return
    const params=newUnitType==='GRADE'
      ?{unitKind:'GRADE',name:newUnitName}
      :{unitKind:'CLASS',name:newUnitName,parentUnitId:newUnitParent}
    await teacherApi(`/organizations/${org.organizationId}/units`,'POST',params)
    setNewUnitName('');setUnits((await teacherApi<{list:Unit[]}>(`/organizations/${org.organizationId}/units`)).list)
    setMessage('年级或班级已建立')
  })
  const invite=()=>run(async()=>{
    if(!org)return
    const code=await teacherApi<{inviteCode:string}>(`/organizations/${org.organizationId}/staff-invitations`,'POST',{})
    setIssuedInvite(code.inviteCode);setMessage('邀请已生成：请安全交付，页面只展示本次结果')
  })
  const stepUp=()=>run(async()=>{
    await teacherApi('/auth/mfa/step-up','POST',{code:mfaCode})
    setMfaCode('');setMessage('管理员动态验证码已确认，5 分钟内可以继续敏感操作')
  })
  const studentRegistration=()=>run(async()=>{
    await teacherApi('/education/register-student','POST',{
      username,password,studentNumber,inviteCode,
    })
    setPassword('');setInviteCode('');setScreen('login');setMessage('教育账号已创建，请登录。')
  })
  const expertRegistration=()=>run(async()=>{
    await teacherApi('/education/register-expert','POST',{
      username,password,inviteCode,
    })
    setPassword('');setInviteCode('')
    setScreen('login')
    setMessage('教育账号已创建，请登录领取观察任务。')
  })
  const staffRegistration=()=>run(async()=>{
    await teacherApi('/education/register-staff','POST',{
      username,password,inviteCode,
    })
    setPassword('');setMessage('账号已建立，可以使用同一教育账号登录')
    setScreen('login')
  })
  const joinStaff=()=>run(async()=>{
    await teacherApi('/education/join-staff','POST',{inviteCode})
    setInviteCode('');await reload();setMessage('已使用现有教育账号加入学校')
  })
  const joinStudent=()=>run(async()=>{
    await teacherApi('/education/join-student','POST',{inviteCode,studentNumber})
    setInviteCode('');await reload()
    setMessage('已使用原学生账号加入 Teacher 学校，心理健康权限不变')
  })
  const issueStudentCodes=()=>run(async()=>{
    if(!org||!classId)throw new Error('请先选择班级')
    const studentNumbers=roster.split(/[\s,，]+/).map(x=>x.trim()).filter(Boolean)
    if(!studentNumbers.length)throw new Error('请填写已核验学号')
    const result=await teacherApi<{list:Array<{studentNumber:string;inviteCode:string}>}>(
      `/organizations/${org.organizationId}/classes/${classId}/student-invitations`,
      'POST',{studentNumbers},
    )
    setIssuedStudentInvites(result.list)
    setMessage('Teacher 学生邀请已生成，须按学号逐一安全交付；不会自动开通 School 心理健康业务')
  })
  const changeAccountPassword=(oldPassword:string,newPassword:string)=>run(async()=>{
    await teacherApi('/auth/change-password','POST',{oldPassword,newPassword})
    setMe(null);setSelectedOrg('');setScreen('login')
    setMessage('教育账号密码已修改，School 和 Teacher 需要分别重新登录')
  })
  const logout=()=>run(async()=>{
    await teacherApi('/auth/logout','POST',{})
    setMe(null);setSelectedOrg('');setScreen('home');setMessage('')
  })
  const publicHome=!me&&screen==='home'
  const publicAuth=!me&&screen!=='home'
  return <main ref={appRoot} className={`ht-app${!me?' ht-app-public':''}${publicHome?' ht-app-landing':''}`}>
    <header className="ht-topbar">
      {me?<Brand/>:<button type="button" className="ht-brand-home" aria-label="Huiteacher 首页"
        onClick={()=>changeScreen('home')}><Brand/></button>}
      <nav aria-label="产品导航">
        {!me&&<>
          {!publicHome&&<button className="ht-home-entry" type="button" onClick={()=>changeScreen('home')}>首页</button>}
          <button type="button" aria-current={screen==='login'?'page':undefined} onClick={()=>changeScreen('login')}>登录</button>
          <button type="button" className="ht-register-entry" aria-current={['join','register','student','expert'].includes(screen)?'page':undefined}
            onClick={()=>changeScreen('join')}>注册</button>
        </>}
        {me&&<><span className="ht-welcome">{me.username}</span><button onClick={()=>void logout()} disabled={working}>退出</button></>}
      </nav>
    </header>
    {message&&<p role="status" className="ht-notice">{message}</p>}
    <div className={publicAuth?'ht-auth-surface':'ht-page-content'}>
    {loading?<section className="ht-panel ht-session-loading" aria-live="polite"><p>正在检查教育账号登录状态…</p></section>:
    publicHome?<HuiteacherLanding onEnter={()=>changeScreen('login')}/>:
    !me&&screen==='join'?<section className="ht-panel ht-form-panel">
      <h1>受邀创建教育账号</h1>
      <p>选择与你收到的邀请相符的身份，<br/>我们会引导你完成注册。</p>
      <div className="ht-invite-choices" role="group" aria-label="邀请身份">
        <button type="button" onClick={()=>changeScreen('register')}>教师／学校成员<span aria-hidden="true">→</span></button>
        <button type="button" onClick={()=>changeScreen('student')}>学生<span aria-hidden="true">→</span></button>
        <button type="button" onClick={()=>changeScreen('expert')}>外部专家<span aria-hidden="true">→</span></button>
      </div>
      <p className="ht-muted">邀请码由学校或项目提供。</p>
      <div className="ht-auth-switch">已有教育账号？<button type="button" onClick={()=>changeScreen('login')}>直接登录</button></div>
    </section>:
    !me&&screen==='login'?<section className="ht-panel ht-form-panel"><h1>登录 Huiteacher</h1>
      <p>使用已有教育账号，进入你的发展空间。</p>
      <form onSubmit={e=>{e.preventDefault();login()}}>
        <Field label="教育账号" value={username} set={setUsername}/>
        <Field label="密码" value={password} set={setPassword} type="password"/>
        <button className="ht-primary" disabled={working}>{working?'正在登录…':'登录'}</button></form>
      <div className="ht-auth-switch">还没有教育账号？<button type="button" onClick={()=>changeScreen('join')}>使用邀请注册</button></div>
      <div className="ht-account-guide">
        <p>教师、学校管理者、学生与专家，均使用教育账号登录。</p>

      </div>
      <p className="ht-muted">Huischool 与 Huiteacher 使用同一教育账号，需分别登录。</p>
    </section>:
    !me&&screen==='mfa'?<section className="ht-panel ht-form-panel"><h1>双因素验证</h1>
      <p>为保护学校管理权限，请使用身份验证器完成登录。</p>
      {!mfaEnrolled&&<button disabled={working} onClick={()=>mfa('setup')}>设置身份验证器</button>}
      {mfaUri&&<div className="ht-mfa-setup">
        <p>使用身份验证器扫描二维码，再输入 6 位动态验证码。</p>
        <QRCodeSVG value={mfaUri} size={164} marginSize={2} title="身份验证器设置二维码"/>
        <details><summary>无法扫描？手动添加</summary><code className="ht-wrap ht-mfa-uri">{mfaUri}</code></details>
      </div>}
      <Field label="验证码或恢复码" value={mfaCode} set={setMfaCode}/>
      <button className="ht-primary" disabled={working} onClick={()=>mfa(mfaEnrolled?'verify':'confirm')}>完成验证</button>
      {mfaEnrolled&&<button disabled={working} onClick={()=>mfa('recovery')}>使用恢复码</button>}
      {recoveryCodes.length>0&&<div className="ht-secret"><strong>请离线保存恢复码；仅此时展示</strong>
        <pre>{recoveryCodes.join('\n')}</pre><button onClick={()=>{setRecoveryCodes([]);void reload()}}>我已保存</button></div>}
    </section>:
    !me&&(screen==='register'||screen==='student'||screen==='expert')?<section className="ht-panel ht-form-panel">
      <button type="button" className="ht-auth-back" onClick={()=>changeScreen('join')}>← 选择其他邀请身份</button>
      <h1>{screen==='register'?'教师邀请注册':screen==='expert'?'外部专家受控注册':'学生评教身份注册'}</h1>
      <p>{screen==='expert'
        ?'使用学校或项目提供的专家邀请码，创建教育账号。'
        :screen==='register'
          ?'使用学校提供的教师邀请码，创建教育账号。'
          :'使用学校提供的学生邀请码和核验学号，创建教育账号。'}</p>
      <form onSubmit={e=>{e.preventDefault();
        if(screen==='student')studentRegistration()
        else if(screen==='expert')expertRegistration()
        else staffRegistration()
      }}>
        {screen==='student'&&<Field label="学校核验的学号" value={studentNumber} set={setStudentNumber}/>}
        <Field label={screen==='student'?'Teacher 学生邀请代码':screen==='expert'?'限定活动的专家邀请码':'教师邀请代码'}
          value={inviteCode} set={setInviteCode}/>
        <Field label="教育账号登录名" value={username} set={setUsername}/>
        <Field label="设置密码" value={password} set={setPassword} type="password"/>
        <button className="ht-primary" disabled={working}>注册统一教育账号</button></form>
      <p className="ht-muted">已有教育账号？<button type="button" onClick={()=>changeScreen('login')}>直接登录</button></p>
    </section>:
    me&&screen==='workspace'&&me.mustChangePassword?<section className="ht-panel ht-form-panel">
      <h1>首次登录 · 修改教育账号密码</h1>
      <ProductPasswordChange product="teacher" forced busy={working} onChangePassword={changeAccountPassword}/>
    </section>:
    me&&screen==='workspace'?<div className="ht-workspace">
      <section className="ht-panel"><h1>我的教育发展空间</h1>
        <p>欢迎，{me.username}。Teacher 学校业务必须经学校开通及本人授权；Huischool 数据不在此显示。</p>
        <details className="ht-panel"><summary>账号安全 · 修改密码</summary>
          <ProductPasswordChange product="teacher" busy={working} onChangePassword={changeAccountPassword}/>
        </details>
        <div className="ht-inline"><Field label="已收到的学校邀请代码" value={inviteCode} set={setInviteCode}/>
          {me.role==='STUDENT'?<><Field label="学校核验学号" value={studentNumber} set={setStudentNumber}/>
            <button onClick={joinStudent} disabled={working||!inviteCode||!studentNumber}>使用原学生账号加入</button></>
           :<button onClick={joinStaff} disabled={working||!inviteCode}>使用已有教师账号加入</button>}</div>
        {me.organizations.length===0?<p className="ht-empty">{me.role==='STUDENT'
          ?'当前没有开通 Huiteacher 的学生评教任务；请使用本校正式邀请补齐学生资格。'
          :'当前没有开通 Huiteacher 的学校任务授权。若拥有个人 Scale 许可，可前往教师成长工作台。'}</p>:
          <label className="ht-field"><span>当前学校</span><select value={selectedOrg} onChange={e=>setSelectedOrg(e.target.value)}>
            {me.organizations.map(o=><option key={o.organizationId} value={o.organizationId}>{o.organizationName}</option>)}
          </select></label>}
      </section>
      {me.role==='STUDENT'?<HuiteacherMyFormTasks student api={teacherApi}/>:
      <>
      <nav className="ht-workspace-tabs" aria-label="Huiteacher 工作台">
        <button type="button" aria-pressed={workspaceTab==='teacher'}
          onClick={()=>setWorkspaceTab('teacher')}>教师成长</button>
        {me.organizations.some(o=>o.productAdmin)&&<button type="button"
          aria-pressed={workspaceTab==='school'}
          onClick={()=>setWorkspaceTab('school')}>学校改进</button>}
        <button type="button" aria-pressed={workspaceTab==='expert'}
          onClick={()=>setWorkspaceTab('expert')}>专家实践</button>
        <button type="button" aria-pressed={workspaceTab==='platform'}
          onClick={()=>setWorkspaceTab('platform')}>平台治理入口</button>
      </nav>
      {workspaceTab==='teacher'&&<>
        <HuiteacherPersonalSelf api={teacherApi}/>
        <HuiteacherMyFormTasks api={teacherApi}/>
        <HuiteacherMyScaleTasks api={teacherApi}/>
        {import.meta.env.VITE_HUITEACHER_STUDENT_FEEDBACK_ENABLED==='true'
          &&<HuiteacherMyStudentFeedback api={teacherApi}/>}
        {import.meta.env.VITE_HUITEACHER_IMPROVEMENT_ENABLED==='true'
          &&<HuiteacherMyGrowth api={teacherApi}/>}
      </>}
      {workspaceTab==='school'&&org?.productAdmin&&<>
      {import.meta.env.VITE_REPORT_PRIVACY_PREFERENCES_V1_ENABLED==='true'&&<details className="ht-panel">
        <summary>评价与报告隐私偏好（只需设置一次）</summary>
        <ReportPrivacyPreferences key={org.organizationId} organizationId={org.organizationId}
          scenarios={['TEACHER_STUDENT_EVALUATION','TEACHER_ADULT_FORM_GROUP']} api={teacherApi}/>
      </details>}
      {org&&<section className="ht-panel">
        <h2>{org.organizationName}</h2><p>{org.productAdmin?'已获得本校 Huiteacher 管理权限':'已获得本校 Huiteacher 参与权限'}</p>
        {me.role!=='STUDENT'&&<><h3>年级与班级</h3><div className="ht-units">{units.map(u=><span key={u.id} className="ht-tag">{u.unitKind==='GRADE'?'年级':'班级'} · {u.name}</span>)}</div></>}
        {me.role!=='STUDENT'&&org.productAdmin&&<div className="ht-admin">
          <div className="ht-inline"><Field label="近期 MFA 验证码" value={mfaCode} set={setMfaCode}/>
            <button disabled={working||!mfaCode} onClick={stepUp}>重新验证敏感操作</button></div>
          <h3>学校成员邀请</h3>
          <button disabled={working} onClick={invite}>签发教师邀请</button>
          {issuedInvite&&<p className="ht-secret">一次性邀请码：<code className="ht-wrap">{issuedInvite}</code></p>}
          <h3>创建年级或班级</h3>
          <div className="ht-inline"><label className="ht-field"><span>类型</span><select value={newUnitType} onChange={e=>setNewUnitType(e.target.value as 'GRADE'|'CLASS')}>
            <option value="GRADE">年级</option><option value="CLASS">班级</option></select></label>
            <Field label="名称" value={newUnitName} set={setNewUnitName}/>
            {newUnitType==='CLASS'&&<label className="ht-field"><span>所属年级</span><select value={newUnitParent} onChange={e=>setNewUnitParent(e.target.value)}>
              <option value="">请选择</option>{units.filter(u=>u.unitKind==='GRADE').map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
            </select></label>}
            <button disabled={working||!newUnitName||newUnitType==='CLASS'&&!newUnitParent} onClick={createUnit}>创建</button></div>
          <h3>学生身份与班级关系</h3>
          <p>Teacher 学生加入是共享教育身份的基础成员授权；不会产生 Huischool 心理健康的班级审批。</p>
          <label className="ht-field"><span>班级</span><select value={classId} onChange={e=>setClassId(e.target.value)}>
            <option value="">请选择班级</option>{units.filter(u=>u.unitKind==='CLASS').map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </select></label>
          <label className="ht-field"><span>已核验学生学号（以空格／换行分隔）</span><textarea value={roster} onChange={e=>setRoster(e.target.value)}/></label>
          <button disabled={working||!roster||!classId} onClick={issueStudentCodes}>按学号签发 Teacher 学生邀请</button>
          {issuedStudentInvites.length>0&&<div className="ht-secret">
            <strong>本次邀请码仅显示一次，请按对应学号安全交付</strong>
            <div className="ht-members">{issuedStudentInvites.map(item=><p key={item.inviteCode}>
              学号 {item.studentNumber}：<code className="ht-wrap">{item.inviteCode}</code>
            </p>)}</div></div>}
          <h3>当前学校成员</h3><div className="ht-members">{members.map(m=><span key={m.membershipId} className="ht-tag">{m.loginName} · {m.role}</span>)}</div>
          <button onClick={refreshOrg} disabled={working}>刷新学校信息</button>
        </div>}
      </section>}
        <HuiteacherClassRelationships key={'relations:'+org.organizationId}
          organizationId={org.organizationId} members={members} units={units} api={teacherApi}/>
        <HuiteacherEvaluationStudio key={'targets:'+org.organizationId}
          organizationId={org.organizationId} api={teacherApi}/>
        <HuiteacherFormStudio key={'forms:'+org.organizationId}
          organizationId={org.organizationId} api={teacherApi}/>
      </>}
      {workspaceTab==='expert'&&<>
        <HuiteacherFieldWorkspace api={teacherApi}/>
        <HuiteacherConsensusReviews api={teacherApi}/>
      </>}
      {workspaceTab==='platform'&&<section className="ht-panel">
        <h2>平台级教育产品治理</h2>
        <p>学校 Teacher 产品管理与平台治理相互独立。
          当前 Teacher 教育会话不能开通产品或授权其他学校，
          平台管理员请从主域管理员入口独立登录，School／Teacher 产品会话不可代用。</p>
        <a href="https://eduk12.top/admin/education-products" rel="noopener noreferrer">
          前往平台教育产品治理</a>
        <p className="ht-muted">当前不复制已有平台授权、审计或量表许可逻辑到 Teacher 工作台。</p>
      </section>}
      </>}
    </div>:null}
    </div>
    <footer className="ht-footer">{publicHome?`© ${new Date().getFullYear()} Huiteacher`:'Huiteacher · 教师发展与学校改进'}</footer>
  </main>
}
