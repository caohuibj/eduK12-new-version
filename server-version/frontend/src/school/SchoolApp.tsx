import React, { useEffect, useState } from 'react'
import './school.css'

type CampusUser={id:string;username:string;role:string;accountDomain:'SCHOOL'}
type CampusOrg={id:string;name:string;orgRole:string}
type SchoolAccess={orgRole:string|null;canGovern:boolean;personas:string[];capabilities:string[];explicitDenies:string[]}
type Unit={id:string;unitKind:'GRADE'|'CLASS';name:string;parentUnitId:string|null}
type Summary={status:string;rosterVersion:number;eligibleCount:number;registeredCount:number;unresolvedIncidents:number}
type Envelope<T>={code:number|string;message:string;data:T}
type MfaState={mfaRequired:true;enrolled:boolean}
const cookie=(name:string)=>{
  const key=encodeURIComponent(name)+'='
  const item=document.cookie.split('; ').find(value=>value.startsWith(key))
  return item?decodeURIComponent(item.slice(key.length)):null
}
async function api<T>(path:string,method='GET',payload?:unknown):Promise<T>{
  const headers:Record<string,string>={'Content-Type':'application/json'}
  if(method!=='GET'){
    let csrf=cookie('huischool_csrf')
    if(!csrf){
      const response=await fetch('/api/campus/auth/csrf',{credentials:'same-origin'})
      if(!response.ok)throw new Error('无法建立安全请求，请刷新页面')
      const body=await response.json() as Envelope<{csrfToken:string}>
      csrf=body.data?.csrfToken??null
    }
    if(!csrf)throw new Error('安全令牌不可用')
    headers['X-CSRF-Token']=csrf
  }
  const response=await fetch('/api/campus'+path,{
    method,headers,credentials:'same-origin',
    ...(payload===undefined?{}:{body:JSON.stringify(payload)}),
  })
  const result=await response.json() as Envelope<T>
  if(!response.ok||result.code!==0)throw new Error(result.message||'请求失败，请稍后重试')
  return result.data
}
const field=(label:string,value:string,onChange:(v:string)=>void,type='text')=>(
  <label className="hs-field"><span>{label}</span>
    <input value={value} onChange={event=>onChange(event.target.value)} type={type}
      autoComplete={type==='password'?'off':'off'} required />
  </label>
)
const SchoolMark=()=>(
  <div className="hs-brand" aria-label="Huischool 校园心理健康">
    <div className="hs-brand-seed" aria-hidden="true">林</div>
    <div><strong>Huischool</strong><small>林间见心 · 校园心理健康</small></div>
  </div>
)

export default function SchoolApp(){
  const [user,setUser]=useState<CampusUser|null>(null)
  const [loading,setLoading]=useState(true)
  const [screen,setScreen]=useState<'home'|'login'|'register'|'staff'|'mfa'|'workspace'>(()=>
    window.location.pathname==='/register'?'register':
      window.location.pathname==='/staff/register'?'staff':'home')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [username,setUsername]=useState('')
  const [password,setPassword]=useState('')
  const [studentNo,setStudentNo]=useState('')
  const [activationCode,setActivationCode]=useState('')
  const [inviteCode,setInviteCode]=useState('')
  const [schoolId,setSchoolId]=useState(new URLSearchParams(window.location.search).get('organizationId')??'')
  const [classId,setClassId]=useState(new URLSearchParams(window.location.search).get('classUnitId')??'')
  const [mfaEnrolled,setMfaEnrolled]=useState(true)
  const [mfaCode,setMfaCode]=useState('')
  const [stepUpCode,setStepUpCode]=useState('')
  const [mfaUri,setMfaUri]=useState('')
  const [recoveryCodes,setRecoveryCodes]=useState<string[]>([])
  const [orgs,setOrgs]=useState<CampusOrg[]>([])
  const [access,setAccess]=useState<SchoolAccess|null>(null)
  const [units,setUnits]=useState<Unit[]>([])
  const [gradeName,setGradeName]=useState('')
  const [className,setClassName]=useState('')
  const [parentGrade,setParentGrade]=useState('')
  const [roster,setRoster]=useState('')
  const [summary,setSummary]=useState<Summary|null>(null)
  const [windowEnd,setWindowEnd]=useState('')
  const [issuedCodes,setIssuedCodes]=useState<string[]>([])
  const [staffPersona,setStaffPersona]=useState<'TEACHER'|'COUNSELOR'>('TEACHER')
  const [staffPsych,setStaffPsych]=useState(false)
  const [staffAdmin,setStaffAdmin]=useState(false)
  const [newInvite,setNewInvite]=useState('')
  const [studentStatus,setStudentStatus]=useState('')
  const [working,setWorking]=useState(false)

  const refresh=async()=>{
    try{
      const me=await api<CampusUser>('/auth/me')
      setUser(me);setScreen('workspace')
    }catch{setUser(null)}
    finally{setLoading(false)}
  }
  useEffect(()=>{void refresh()},[])
  useEffect(()=>{
    if(!user)return
    void api<{list:CampusOrg[]}>('/organizations').then(data=>{
      const list=data.list??[]
      setOrgs(list)
      if(list.length)setSchoolId(prev=>prev||list[0].id)
    }).catch(()=>setOrgs([]))
    if(user.role==='STUDENT'){
      void api<{status:string}>('/my-status').then(result=>setStudentStatus(result.status))
        .catch(()=>setStudentStatus('暂时无法读取当前状态'))
    }
  },[user])
  useEffect(()=>{
    if(!user||!schoolId)return
    setClassId('');setUnits([]);setSummary(null);setIssuedCodes([]);setAccess(null)
    void api<{access:SchoolAccess}>(`/organizations/${schoolId}/context`)
      .then(data=>setAccess(data.access)).catch(()=>setAccess(null))
    void api<{list:Unit[]}>(`/organizations/${schoolId}/units`)
      .then(result=>setUnits(result.list??[])).catch(()=>setUnits([]))
  },[schoolId,user])
  const schoolAdmin=access?.orgRole==='ORG_ADMIN' && access.canGovern===true
  const psychologyStaff=!!access?.personas.includes('COUNSELOR')
    && !!access?.capabilities.includes('PSYCHOLOGY_STAFF')
    && !access?.explicitDenies.some(x=>['*','PSYCHOLOGY_STAFF','CLASS_APPROVE','ORGANIZATION_GOVERNANCE'].includes(x))
  const notify=(message:string)=>{setNotice(message);setError('')}
  const run=async(work:()=>Promise<void>)=>{
    setError('');setNotice('');setWorking(true)
    try{await work()}catch(e){setError(e instanceof Error?e.message:'操作失败')}
    finally{setWorking(false)}
  }
  const signIn=async(e:React.FormEvent)=>{
    e.preventDefault()
    await run(async()=>{
      const result=await api<{user?:CampusUser}&Partial<MfaState>>('/auth/login','POST',{username,password})
      setPassword('')
      if(result.mfaRequired){
        setMfaEnrolled(result.enrolled??true);setScreen('mfa');setMfaUri('');setMfaCode('')
        notify('账号密码已验证，请完成动态验证码验证')
      }else{await refresh()}
    })
  }
  const registerStudent=async(e:React.FormEvent)=>{
    e.preventDefault()
    await run(async()=>{
      await api('/register','POST',{organizationId:schoolId,classUnitId:classId,
        studentNumber:studentNo,activationCode,username,password})
      setPassword('');setStudentNo('');setActivationCode('')
      setScreen('login')
      notify('注册成功。班级统一审批前不会开放校园任务。')
    })
  }
  const registerStaff=async(e:React.FormEvent)=>{
    e.preventDefault()
    await run(async()=>{
      await api('/staff/register','POST',{inviteCode,username,password})
      setInviteCode('');setPassword('');setScreen('login')
      notify('账号已创建。请登录，并按照提示绑定验证器。')
    })
  }
  const beginMfa=()=>run(async()=>{
    const result=await api<{otpauthUri:string}>('/auth/mfa/setup','POST',{})
    setMfaUri(result.otpauthUri)
  })
  const completeMfa=(kind:'confirm'|'verify'|'recovery')=>run(async()=>{
    const result=await api<{authenticated:boolean;recoveryCodes?:string[]}>(`/auth/mfa/${kind}`,'POST',{code:mfaCode})
    if(result.recoveryCodes?.length){setRecoveryCodes(result.recoveryCodes);notify('请立即妥善保存恢复码。恢复码只显示一次。')}
    else{setRecoveryCodes([]);await refresh()}
    setMfaUri('');setMfaCode('')
  })
  const logOut=()=>run(async()=>{
    // Do not claim logout or clear the UI on a failed server-side revocation.
    await api('/auth/logout','POST',{})
    setUser(null);setSummary(null);setIssuedCodes([]);setRecoveryCodes([])
    setScreen('home');notify('已退出校园账号')
  })
  const stepUp=()=>run(async()=>{
    await api('/auth/mfa/step-up','POST',{code:stepUpCode})
    setStepUpCode('')
    notify('高权限操作已重新验证，有效期五分钟。')
  })
  const createUnit=(kind:'GRADE'|'CLASS')=>run(async()=>{
    const body=kind==='GRADE'?{unitKind:kind,name:gradeName}:{unitKind:kind,name:className,parentUnitId:parentGrade}
    await api(`/organizations/${schoolId}/units`,'POST',body)
    const result=await api<{list:Unit[]}>(`/organizations/${schoolId}/units`)
    setUnits(result.list);setGradeName('');setClassName('')
    notify(kind==='GRADE'?'年级已建立':'班级已建立')
  })
  const loadSummary=()=>run(async()=>{
    setSummary(await api<Summary>(`/organizations/${schoolId}/classes/${classId}/summary`))
  })
  const changeClass=async(id:string)=>{
    setClassId(id);setSummary(null);setIssuedCodes([]);setNewInvite('')
  }
  const joinUrl=classId?`${window.location.origin}/register?organizationId=${encodeURIComponent(schoolId)}&classUnitId=${encodeURIComponent(classId)}`:''
  const classPath=`/organizations/${schoolId}/classes/${classId}`
  const saveRoster=()=>run(async()=>{
    const studentNumbers=roster.split(/[\r\n,，]+/).map(v=>v.trim()).filter(Boolean)
    await api(classPath+'/roster','POST',{studentNumbers})
    setRoster('');setSummary(await api<Summary>(classPath+'/summary'))
    notify('资格名册已更新。服务端仅保存受保护的资格索引。')
  })
  const issueCodes=()=>run(async()=>{
    const codes=await api<{codes:string[]}>(classPath+'/codes','POST',{count:Math.max(1,Number(summary?.eligibleCount??1)),ttlMinutes:120})
    setIssuedCodes(codes.codes);notify('注册码仅在本次页面显示，请分别安全交付。')
  })
  const actionWindow=(action:'OPEN'|'CLOSE')=>run(async()=>{
    await api(classPath+'/window','POST',{action,...(action==='OPEN'?{closesAt:new Date(windowEnd).toISOString()}:{})})
    setSummary(await api<Summary>(classPath+'/summary'));notify(action==='OPEN'?'注册窗口已开启':'注册窗口已关闭')
  })
  const approve=()=>run(async()=>{
    if(!summary)throw new Error('请先刷新班级状态')
    await api(classPath+'/approve','POST',{expectedRosterVersion:summary.rosterVersion})
    setSummary(await api<Summary>(classPath+'/summary'))
    notify('班级整体审批完成。未正式开放的校园 Activity 仍不可访问。')
  })
  const invite=()=>run(async()=>{
    const result=await api<{inviteCode:string}>(`/organizations/${schoolId}/staff-invitations`,'POST',{
      persona:staffPersona,adminRole:staffAdmin,psychologyStaff:staffPsych,
    })
    setNewInvite(result.inviteCode);notify('人员邀请码仅显示一次，请通过独立安全渠道交付。')
  })

  return <div className="hs-app">
    <header className="hs-header">
      <SchoolMark/>
      <nav aria-label="校园导航">
        {user?<><span className="hs-account">{user.username}</span><button onClick={()=>void logOut()}>退出</button></>:
          <><button onClick={()=>setScreen('login')}>登录</button><button className="hs-primary" onClick={()=>setScreen('register')}>学生注册</button></>}
      </nav>
    </header>
    <main className="hs-main">
      {error&&<p className="hs-alert" role="alert">{error}</p>}
      {notice&&<p className="hs-message" role="status">{notice}</p>}
      {loading?<p>正在核对校园会话…</p>:null}
      {!loading&&screen==='home'&&!user&&<section className="hs-hero">
        <p className="hs-eyebrow">林间见心 · CAMPUS MENTAL HEALTH</p>
        <h1>让每一个生命都被看见与支持</h1>
        <p>校园心理健康、学习适应、师生关系与家校支持。学生可以使用班级分发的限时激活码，创建不要求真实姓名、电话或邮箱的校园账号。</p>
        <div className="hs-actions"><button className="hs-primary" onClick={()=>setScreen('register')}>我是学生 · 注册</button><button onClick={()=>setScreen('login')}>已有账号 · 登录</button><button onClick={()=>setScreen('staff')}>教职员工邀请码</button></div>
      </section>}
      {!loading&&!user&&screen==='login'&&<section className="hs-panel hs-narrow">
        <h1>校园账号登录</h1>
        <p>Huischool 与培训版账号相互独立。</p>
        <form onSubmit={e=>void signIn(e)}>{field('校园用户名',username,setUsername)}{field('密码',password,setPassword,'password')}<button className="hs-primary" disabled={working}>登录</button></form>
        <button className="hs-link" onClick={()=>setScreen('register')}>使用班级激活码注册</button>
      </section>}
      {!loading&&!user&&screen==='register'&&<section className="hs-panel hs-narrow">
        <h1>学生半匿名注册</h1><p>请从班级提供的专属注册链接进入，输入学号和随机激活码。账号需等待心理教师完成整班审批。</p>
        <form onSubmit={e=>void registerStudent(e)}>
          {field('学校识别码',schoolId,setSchoolId)}
          {field('班级识别码',classId,setClassId)}
          {field('学号（仅用于资格验证）',studentNo,setStudentNo)}
          {field('一次性激活码',activationCode,setActivationCode)}
          {field('自选登录名',username,setUsername)}
          {field('自选密码',password,setPassword,'password')}
          <button className="hs-primary" disabled={working}>提交注册</button>
        </form>
      </section>}
      {!loading&&!user&&screen==='staff'&&<section className="hs-panel hs-narrow">
        <h1>教职员工独立注册</h1><p>仅限获得学校管理员一次性邀请码的人员。培训版账号不能直接登录校园版。</p>
        <form onSubmit={e=>void registerStaff(e)}>
          {field('学校人员邀请码',inviteCode,setInviteCode)}
          {field('自选校园用户名',username,setUsername)}
          {field('密码',password,setPassword,'password')}
          <button className="hs-primary" disabled={working}>创建校园账号</button>
        </form>
      </section>}
      {!loading&&!user&&screen==='mfa'&&<section className="hs-panel hs-narrow">
        <h1>账号安全验证</h1>
        <p>学校管理员和具有专业敏感权限的人员必须完成密码 + TOTP 动态验证码登录。</p>
        {!mfaEnrolled&&<div><button onClick={()=>void beginMfa()} disabled={working}>开始绑定验证器</button>
          {mfaUri&&<div className="hs-secret"><p>在 Microsoft Authenticator 或 Google Authenticator 中手动添加密钥（勿截图或分享）：</p><code>{new URL(mfaUri).searchParams.get('secret')}</code></div>}
        </div>}
        <form onSubmit={e=>{e.preventDefault();void completeMfa(mfaEnrolled?'verify':'confirm')}}>
          {field('6 位动态验证码',mfaCode,setMfaCode)}
          <button className="hs-primary" disabled={working}>{mfaEnrolled?'完成登录':'确认绑定并登录'}</button>
        </form>
        {mfaEnrolled&&<button className="hs-link" onClick={()=>void completeMfa('recovery')}>使用一次性恢复码代替动态验证码</button>}
      </section>}
      {!loading&&recoveryCodes.length>0&&<section className="hs-panel hs-narrow">
        <h2>请离线保存一次性恢复码</h2><p>此列表不会再次显示。不要保存到浏览器本地存储或共享设备。</p>
        <div className="hs-secret">{recoveryCodes.map(code=><code key={code}>{code}</code>)}</div>
        <button className="hs-primary" onClick={()=>{setRecoveryCodes([]);void refresh()}}>已妥善保存，进入校园</button>
      </section>}
      {!loading&&user&&screen==='workspace'&&recoveryCodes.length===0&&<section>
        <p className="hs-eyebrow">HUISCHOOL · 校园工作台</p>
        <h1>欢迎，{user.username}</h1>
        {user.role!=='STUDENT'&&<section className="hs-panel">
          <h2>敏感操作二次验证</h2>
          <p>学校管理员与心理专业人员在执行名册、人员授权或整班审批前，需要最近五分钟内的动态验证码。普通教师无需使用此功能。</p>
          <div className="hs-actions">
            <label className="hs-field"><span>验证器 6 位动态验证码</span>
              <input value={stepUpCode} onChange={event=>setStepUpCode(event.target.value)}
                inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
            </label>
            <button disabled={working||!/^[0-9]{6}$/.test(stepUpCode)}
              onClick={()=>void stepUp()}>重新验证高权限操作</button>
          </div>
        </section>}
        {user.role==='STUDENT'?<section className="hs-panel"><h2>我的校园活动</h2>
          <p>{studentStatus==='PENDING_CLASS_APPROVAL'?'账号已注册，正在等待班级整体审批。':
            studentStatus==='APPROVED'?'身份已获批。学校正式开放活动后，才会显示授权任务。':
            '目前暂无可参加的校园活动。请向学校确认注册及审批状态。'}</p>
          <p>本页面不会展示历史培训课程或未经授权的心理测评报告。</p>
        </section>:<>
          <section className="hs-panel"><h2>学校与班级</h2>
            <label className="hs-field"><span>当前学校</span><select value={schoolId} onChange={e=>setSchoolId(e.target.value)}>
              <option value="">请选择学校</option>{orgs.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}
            </select></label>
            {schoolAdmin&&<div className="hs-grid"><div>{field('新建年级名称',gradeName,setGradeName)}<button disabled={working||!schoolId} onClick={()=>void createUnit('GRADE')}>增加年级</button></div>
            <div>{field('新建班级名称',className,setClassName)}<label className="hs-field"><span>所属年级</span><select value={parentGrade} onChange={e=>setParentGrade(e.target.value)}>
              <option value="">请选择年级</option>{units.filter(x=>x.unitKind==='GRADE').map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
              <button disabled={working||!parentGrade} onClick={()=>void createUnit('CLASS')}>增加班级</button></div></div>}
            <label className="hs-field"><span>当前班级</span><select value={classId} onChange={e=>void changeClass(e.target.value)}>
              <option value="">请选择班级</option>{units.filter(x=>x.unitKind==='CLASS').map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
            </select></label>
          </section>
          {schoolId&&classId&&<section className="hs-panel"><h2>班级注册与审批</h2>
            {schoolAdmin&&<p>注册链接：<code className="hs-break">{joinUrl}</code></p>}
            {summary&&<p>状态：{summary.status} · 名册 {summary.eligibleCount} · 已注册 {summary.registeredCount} · 待处理异常 {summary.unresolvedIncidents} · 版本 {summary.rosterVersion}</p>}
            <button onClick={()=>void loadSummary()} disabled={working}>刷新班级状态</button>
            {schoolAdmin&&<><label className="hs-field"><span>资格名册（每行一个学号，仅上传时用于计算受保护索引）</span>
              <textarea value={roster} onChange={e=>setRoster(e.target.value)} rows={6}/></label>
            <button disabled={working||!roster.trim()} onClick={()=>void saveRoster()}>更新资格名册</button>
            <div className="hs-actions"><button disabled={working} onClick={()=>void issueCodes()}>批量生成一次性激活码</button>
              <label className="hs-field"><span>注册截止时间</span><input type="datetime-local" value={windowEnd} onChange={e=>setWindowEnd(e.target.value)}/></label>
              <button disabled={working||!windowEnd} onClick={()=>void actionWindow('OPEN')}>开启注册</button>
              <button disabled={working} onClick={()=>void actionWindow('CLOSE')}>关闭注册</button></div></>}
            {psychologyStaff&&<button className="hs-primary"
              disabled={working||!summary||summary.status!=='CLOSED'
                ||summary.eligibleCount!==summary.registeredCount||summary.unresolvedIncidents!==0}
              onClick={()=>void approve()}>心理教师 · 确认整班身份审批</button>}
            {schoolAdmin&&issuedCodes.length>0&&<div className="hs-secret"><p>以下注册码只在本次操作显示，请分别安全交付给学生：</p>{issuedCodes.map(code=><code key={code}>{code}</code>)}</div>}
          </section>}
          {schoolAdmin&&schoolId&&<section className="hs-panel"><h2>邀请校园教职员工</h2>
            <div className="hs-actions"><label className="hs-field"><span>岗位</span><select value={staffPersona} onChange={e=>setStaffPersona(e.target.value as 'TEACHER'|'COUNSELOR')}>
              <option value="TEACHER">普通教师</option><option value="COUNSELOR">心理教师</option></select></label>
              <label><input type="checkbox" checked={staffPsych} onChange={e=>setStaffPsych(e.target.checked)}/> 心理专业权限</label>
              <label><input type="checkbox" checked={staffAdmin} onChange={e=>setStaffAdmin(e.target.checked)}/> 学校管理员</label>
              <button disabled={working} onClick={()=>void invite()}>生成邀请</button></div>
            {newInvite&&<div className="hs-secret"><p>仅显示一次的邀请码：</p><code>{newInvite}</code></div>}
          </section>}
        </>}
      </section>}
    </main>
    <footer className="hs-footer">Huischool · 林间见心 · 校园心理健康 | 教育支持而非医学诊断</footer>
  </div>
}
