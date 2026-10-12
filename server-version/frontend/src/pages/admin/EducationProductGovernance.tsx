import {useState} from 'react'
import {Link} from 'react-router-dom'
import {useAuth} from '../../contexts/AuthContext'
import {sessionFetch} from '../../api/client'
import './education-products.css'

type Product='HUISCHOOL'|'HUITEACHER'
type Entitlement={product:Product;status:string;revision:number}
type Grant={grantId:string;membershipId:string;loginName:string;grantedAt:string}
type Envelope<T>={code:string|number;message:string;data:T}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
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

/** Existing platform ADMIN login/session, never Huiteacher or Huischool
 * cookies. Each write requires a fresh server-side password verification.
 */
export default function EducationProductGovernance(){
  const {user}=useAuth()
  const [school,setSchool]=useState('')
  const [loaded,setLoaded]=useState('')
  const [products,setProducts]=useState<Entitlement[]>([])
  const [grants,setGrants]=useState<Grant[]>([])
  const [member,setMember]=useState('')
  const [schoolAdmin,setSchoolAdmin]=useState('')
  const [password,setPassword]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [busy,setBusy]=useState(false)
  const allowed=user?.role==='ADMIN'&&user.platformRole==='SYSTEM_ADMIN'
  const read=async (org:string)=>{
    const [data,admins]=await Promise.all([
      request<Entitlement[]>('/organizations/'+org+'/products'),
      request<{list:Grant[];truncated:boolean}>('/organizations/'+org+'/teacher-admins'),
    ])
    setProducts(data);setGrants(admins.list);setLoaded(org)
  }
  const load=()=>{
    const org=school.trim()
    if(!uuid.test(org)){setError('必须输入正式学校的 Organization UUID');return}
    setBusy(true);setError('');setNotice('')
    void read(org).catch(e=>{
      setLoaded('');setProducts([]);setGrants([])
      setError(e instanceof Error?e.message:'学校授权读取失败')
    }).finally(()=>setBusy(false))
  }
  const change=(message:string,send:(secret:string)=>Promise<unknown>)=>{
    if(!loaded||!password){setError('请先加载学校并输入本次管理员密码');return}
    if(!window.confirm(message))return
    const secret=password
    setPassword('');setBusy(true);setNotice('');setError('')
    void send(secret).then(()=>read(loaded))
      .then(()=>setNotice('已重新读取正式授权状态。'))
      .catch(e=>setError(e instanceof Error?e.message:'本次操作未获授权'))
      .finally(()=>setBusy(false))
  }
  if(!allowed)return <section className="epg-main">
    <h1>校园教育产品治理</h1>
    <p role="alert">此入口仅接受独立平台 SYSTEM_ADMIN 身份，不接受 School 或 Teacher 登录会话。</p>
    <Link to="/admin/login">前往平台管理员登录</Link>
  </section>
  return <section className="epg-main" aria-label="校园教育产品治理">
    <header><span>Huisurvey · 平台治理</span>
      <h1>教育产品与学校授权</h1>
      <p>共享教育账号及组织基础信息，但两个产品分别开通、分别授权。
        管理员不能从本页面读取任何教师私人报告、学生心理数据或评教个人作答。</p>
    </header>
    <nav aria-label="平台治理导航" className="epg-actions">
      <Link to="/organizations">学校组织</Link>
      <Link to="/admin/instrument-authorizations">科学工具许可</Link>
      <Link to="/admin/reporting-content">内容及报告治理</Link>
    </nav>
    {error&&<p role="alert" className="epg-error">{error}</p>}
    {notice&&<p role="status" className="epg-notice">{notice}</p>}
    <div className="epg-panel">
      <h2>选择正式学校</h2>
      <label>学校 Organization UUID
        <input value={school} autoComplete="off" onChange={e=>setSchool(e.target.value)}/>
      </label>
      <button type="button" onClick={load} disabled={busy||!uuid.test(school.trim())}>
        查询学校产品授权</button>
    </div>
    {loaded&&<>
      <div className="epg-panel">
        <h2>独立产品开通</h2>
        <p>组织 ID：<code>{loaded}</code></p>
        <div className="epg-grid">
          {(['HUISCHOOL','HUITEACHER'] as const).map(product=>{
            const item=products.find(x=>x.product===product)
            return <article key={product}>
              <h3>{labels[product]}</h3>
              <p>{item?.status??'尚未开通'} · 版本 {item?.revision??0}</p>
              <div className="epg-actions">
                <button type="button" disabled={busy||item?.status==='ACTIVE'} onClick={()=>change(
                  '确认开通'+labels[product]+'？当前学校与账号不会因此获得另一产品的权限。',
                  secret=>request('/organizations/'+loaded+'/products/'+product,'PUT',{
                    action:'ACTIVATE',currentPassword:secret,
                    expectedRevision:item?.revision??0,
                    ...(product==='HUISCHOOL'&&uuid.test(schoolAdmin)
                      ?{initialSchoolAdminMembershipId:schoolAdmin}:{}),
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
        <label>首次开通 Huischool 时的专门管理员 Membership UUID（仅需要时填写）
          <input value={schoolAdmin} autoComplete="off"
            onChange={e=>setSchoolAdmin(e.target.value)}/>
        </label>
      </div>
      <div className="epg-panel">
        <h2>Teacher 学校产品管理员</h2>
        {grants.length?grants.map(g=><article className="epg-grant" key={g.grantId}>
          <strong>{g.loginName}</strong>
          <span>成员 {g.membershipId}</span>
          <button type="button" disabled={busy} onClick={()=>change(
            '确认撤销本项 Huiteacher 产品管理授权？',
            secret=>request('/organizations/'+loaded+'/teacher-admins/'+g.grantId+'/revoke',
              'POST',{currentPassword:secret}))}>撤销</button>
        </article>):<p>本校暂无已授予的 Teacher 产品管理员。</p>}
        <label>拟授权教师的正式 Membership UUID
          <input value={member} autoComplete="off" onChange={e=>setMember(e.target.value)}/>
        </label>
        <button type="button" disabled={busy||!uuid.test(member.trim())} onClick={()=>change(
          '确认只授予这名成员在本校的 Huiteacher 管理权限？',
          secret=>request('/organizations/'+loaded+'/teacher-admins','POST',{
            membershipId:member.trim(),currentPassword:secret,
          }))}>授予 Teacher 产品管理员</button>
      </div>
      <div className="epg-panel">
        <h2>管理员操作确认</h2>
        <label>本次平台管理员密码
          <input type="password" autoComplete="off" value={password}
            onChange={e=>setPassword(e.target.value)}/>
        </label>
        <p>密码仅随当前受控操作提交，完成后清空；不写入 URL、日志或本地存储。
          所有操作继续由后端校验 SYSTEM_ADMIN、当前密码及本校产品状态。</p>
      </div>
    </>}
  </section>
}
