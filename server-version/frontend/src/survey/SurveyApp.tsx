import { surveyAdminLoginUrl } from '../products/origins'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ProductPasswordChange } from '../components/account/ProductPasswordChange'
import { SurveyBuilder } from './SurveyBuilder'
import { SurveyReportStudio, type ReportLeaveRisk } from './SurveyReportStudio'
import { createInstrumentLibrary } from './instrument-library'
import { SurveyWaveStudio } from './SurveyWaveStudio'
import { SurveyAnalyticsWorkspace } from './SurveyAnalyticsWorkspace'
import { SurveyWorkspaceNav,type WorkspaceSection } from './SurveyWorkspaceNav'
import './survey-workspace.css'
import { SurveyBrand } from './SurveyBrand'
import { SurveyLanding } from './SurveyLanding'
import { SurveyFeaturePage } from './SurveyFeaturePage'
import { surveyFeatures } from './survey-features'

type Envelope<T>={code:number|string;message:string;data:T}
type Researcher={id:string;username:string;mustChangePassword:boolean}
type Project={id:string;title:string;description:string;collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES';status:'DRAFT'|'ACTIVE'|'PAUSED'|'CLOSED'|'ARCHIVED';revision:number;firstPublishedAt?:string|null}
const cookie=(name:string)=>document.cookie.split('; ').find(x=>x.startsWith(name+'='))?.split('=').slice(1).join('=')||''
async function api<T>(path:string,method='GET',body?:unknown):Promise<T>{
  const headers:Record<string,string>={'Content-Type':'application/json'}
  if(method!=='GET'){
    let csrf=cookie('huisurvey_research_csrf')
    if(!csrf){
      const res=await fetch('/api/survey/auth/csrf',{credentials:'same-origin'})
      if(!res.ok)throw new Error('无法建立安全会话')
      const envelope=await res.json() as Envelope<{csrfToken:string}>
      csrf=envelope.data?.csrfToken
    }
    if(!csrf)throw new Error('CSRF 安全令牌不可用')
    headers['X-CSRF-Token']=decodeURIComponent(csrf)
  }
  const res=await fetch('/api/survey'+path,{method,headers,credentials:'same-origin',
    ...(body===undefined?{}:{body:JSON.stringify(body)})})
  const envelope=await res.json() as Envelope<T>
  if(!res.ok||envelope.code!==0)throw new Error(envelope.message||'操作失败')
  return envelope.data
}
const readInvite=()=>new URLSearchParams(window.location.hash.slice(1)).get('token')||''
export default function SurveyApp(){
  // Keep the entry stable when activation removes its one-time token from the URL.
  const [initial]=useState<'home'|'feature'|'claim'|'reset'|'login'>(()=>
    window.location.pathname==='/'?'home':window.location.pathname==='/claim'?'claim':window.location.pathname==='/reset-password'?'reset':
      surveyFeatures.some(feature=>feature.path===window.location.pathname)?'feature':'login')
  const activeFeature=surveyFeatures.find(feature=>feature.path===window.location.pathname)
  const [screen,setScreen]=useState<'home'|'feature'|'claim'|'reset'|'login'|'mfa'|'work'>(initial)
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[enrolled,setEnrolled]=useState(true)
  const [user,setUser]=useState<Researcher|null>(null)
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState('')
  const [invite,setInvite]=useState(readInvite),[uri,setUri]=useState(''),[recovery,setRecovery]=useState<string[]>([])
  const [error,setError]=useState(''),[notice,setNotice]=useState('')
  const [projects,setProjects]=useState<Project[]>([]),[selected,setSelected]=useState<Project|null>(null)
  const reportLeaveRisk=useRef<ReportLeaveRisk>({dirty:false,pending:false,busy:false})
  const reportRiskChanged=useCallback((risk:ReportLeaveRisk)=>{reportLeaveRisk.current=risk},[])
  const mayLeaveReport=()=>{
    const risk=reportLeaveRisk.current
    if(risk.pending||risk.busy){setError('报告请求尚未确认，请先回到私有报告完成或核对原请求，再离开项目。');return false}
    return !risk.dirty||window.confirm('报告有未保存的修改。确定放弃这些修改并离开项目？')
  }
  const [projectPage,setProjectPage]=useState(1)
  const [workspaceSection,setWorkspaceSection]=useState<WorkspaceSection>('settings')
  const [available,setAvailable]=useState<{analytics:boolean;publication:boolean}|null>(null)
  const selectedProjectId=selected?.id
  const instrumentLibrary=useMemo(()=>selectedProjectId?createInstrumentLibrary(selectedProjectId):undefined,[selectedProjectId])
  const projectChanged=useCallback((project:Pick<Project,'id'|'status'|'revision'|'collectionMode'>)=>{
    setSelected(current=>current?.id===project.id?{...current,...project}:current)
    setProjects(current=>current.map(row=>row.id===project.id?{...row,...project}:row))
  },[])
  const [title,setTitle]=useState(''),[description,setDescription]=useState('')
  const [mode,setMode]=useState<Project['collectionMode']>('SINGLE_UNLINKED')
  const work=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('')
    try{await fn()}catch(e){setError(e instanceof Error?e.message:'请求失败')}finally{setBusy(false)}}
  const loadProjects=useCallback(async(page=1)=>{
    const r=await api<{list:Project[]}>('/projects?page='+page)
    setProjects(r.list);setProjectPage(page)
  },[])
  const refresh=useCallback(async(openWorkspace=false)=>{
    try{
      const me=await api<Researcher>('/auth/me')
      setUser(me)
      if(!openWorkspace&&['home','feature','claim','reset'].includes(initial))setScreen(initial)
      else {
        // A forced-password session is allowed to read /auth/me and change
        // its password, but has no permission to list research projects.
        if(!me.mustChangePassword)await loadProjects()
        setScreen('work')
      }
    }catch{setUser(null);if(initial==='login')setScreen('login')}
    finally{setLoading(false)}
  },[initial,loadProjects])
  useEffect(()=>{document.title=activeFeature?activeFeature.title+' | Huisurvey':'Huisurvey · 观风知微';void refresh()},[refresh,activeFeature])
  useEffect(()=>{
    if(initial==='home'||initial==='feature')return
    void api<{analytics:boolean;publication:boolean}>('/auth/capabilities')
      .then(setAvailable).catch(()=>setAvailable(null))
  },[initial])
  const login=(e:FormEvent)=>{e.preventDefault();void work(async()=>{
    const r=await api<{enrolled:boolean}>('/auth/login','POST',{username,password})
    setEnrolled(r.enrolled);setScreen('mfa');setPassword('');setUri('');setCode('')
  })}
  const activate=(e:FormEvent)=>{e.preventDefault();void work(async()=>{
    const path=screen==='claim'?'/auth/claim':'/auth/reset-password'
    const payload=screen==='claim'?{token:invite,username,password}:{token:invite,password}
    const r=await api<{enrolled:boolean}>(path,'POST',payload)
    setEnrolled(r.enrolled);setScreen('mfa');setInvite('');setPassword('')
    window.history.replaceState(null,'','/')
    setNotice('账号已设置，请完成双因素验证')
  })}
  const setup=()=>void work(async()=>{
    const result=await api<{otpauthUri:string}>('/auth/mfa/setup','POST',{})
    setUri(result.otpauthUri)
  })
  const finish=(kind:'confirm'|'verify'|'recovery')=>void work(async()=>{
    const r=await api<{recoveryCodes?:string[]}>('/auth/mfa/'+kind,'POST',{code})
    setCode('')
    if(r.recoveryCodes?.length){setRecovery(r.recoveryCodes);setNotice('恢复码仅显示一次，请安全保存')}
    else await refresh(true)
  })
  const changeAccountPassword=(oldPassword:string,newPassword:string,code?:string)=>{if(!mayLeaveReport())return;void work(async()=>{
    await api('/auth/change-password','POST',{oldPassword,newPassword,code})
    setUser(null);setProjects([]);setSelected(null);setScreen('login')
    setNotice('密码已修改，旧研究者会话已经失效，请重新登录')
  })}
  const logout=()=>{if(!mayLeaveReport())return;void work(async()=>{
    await api('/auth/logout','POST',{})
    setUser(null);setProjects([]);setSelected(null);setScreen('login')
  })}
  const createProject=(e:FormEvent)=>{e.preventDefault();void work(async()=>{
    const p=await api<Project>('/projects','POST',{requestId:crypto.randomUUID(),title,description,collectionMode:mode})
    await loadProjects(1);choose(p);setNotice('研究草稿已创建')
  })}
  const choose=(p:Project)=>{if(selected?.id!==p.id){if(!mayLeaveReport())return;setWorkspaceSection('settings');}setSelected(p);setTitle(p.title);setDescription(p.description);setMode(p.collectionMode)}
  const save=(e:FormEvent)=>{e.preventDefault();if(!selected)return;void work(async()=>{
    const p=await api<Project>('/projects/'+selected.id,'PATCH',
      {revision:selected.revision,title,description,collectionMode:mode})
    choose(p);await loadProjects(projectPage);setNotice('研究草稿已保存')
  })}
  const toggle=(p:Project)=>void work(async()=>{
    const action=p.status==='ARCHIVED'?'restore':'archive'
    const result=await api<Project>('/projects/'+p.id+'/'+action,'POST',{revision:p.revision})
    await loadProjects(projectPage);if(selected?.id===p.id)choose(result)
  })
  const field=(label:string,value:string,change:(value:string)=>void,type='text')=>
    <label className="block my-3 text-sm">{label}<input className="input block mt-1 w-full" required
      type={type} autoComplete={type==='password'?'off':'on'} value={value} onChange={e=>change(e.target.value)}/></label>
  if(screen==='home')return <SurveyLanding signedIn={user!==null}/>
  if(screen==='feature'&&activeFeature)return <SurveyFeaturePage feature={activeFeature} signedIn={user!==null}/>
  // Entry styling deliberately stops before MFA, the workspace and all timed tasks.
  const entryScreen=screen==='login'||screen==='claim'||screen==='reset'
  return <div className={entryScreen?'survey-entry':'min-h-screen bg-slate-50 text-slate-800'}>
    {entryScreen&&<a className="survey-skip-link" href="#survey-entry-content">跳至主要内容</a>}
    <header className="border-b border-slate-200 bg-white"><div className={entryScreen?'survey-entry-header':'max-w-5xl mx-auto p-5 flex justify-between items-center'}>
      <SurveyBrand/>
      {user&&<button className="btn-secondary" disabled={busy} onClick={logout}>退出</button>}
    </div></header>
    <main id={entryScreen?'survey-entry-content':undefined} tabIndex={entryScreen?-1:undefined}
      className={entryScreen?'survey-entry-main':screen==='work'&&!user?.mustChangePassword
        ?'max-w-7xl mx-auto px-4 py-8':'max-w-4xl mx-auto px-4 py-8'}>
      {loading&&<p role="status">正在核对研究者会话…</p>}
      {error&&<p role="alert" className="p-4 border-l-4 border-red-600 bg-red-50">{error}</p>}
      {notice&&<p role="status" className="p-4 border-l-4 border-teal-600 bg-teal-50">{notice}</p>}
      {!loading&&(screen==='claim'||screen==='reset')&&<section className="survey-entry-panel">
        <a className="survey-back" href="/">返回首页</a>
        <h1>{screen==='claim'?'激活研究者身份':'恢复 Survey 密码'}</h1>
        <p className="survey-entry-intro">{screen==='claim'
          ?'使用管理员提供的一次性邀请，设置独立研究账号，然后绑定验证器。'
          :'使用管理员提供的密码恢复邀请设置新密码，再完成双因素验证。'}</p>
        <form onSubmit={activate} aria-busy={busy}>{field('一次性邀请凭证',invite,setInvite,'password')}
          {screen==='claim'&&field('研究者登录名',username,setUsername)}
          {field('新密码（至少 8 位，字母与数字组合）',password,setPassword,'password')}
          <button className="btn-primary" disabled={busy}>确认并绑定验证器</button></form>
        <p className="survey-entry-help">没有有效凭证，或凭证已失效？请联系为你开通账号的管理员。</p>
      </section>}
      {!loading&&screen==='login'&&<section className="survey-entry-panel">
        <a className="survey-back" href="/">返回首页</a>
        <h1>研究者登录</h1>
        <p className="survey-entry-intro">研究者仅由系统管理员邀请开通，账户与培训和校园系统相互独立。</p>
        <form onSubmit={login} aria-busy={busy}>{field('研究者登录名',username,setUsername)}
          {field('密码',password,setPassword,'password')}
          <button className="btn-primary" disabled={busy}>进入双因素验证</button></form>
        <p className="survey-entry-help">登录后还需输入验证器动态码。需要激活账号或恢复密码，请使用管理员提供的一次性邀请。</p>
        <div className="survey-entry-admin">{surveyAdminLoginUrl()
          ?<a href={surveyAdminLoginUrl()!}>系统管理员入口：研究者与工具授权</a>
          :<p>当前地址未配置管理员入口。</p>}</div>
      </section>}
      {!loading&&screen==='mfa'&&<section className="bg-white rounded-xl border p-6 my-4 max-w-xl mx-auto">
        <h2 className="text-xl font-semibold">{enrolled?'双因素验证':'绑定 TOTP 验证器'}</h2>
        {!enrolled&&!uri&&<button className="btn-primary" disabled={busy} onClick={setup}>生成二维码</button>}
        {uri&&<div className="my-4"><QRCodeSVG value={uri} size={180}/><p className="text-sm mt-2">验证器手动密钥：</p>
          <code className="break-all">{new URL(uri).searchParams.get('secret')}</code></div>}
        {field('动态验证码／恢复码',code,setCode)}
        <div className="flex gap-3 flex-wrap">
          {!enrolled&&<button className="btn-primary" disabled={busy||!uri||!code} onClick={()=>finish('confirm')}>确认绑定</button>}
          {enrolled&&<><button className="btn-primary" disabled={busy||!code} onClick={()=>finish('verify')}>验证并登录</button>
            <button className="btn-secondary" disabled={busy||!code} onClick={()=>finish('recovery')}>使用恢复码</button></>}
        </div>
      </section>}
      {recovery.length>0&&<section className="bg-white rounded-xl border p-6 my-4">
        <h2 className="text-xl font-semibold">一次性恢复码</h2>
        <p>请离线保存，恢复码每个只能使用一次，关闭本页后无法再次查看。</p>
        <code className="block whitespace-pre-wrap break-all bg-slate-100 p-4 my-3">{recovery.join('\n')}</code>
        <button className="btn-primary" onClick={()=>{setRecovery([]);void refresh(true)}}>我已保存，进入工作台</button>
      </section>}
      {!loading&&user&&screen==='work'&&user.mustChangePassword&&<section className="bg-white rounded-xl border p-6 my-4">
        <h2 className="font-semibold text-xl">首次登录 · 修改研究者密码</h2>
        <ProductPasswordChange product="survey" forced busy={busy} onChangePassword={changeAccountPassword}/>
      </section>}
      {!loading&&user&&screen==='work'&&!user.mustChangePassword&&<div className="survey-workspace"><section className="bg-white rounded-xl border p-6 my-4">
        <h2 className="text-xl font-semibold">我的研究</h2><p className="text-sm text-slate-500">Researcher：{user.username}</p>
        <details className="border rounded-lg p-4 my-4"><summary>账号安全 · 修改密码</summary>
          <ProductPasswordChange product="survey" busy={busy} onChangePassword={changeAccountPassword}/>
        </details>
        <div className="grid sm:grid-cols-2 gap-3 mt-4">{projects.map(p=><article className="rounded-lg border p-4" key={p.id}>
          <h3 className="font-semibold">{p.title}</h3><p className="text-sm">{({DRAFT:'草稿',ACTIVE:'采集中',PAUSED:'暂停',CLOSED:'已结束',ARCHIVED:'已归档'} as Record<string,string>)[p.status]||p.status} · {p.collectionMode==='LINKED_WAVES'?'多波次关联':'单次匿名'}</p>
          <div className="flex flex-wrap gap-2 mt-3"><button className="btn-secondary" onClick={()=>choose(p)}>查看/编辑</button>
            <button className="btn-secondary" disabled={busy||(p.status==='DRAFT'&&!!p.firstPublishedAt)
              ||(!['DRAFT','CLOSED'].includes(p.status)&&!(p.status==='ARCHIVED'&&!p.firstPublishedAt))} onClick={()=>toggle(p)}>
              {p.status==='CLOSED'?'结束后归档':p.status==='DRAFT'?'归档草稿':
                p.status==='ARCHIVED'?(p.firstPublishedAt?'终态归档不可恢复':'恢复草稿'):'采集中不可归档'}</button></div>
        </article>)}</div>
        <div className="flex items-center gap-4 mt-4 text-sm">
          <button type="button" className="btn-secondary" disabled={busy||projectPage<=1}
            onClick={()=>void work(()=>loadProjects(projectPage-1))}>上一页</button>
          <span>项目第 {projectPage} 页</span>
          <button type="button" className="btn-secondary" disabled={busy||projects.length<25}
            onClick={()=>void work(()=>loadProjects(projectPage+1))}>下一页</button>
        </div>
        {projects.length===0&&projectPage===1&&<p>尚无研究项目。可以先创建研究草稿。</p>}
      </section>{selected&&<SurveyWorkspaceNav active={workspaceSection} onChange={setWorkspaceSection} title={selected.title}/>}
      <section className="bg-white rounded-xl border p-6 my-4"
        id="survey-workspace-settings" role={selected?'tabpanel':undefined}
        aria-labelledby={selected?'survey-workspace-tab-settings':undefined}
        hidden={!!selected&&workspaceSection!=='settings'}>
        <h2 className="text-xl font-semibold">{selected?'编辑研究草稿':'创建研究项目'}</h2>
        <form onSubmit={selected?save:createProject}>{field('研究名称',title,setTitle)}
          <label className="block my-3 text-sm">研究说明<textarea className="input block mt-1 w-full" rows={3} value={description} onChange={e=>setDescription(e.target.value)}/></label>
          <label className="block my-3 text-sm">采集方式<select className="input block mt-1 w-full" value={mode} onChange={e=>setMode(e.target.value as Project['collectionMode'])}>
            <option value="SINGLE_UNLINKED">单次独立匿名</option><option value="LINKED_WAVES">同一研究编号的多波次采集</option>
          </select></label><p className="text-sm text-slate-600">多波次研究必须在正式采集前告知被试：不同时间点的回答能够按研究编号关联。</p>
          <div className="flex flex-wrap gap-3 mt-4"><button className="btn-primary" disabled={busy||(selected!==null&&selected.status!=='DRAFT')}>{selected?'保存修改':'创建研究'}</button>
            {selected&&<button type="button" className="btn-secondary" onClick={()=>{if(!mayLeaveReport())return;setSelected(null);setTitle('');setDescription('')}}>新建其他项目</button>}</div>
        </form><p className="text-sm text-slate-500 mt-4">研究工具编辑、研究专用发布、匿名参与与科研分析可按功能开关使用；正式生产开通须完成独立部署验收。</p>
      </section>{selected&&<><div id="survey-workspace-tools" role="tabpanel" aria-labelledby="survey-workspace-tab-tools" hidden={workspaceSection!=='tools'}><SurveyBuilder key={'builder-'+selected.id} projectId={selected.id} instrumentLibrary={instrumentLibrary}/></div>
        <div id="survey-workspace-reports" role="tabpanel" aria-labelledby="survey-workspace-tab-reports" hidden={workspaceSection!=='reports'}><SurveyReportStudio key={'reports-'+selected.id} projectId={selected.id} projectStatus={selected.status} active={workspaceSection==='reports'} onLeaveRiskChange={reportRiskChanged}/></div>
        <div id="survey-workspace-publish" role="tabpanel" aria-labelledby="survey-workspace-tab-publish" hidden={workspaceSection!=='publish'}><SurveyWaveStudio key={'waves-'+selected.id} projectId={selected.id} instrumentLibrary={instrumentLibrary} onProjectChanged={projectChanged}/></div>
        <div id="survey-workspace-data" role="tabpanel" aria-labelledby="survey-workspace-tab-data" hidden={workspaceSection!=='data'}>
          {available?.analytics
            ?<SurveyAnalyticsWorkspace actorId={user?.id} key={'analysis-'+selected.id} projectId={selected.id}/>
            :<section className="rounded-xl border bg-white p-4" aria-label="研究数据状态">
              研究数据分析暂未在当前环境启用；项目和研究工具仍可使用。
            </section>}</div></>}</div>}
    </main></div>
}
