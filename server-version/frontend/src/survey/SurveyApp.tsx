import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { SurveyBuilder } from './SurveyBuilder'

type Envelope<T>={code:number|string;message:string;data:T}
type Researcher={id:string;username:string}
type Project={id:string;title:string;description:string;collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES';status:'DRAFT'|'ACTIVE'|'PAUSED'|'CLOSED'|'ARCHIVED';revision:number}
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
  const initial=window.location.pathname==='/claim'?'claim':window.location.pathname==='/reset-password'?'reset':'login'
  const [screen,setScreen]=useState<'claim'|'reset'|'login'|'mfa'|'work'>(initial)
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[enrolled,setEnrolled]=useState(true)
  const [user,setUser]=useState<Researcher|null>(null)
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState('')
  const [invite,setInvite]=useState(readInvite),[uri,setUri]=useState(''),[recovery,setRecovery]=useState<string[]>([])
  const [error,setError]=useState(''),[notice,setNotice]=useState('')
  const [projects,setProjects]=useState<Project[]>([]),[selected,setSelected]=useState<Project|null>(null)
  const [title,setTitle]=useState(''),[description,setDescription]=useState('')
  const [mode,setMode]=useState<Project['collectionMode']>('SINGLE_UNLINKED')
  const work=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('')
    try{await fn()}catch(e){setError(e instanceof Error?e.message:'请求失败')}finally{setBusy(false)}}
  const loadProjects=useCallback(async()=>{const r=await api<{list:Project[]}>('/projects');setProjects(r.list)},[])
  const refresh=useCallback(async()=>{
    try{
      const me=await api<Researcher>('/auth/me')
      setUser(me);await loadProjects();setScreen('work')
    }catch{setUser(null);if(initial==='login')setScreen('login')}
    finally{setLoading(false)}
  },[initial,loadProjects])
  useEffect(()=>{document.title='Huisurvey · 观风知微';void refresh()},[refresh])
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
    else await refresh()
  })
  const logout=()=>void work(async()=>{
    await api('/auth/logout','POST',{})
    setUser(null);setProjects([]);setSelected(null);setScreen('login')
  })
  const createProject=(e:FormEvent)=>{e.preventDefault();void work(async()=>{
    const p=await api<Project>('/projects','POST',{requestId:crypto.randomUUID(),title,description,collectionMode:mode})
    await loadProjects();choose(p);setNotice('研究草稿已创建')
  })}
  const choose=(p:Project)=>{setSelected(p);setTitle(p.title);setDescription(p.description);setMode(p.collectionMode)}
  const save=(e:FormEvent)=>{e.preventDefault();if(!selected)return;void work(async()=>{
    const p=await api<Project>('/projects/'+selected.id,'PATCH',
      {revision:selected.revision,title,description,collectionMode:mode})
    choose(p);await loadProjects();setNotice('研究草稿已保存')
  })}
  const toggle=(p:Project)=>void work(async()=>{
    const action=p.status==='DRAFT'?'archive':'restore'
    const result=await api<Project>('/projects/'+p.id+'/'+action,'POST',{revision:p.revision})
    await loadProjects();if(selected?.id===p.id)choose(result)
  })
  const field=(label:string,value:string,change:(value:string)=>void,type='text')=>
    <label className="block my-3 text-sm">{label}<input className="input block mt-1 w-full" required
      type={type} autoComplete={type==='password'?'off':'on'} value={value} onChange={e=>change(e.target.value)}/></label>
  return <div className="min-h-screen bg-slate-50 text-slate-800">
    <header className="border-b border-slate-200 bg-white"><div className="max-w-5xl mx-auto p-5 flex justify-between items-center">
      <div><h1 className="text-2xl font-semibold">Huisurvey</h1>
        <p className="text-sm text-slate-500">观风知微 · 心理与教育研究平台</p></div>
      {user&&<button className="btn-secondary" disabled={busy} onClick={logout}>退出</button>}
    </div></header>
    <main className="max-w-4xl mx-auto px-4 py-8">
      {loading&&<p role="status">正在核对研究者会话…</p>}
      {error&&<p role="alert" className="p-4 border-l-4 border-red-600 bg-red-50">{error}</p>}
      {notice&&<p role="status" className="p-4 border-l-4 border-teal-600 bg-teal-50">{notice}</p>}
      {!loading&&(screen==='claim'||screen==='reset')&&<section className="bg-white rounded-xl border p-6 my-4">
        <h2 className="text-xl font-semibold">{screen==='claim'?'激活研究者身份':'恢复 Survey 密码'}</h2>
        <form onSubmit={activate}>{field('一次性邀请凭证',invite,setInvite,'password')}
          {screen==='claim'&&field('研究者登录名',username,setUsername)}
          {field('新密码（至少 8 位，字母与数字组合）',password,setPassword,'password')}
          <button className="btn-primary" disabled={busy}>确认并绑定验证器</button></form>
      </section>}
      {!loading&&screen==='login'&&<section className="bg-white rounded-xl border p-6 my-4 max-w-xl mx-auto">
        <h2 className="text-xl font-semibold">Researcher 登录</h2>
        <p>研究者仅由系统管理员邀请开通，账户与培训和校园系统相互独立。</p>
        <form onSubmit={login}>{field('研究者登录名',username,setUsername)}
          {field('密码',password,setPassword,'password')}
          <button className="btn-primary" disabled={busy}>进入双因素验证</button></form>
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
        <button className="btn-primary" onClick={()=>{setRecovery([]);void refresh()}}>我已保存，进入工作台</button>
      </section>}
      {!loading&&user&&screen==='work'&&<><section className="bg-white rounded-xl border p-6 my-4">
        <h2 className="text-xl font-semibold">我的研究</h2><p className="text-sm text-slate-500">Researcher：{user.username}</p>
        <div className="grid sm:grid-cols-2 gap-3 mt-4">{projects.map(p=><article className="rounded-lg border p-4" key={p.id}>
          <h3 className="font-semibold">{p.title}</h3><p className="text-sm">{({DRAFT:'草稿',ACTIVE:'采集中',PAUSED:'暂停',CLOSED:'已结束',ARCHIVED:'已归档'} as Record<string,string>)[p.status]||p.status} · {p.collectionMode==='LINKED_WAVES'?'多波次关联':'单次匿名'}</p>
          <div className="flex flex-wrap gap-2 mt-3"><button className="btn-secondary" onClick={()=>choose(p)}>查看/编辑</button>
            <button className="btn-secondary" disabled={busy} disabled={busy||!['DRAFT','ARCHIVED'].includes(p.status)} onClick={()=>toggle(p)}>
              {p.status==='DRAFT'?'归档':p.status==='ARCHIVED'?'恢复':'采集中不可归档'}</button></div>
        </article>)}</div>{projects.length===0&&<p>尚无研究项目。可以先创建研究草稿。</p>}
      </section><section className="bg-white rounded-xl border p-6 my-4">
        <h2 className="text-xl font-semibold">{selected?'编辑研究草稿':'创建研究项目'}</h2>
        <form onSubmit={selected?save:createProject}>{field('研究名称',title,setTitle)}
          <label className="block my-3 text-sm">研究说明<textarea className="input block mt-1 w-full" rows={3} value={description} onChange={e=>setDescription(e.target.value)}/></label>
          <label className="block my-3 text-sm">采集方式<select className="input block mt-1 w-full" value={mode} onChange={e=>setMode(e.target.value as Project['collectionMode'])}>
            <option value="SINGLE_UNLINKED">单次独立匿名</option><option value="LINKED_WAVES">同一研究编号的多波次采集</option>
          </select></label><p className="text-sm text-slate-600">多波次研究必须在正式采集前告知被试：不同时间点的回答能够按研究编号关联。</p>
          <div className="flex flex-wrap gap-3 mt-4"><button className="btn-primary" disabled={busy||(selected!==null&&selected.status!=='DRAFT')}>{selected?'保存修改':'创建研究'}</button>
            {selected&&<button type="button" className="btn-secondary" onClick={()=>{setSelected(null);setTitle('');setDescription('')}}>新建其他项目</button>}</div>
        </form><p className="text-sm text-slate-500 mt-4">研究工具编辑器已加入开发分支；正式发布、匿名采集和统计仍属于后续开发阶段。</p>
      </section>{selected&&<SurveyBuilder key={selected.id} projectId={selected.id}/>}</>}
    </main></div>
}
