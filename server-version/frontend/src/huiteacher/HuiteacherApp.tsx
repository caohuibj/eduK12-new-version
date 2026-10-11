import React, { useEffect, useState } from 'react'
import './huiteacher.css'

type Envelope<T>={code:string|number;message:string;data:T}
type Scope={organizationId:string;organizationName:string;membershipId:string;orgRole:string;productAdmin:boolean}
type Me={id:string;username:string;role:string;organizations:Scope[];product:'HUITEACHER'}
type Unit={id:string;unitKind:'GRADE'|'CLASS';name:string;parentUnitId:string|null}
type Mfa={mfaRequired:true;enrolled:boolean}
type Screen='home'|'login'|'mfa'|'register'|'student'|'workspace'

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
  autoComplete={type==='password'?'off':'off'}/></label>

function Brand(){return <div className="ht-brand">
  <div className="ht-brand-symbol" aria-hidden="true">火</div>
  <div><strong>Huiteacher</strong><span>教师发展与学校改进平台</span></div>
</div>}

export default function HuiteacherApp(){
  const [screen,setScreen]=useState<Screen>(()=>window.location.pathname==='/participate'?'login':'home')
  const [me,setMe]=useState<Me|null>(null)
  const [loading,setLoading]=useState(true)
  const [working,setWorking]=useState(false)
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
    if(!me||!org){setUnits([]);setMembers([]);return}
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
    setPassword('');setMessage('注册成功，已加入 Teacher 学校；心理健康业务仍需另行授权')
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
    const studentNumbers=roster.split(/[\\s,，]+/).map(x=>x.trim()).filter(Boolean)
    if(!studentNumbers.length)throw new Error('请填写已核验学号')
    const result=await teacherApi<{list:Array<{studentNumber:string;inviteCode:string}>}>(
      `/organizations/${org.organizationId}/classes/${classId}/student-invitations`,
      'POST',{studentNumbers},
    )
    setIssuedStudentInvites(result.list)
    setMessage('Teacher 学生邀请已生成，须按学号逐一安全交付；不会自动开通 School 心理健康业务')
  })
  const logout=()=>run(async()=>{
    await teacherApi('/auth/logout','POST',{})
    setMe(null);setSelectedOrg('');setScreen('home');setMessage('')
  })
  return <main className="ht-app">
    <header className="ht-topbar"><Brand/><nav aria-label="产品导航">
      {!me&&<><button onClick={()=>changeScreen('home')}>首页</button><button onClick={()=>changeScreen('login')}>登录</button>
        <button onClick={()=>changeScreen('register')}>教师注册</button><button onClick={()=>changeScreen('student')}>学生评教入口</button></>}
      {me&&<><span className="ht-welcome">{me.username}</span><button onClick={()=>void logout()} disabled={working}>退出</button></>}
    </nav></header>
    {message&&<p role="status" className="ht-notice">{message}</p>}
    {loading?<section className="ht-panel"><p>正在检查教育账号登录状态…</p></section>:
    !me&&screen==='home'?<section className="ht-hero">
      <span className="ht-eyebrow">火 · 薪火成器</span>
      <h1>让专业成长，看得见；<br/>让学校改进，有依据。</h1>
      <p>统一教育身份，不重复注册。教师发展与校园心理健康在各自独立的业务空间中运行。</p>
      <div className="ht-actions"><button className="ht-primary" onClick={()=>changeScreen('login')}>进入工作台</button>
        <button onClick={()=>changeScreen('register')}>凭学校邀请注册</button></div>
      <div className="ht-four"><article>职业幸福与支持</article><article>专业成长与实践</article>
        <article>同行协作与共创</article><article>更有活力的学校</article></div>
    </section>:
    !me&&screen==='login'?<section className="ht-panel ht-form-panel"><h1>登录 Huiteacher</h1>
      <p>使用已有 Huischool 教育账号或受邀创建的教育账号。两个产品需要分别登录。</p>
      <form onSubmit={e=>{e.preventDefault();login()}}>
        <Field label="教育账号" value={username} set={setUsername}/>
        <Field label="密码" value={password} set={setPassword} type="password"/>
        <button className="ht-primary" disabled={working}>登录</button></form>
    </section>:
    !me&&screen==='mfa'?<section className="ht-panel ht-form-panel"><h1>双因素验证</h1>
      <p>敏感权限要求身份验证器。School 和 Teacher 共用教育身份，但签发独立会话。</p>
      {!mfaEnrolled&&<button disabled={working} onClick={()=>mfa('setup')}>设置身份验证器</button>}
      {mfaUri&&<p>请使用验证器手动添加此 URI（勿分享）：<code className="ht-wrap">{mfaUri}</code></p>}
      <Field label="验证码或恢复码" value={mfaCode} set={setMfaCode}/>
      <button className="ht-primary" disabled={working} onClick={()=>mfa(mfaEnrolled?'verify':'confirm')}>完成验证</button>
      {mfaEnrolled&&<button disabled={working} onClick={()=>mfa('recovery')}>使用恢复码</button>}
      {recoveryCodes.length>0&&<div className="ht-secret"><strong>请离线保存恢复码；仅此时展示</strong>
        <pre>{recoveryCodes.join('\n')}</pre><button onClick={()=>{setRecoveryCodes([]);void reload()}}>我已保存</button></div>}
    </section>:
    !me&&(screen==='register'||screen==='student')?<section className="ht-panel ht-form-panel">
      <h1>{screen==='register'?'教师邀请注册':'学生评教身份注册'}</h1>
      <p>{screen==='register'?'已有教育账号请直接登录后使用邀请加入学校，不要重复注册。':'仅供首次创建教育学生账号。已有教育账号的学生请登录后输入邀请代码和学号加入，不需要重复注册。'}</p>
      {screen==='student'&&<Field label="学校核验的学号" value={studentNumber} set={setStudentNumber}/>}
      <form onSubmit={e=>{e.preventDefault();screen==='student'?studentRegistration():staffRegistration()}}>
        <Field label={screen==='student'?'Teacher 学生邀请代码':'教师邀请代码'} value={inviteCode} set={setInviteCode}/>
        <Field label="教育账号登录名" value={username} set={setUsername}/>
        <Field label="设置密码" value={password} set={setPassword} type="password"/>
        <button className="ht-primary" disabled={working}>注册统一教育账号</button></form>
    </section>:
    me&&screen==='workspace'?<div className="ht-workspace">
      <section className="ht-panel"><h1>我的教育发展空间</h1>
        <p>欢迎，{me.username}。Teacher 学校业务必须经学校开通及本人授权；Huischool 数据不在此显示。</p>
        <div className="ht-inline"><Field label="已收到的学校邀请代码" value={inviteCode} set={setInviteCode}/>
          {me.role==='STUDENT'?<><Field label="学校核验学号" value={studentNumber} set={setStudentNumber}/>
            <button onClick={joinStudent} disabled={working||!inviteCode||!studentNumber}>使用原学生账号加入</button></>
           :<button onClick={joinStaff} disabled={working||!inviteCode}>使用已有教师账号加入</button>}</div>
        {me.organizations.length===0?<p className="ht-empty">目前没有已开通 Huiteacher 的学校授权。教师个人发展能力将在后续阶段接入。</p>:
          <label className="ht-field"><span>当前学校</span><select value={selectedOrg} onChange={e=>setSelectedOrg(e.target.value)}>
            {me.organizations.map(o=><option key={o.organizationId} value={o.organizationId}>{o.organizationName}</option>)}
          </select></label>}
      </section>
      {org&&<section className="ht-panel">
        <h2>{org.organizationName}</h2><p>{org.productAdmin?'已获得本校 Huiteacher 管理权限':'已获得本校 Huiteacher 参与权限'}</p>
        <h3>年级与班级</h3><div className="ht-units">{units.map(u=><span key={u.id} className="ht-tag">{u.unitKind==='GRADE'?'年级':'班级'} · {u.name}</span>)}</div>
        {org.productAdmin&&<div className="ht-admin">
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
      <section className="ht-panel"><h2>后续功能模块</h2>
        <p>教师自主测评、组织调查、课堂与教研观察、学生评教及纵向改进将按 PR2—PR6 的顺序接入。</p>
        <a href="https://school.eduk12.top" rel="noopener noreferrer">前往 Huischool（使用同一账号，需分别登录）</a>
      </section>
    </div>:null}
    <footer className="ht-footer">Huiteacher · 教师发展与学校改进</footer>
  </main>
}
