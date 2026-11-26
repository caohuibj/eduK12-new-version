import {lazy,Suspense,useState} from 'react'
import {Link} from 'react-router-dom'
import {useAuth} from '../../contexts/AuthContext'
import {sessionFetch} from '../../api/client'
import {entryPaths,hasAdminEntry} from '../../admin/authority'
import AdminStepUp from '../../admin/AdminStepUp'
import './education-products.css'
const EducationCognitiveConfigurations=lazy(()=>import('./EducationCognitiveConfigurations'))
const EducationStandardConfigurations=lazy(()=>import('./EducationStandardConfigurations'))

type Product='HUISCHOOL'|'HUITEACHER'
type Entitlement={product:Product;status:string;revision:number}
type Grant={grantId:string;membershipId:string;loginName:string;grantedAt:string;effective:boolean}
type School={id:string;name:string}
type Candidate={membershipId:string;loginName:string;ready:boolean}
type SearchPage<T>={list:T[];hasMore:boolean;page:number}
type Envelope<T>={code:string|number;message:string;data:T}
const entitlementLabels:Record<string,string>={ACTIVE:'已开通',SUSPENDED:'已暂停'}
const labels:Record<Product,string>={HUISCHOOL:'校园心理健康',HUITEACHER:'教师发展与学校改进'}
const endpoint='/api/platform/education'

async function request<T>(path:string,method='GET',data?:unknown):Promise<T>{
  const response=await sessionFetch(endpoint+path,{
    method,headers:{Accept:'application/json',
      ...(data===undefined?{}:{'Content-Type':'application/json'})},
    ...(data===undefined?{}:{body:JSON.stringify(data)}),
  })
  const parsed=await response.json() as Envelope<T>
  if(!response.ok||parsed.code!==0)throw new Error(parsed.message||'产品治理请求未完成')
  return parsed.data
}

/** Entry-scoped management session; school member/product sessions remain
 * independent. Sensitive writes also require the current password and key. */
export default function EducationProductGovernance({product}:{product?:Product}){
  const {user}=useAuth()
  const selectedProduct=product??(hasAdminEntry(user,'HUISCHOOL')?'HUISCHOOL':'HUITEACHER')
  const title=selectedProduct==='HUISCHOOL'?'校园心理健康产品治理':'教师发展与学校改进治理'
  const [school,setSchool]=useState('')
  const [schools,setSchools]=useState<SearchPage<School>|null>(null)
  const [loadedSchool,setLoadedSchool]=useState<School|null>(null)
  const [selectionCurrent,setSelectionCurrent]=useState(false)
  const [products,setProducts]=useState<Entitlement[]>([])
  const [admins,setAdmins]=useState({list:[] as Grant[],truncated:false,effectiveCount:0})
  const [person,setPerson]=useState('')
  const [candidates,setCandidates]=useState<SearchPage<Candidate>|null>(null)
  const [member,setMember]=useState<Candidate|null>(null)
  const [password,setPassword]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [busy,setBusy]=useState(false)
  const allowed=hasAdminEntry(user,selectedProduct)
  const loaded=loadedSchool?.id
  const adminPath=(id:string)=>'/organizations/'+id+'/products/'+selectedProduct
  const searchParams=(keyword:string,page:number)=>'?'+new URLSearchParams({q:keyword.trim(),page:String(page)})
  const read=async (target:School)=>{
    const [data,roster]=await Promise.all([
      request<Entitlement[]>('/organizations/'+target.id+'/products'),
      request<typeof admins>(adminPath(target.id)+'/admins'),
    ])
    setProducts(data);setAdmins(roster);setLoadedSchool(target);setSelectionCurrent(true)
  }
  const run=async (operation:()=>Promise<void>)=>{
    setBusy(true);setError('');setNotice('')
    try{await operation()}catch(e){setError(e instanceof Error?e.message:'学校治理请求未完成')}
    finally{setBusy(false)}
  }
  const searchSchools=(page=1)=>run(async()=>{
    setSelectionCurrent(false);setPassword('');setSchools(null)
    setSchools(await request<SearchPage<School>>('/organizations'+searchParams(school,page)))
  })
  const selectSchool=(target:School)=>run(async()=>{
    setSelectionCurrent(false);setPassword('');setPerson('');setCandidates(null);setMember(null)
    await read(target)
  })
  const searchPeople=(page=1)=>{
    if(!loaded||!selectionCurrent)return
    return run(async()=>{
      setMember(null);setCandidates(null)
      setCandidates(await request<SearchPage<Candidate>>(adminPath(loaded)+'/admin-candidates'+searchParams(person,page)))
    })
  }
  const change=(message:string,send:(secret:string)=>Promise<unknown>)=>{
    if(!loadedSchool||!selectionCurrent||!password){setError('请先选择学校并输入本次管理员密码');return}
    if(!window.confirm(message+'\n学校：'+loadedSchool.name))return
    const secret=password
    setPassword('')
    void run(async()=>{
      await send(secret)
      await read(loadedSchool)
      setMember(null)
      setNotice('已重新读取正式授权状态。')
    })
  }
  if(!allowed)return <section className="epg-main">
    <h1>校园教育产品治理</h1>
    <p role="alert">此入口需要当前学校产品的入口管理授权。</p>
    <Link to="/admin/login">前往平台管理员登录</Link>
  </section>
  return <section className="epg-main" aria-label={title}>
    <header><span>{selectedProduct==='HUISCHOOL'?'School':'Teacher'} · 管理员工作台</span>
      <h1>{title}</h1>
      <p>共享教育账号及组织基础信息，但两个产品分别开通、分别授权。
        管理员不能从本页面读取任何教师私人报告、学生心理数据或评教个人作答。</p>
    </header>
    <details className="epg-verification"><summary>管理员安全验证 <span>敏感操作前展开验证</span></summary><AdminStepUp/></details>
    <nav aria-label="平台治理导航" className="epg-actions">
      <Link to="/admin/entrances">管理入口</Link>
      {(['HUISCHOOL','HUITEACHER'] as const).filter(entry=>entry!==selectedProduct&&hasAdminEntry(user,entry)).map(entry=><Link key={entry} to={entryPaths[entry]}>{labels[entry]}管理</Link>)}
    </nav>
    {error&&<p role="alert" className="epg-error">{error}</p>}
    {notice&&<p role="status" className="epg-notice">{notice}</p>}
    <div className="epg-panel">
      <h2>选择正式学校</h2>
      <form onSubmit={event=>{event.preventDefault();void searchSchools()}}>
        <label>学校名称
          <input value={school} maxLength={100} autoComplete="off" disabled={busy}
            onChange={event=>{setSchool(event.target.value);setSelectionCurrent(false);setSchools(null);setPassword('');setNotice('')}}/>
        </label>
        <button type="submit" disabled={busy||!school.trim()}>搜索学校</button>
      </form>
      {schools&&<div className="epg-actions" aria-label="学校搜索结果">
        {schools.list.map(target=><button key={target.id} type="button" disabled={busy}
          onClick={()=>void selectSchool(target)}>选择 {target.name}</button>)}
        {!schools.list.length&&<p>没有匹配的学校。</p>}
        {schools.page>1&&<button type="button" disabled={busy} onClick={()=>void searchSchools(schools.page-1)}>上一页学校</button>}
        {schools.hasMore&&<button type="button" disabled={busy} onClick={()=>void searchSchools(schools.page+1)}>下一页学校</button>}
      </div>}
      {loadedSchool&&<p className="epg-help">当前学校 <strong>{loadedSchool.name}</strong></p>}
      {loadedSchool&&!selectionCurrent&&<p role="status" className="epg-scope-warning">请从搜索结果选择学校。下方原学校操作已停用。</p>}
    </div>
    {loaded&&<fieldset key={loaded} className="epg-school-controls" aria-label="已加载学校治理操作" disabled={!selectionCurrent||busy}>
      <Suspense fallback={<p role="status">正在加载固定配置授权…</p>}><EducationStandardConfigurations actorId={user!.id} organizationId={loaded} product={selectedProduct}/><EducationCognitiveConfigurations actorId={user!.id} organizationId={loaded} product={selectedProduct}/></Suspense>
      <div className="epg-panel">
        <h2>独立产品开通</h2>
        <div className="epg-grid">
          {[selectedProduct].map(product=>{
            const item=products.find(x=>x.product===product)
            return <article key={product}>
              <h3>{labels[product]}</h3>
              <p>{item?(entitlementLabels[item.status]??item.status):'尚未开通'} · 版本 {item?.revision??0}</p>
              <div className="epg-actions">
                <button type="button" disabled={busy||item?.status==='ACTIVE'||(product==='HUISCHOOL'&&!item&&!member)} onClick={()=>change(
                  '确认开通'+labels[product]+'？当前学校与账号不会因此获得另一产品的权限。',
                  secret=>request('/organizations/'+loaded+'/products/'+product,'PUT',{
                    action:'ACTIVATE',currentPassword:secret,
                    expectedRevision:item?.revision??0,
                    ...(product==='HUISCHOOL'&&member
                      ?{initialSchoolAdminMembershipId:member.membershipId}:{}),
                  }))}>开通</button>
                <button type="button" disabled={busy||item?.status!=='ACTIVE'} onClick={()=>change(
                  '确认暂停'+labels[product]+'？共享身份不会删除。',
                  secret=>request('/organizations/'+loaded+'/products/'+product,'PUT',{
                    action:'SUSPEND',currentPassword:secret,
                    expectedRevision:item?.revision??0,
                  }))}>暂停</button>
              </div>
            </article>
          })}
        </div>
      </div>
      <div className="epg-panel">
        <h2>{selectedProduct==='HUISCHOOL'?'School':'Teacher'} 学校产品管理员</h2>
        <p>可操作管理员 {admins.effectiveCount} 位。请先完成接任人的验证，再撤销原有授权。</p>
        {admins.truncated&&<p>管理员列表仅显示靠前的记录。</p>}
        {admins.list.length?admins.list.map(grant=><article className="epg-grant" key={grant.grantId}>
          <strong>{grant.loginName}</strong>
          <span>{grant.effective?'可操作':'当前不可操作'}</span>
          <button type="button" disabled={grant.effective&&admins.effectiveCount<=1} onClick={()=>change(
            '确认撤销 '+grant.loginName+' 的本产品管理权？',
            secret=>request(adminPath(loaded)+'/admins/'+grant.grantId+'/revoke','POST',{currentPassword:secret}))}>撤销</button>
        </article>):<p>本校暂无此产品管理员。</p>}
        <form onSubmit={event=>{event.preventDefault();void searchPeople()}}>
          <label>本校人员账号
            <input value={person} maxLength={100} autoComplete="off"
              onChange={event=>{setPerson(event.target.value);setCandidates(null);setMember(null)}}/>
          </label>
          <button type="submit">搜索人员</button>
        </form>
        {candidates&&<div className="epg-actions" aria-label="人员搜索结果">
          {candidates.list.map(candidate=><button type="button" key={candidate.membershipId}
            aria-pressed={member?.membershipId===candidate.membershipId} onClick={()=>setMember(candidate)}>
            {candidate.loginName} · {candidate.ready?'验证已就绪':'待完成验证'}
          </button>)}
          {!candidates.list.length&&<p>没有匹配的人员。</p>}
          {candidates.page>1&&<button type="button" onClick={()=>void searchPeople(candidates.page-1)}>上一页人员</button>}
          {candidates.hasMore&&<button type="button" onClick={()=>void searchPeople(candidates.page+1)}>下一页人员</button>}
        </div>}
        {selectedProduct==='HUISCHOOL'&&!products.some(item=>item.product==='HUISCHOOL'&&item.status==='ACTIVE')&&<p>首次开通 School 前，请在这里选定首任管理员。</p>}
        <button type="button" disabled={!member||!products.some(item=>item.product===selectedProduct&&item.status==='ACTIVE')} onClick={()=>{
          if(!member)return
          change('确认授予 '+member.loginName+' 本校的本产品管理权？',
            secret=>request(adminPath(loaded)+'/admins','POST',{membershipId:member.membershipId,currentPassword:secret}))
        }}>授予 {selectedProduct==='HUISCHOOL'?'School':'Teacher'} 产品管理员</button>
      </div>
      <div className="epg-panel">
        <h2>管理员操作确认</h2>
        <label>本次平台管理员密码
          <input type="password" autoComplete="off" value={password}
            onChange={e=>setPassword(e.target.value)}/>
        </label>
        <p>密码仅随当前受控操作提交，完成后清空；不写入 URL、日志或本地存储。
          所有操作由后端校验对应入口授权、最近安全密钥验证、当前密码及本校产品状态。</p>
      </div>
    </fieldset>}
  </section>
}
