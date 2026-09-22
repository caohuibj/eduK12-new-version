import React, { useEffect, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import api from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import MaterialGrantModal from '../../components/MaterialGrantModal'
import { ProductPage, PageHeader } from '../../components/product-ui'
async function request(path: string, body?: unknown): Promise<any> {
  const response = body === undefined ? await api.get<any>(path) : await api.post<any>(path, body)
  if (response.code !== 0) throw new Error(response.message || '操作失败')
  return response.data
}
export function BundleProducts() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [catalog, setCatalog] = useState<any[]>([]), [rows, setRows] = useState<any[]>([])
  const [resources, setResources] = useState<any>({ scales: [], cognitive: [], courses: [] })
  const [selection, setSelection] = useState(''), [name, setName] = useState(''), [courseId, setCourse] = useState('')
  const [publicEnabled, setPublic] = useState(false), [expiresAt, setExpiry] = useState('')
  const [bindings, setBindings] = useState<Record<string,string>>({}), [grant, setGrant] = useState<any>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const requestIdentity = useRef({payload:'',id:''})
  const chosen = catalog.find(v => v.bundleKey + '@' + v.bundleVersion === selection)
  useEffect(() => { Promise.all([request('/bundle-products/catalog'), request('/bundle-products'), request('/questionnaire-products/resources')])
    .then(([a,b,c]) => { setCatalog(a); setRows(b); setResources(c) }).catch(e=>setError(e.message)) }, [])
  async function create() {
    if (!chosen) return
    setBusy(true); setError('')
    try {
      const payload = { name: name || chosen.name,
        bundleKey: chosen.bundleKey, bundleVersion: chosen.bundleVersion, courseId: courseId || null, publicEnabled,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        bindings: chosen.slots.filter((slot:any)=>slot.unitType!=='FORM').map((slot:any)=>({slotKey:slot.slotKey,
          ...(bindings[slot.slotKey]?{resourceId:bindings[slot.slotKey]}:{})})) }
      const fingerprint=JSON.stringify(payload)
      if(requestIdentity.current.payload!==fingerprint)requestIdentity.current={payload:fingerprint,id:crypto.randomUUID()}
      const result=await request('/bundle-products',{...payload,requestId:requestIdentity.current.id})
      navigate('/bundle-products/' + result.id)
    } catch(e:any) { setError(e.message) } finally { setBusy(false) }
  }
  return <ProductPage width="management">
    <PageHeader title="Bundle 综合测评" description="选择固定测评包，获得单项结果和包级综合报告。" />
    {error && <p role="alert">{error}</p>}
    <section className="space-y-3 my-4"><h2>选择测评包</h2>
      {catalog.map(row=><article className="border rounded p-3" key={row.bundleKey+row.bundleVersion}>
        <h3>{row.name} · {row.bundleVersion}</h3><p>{row.description}</p>
        <p>{row.canInstantiate?'可以创建':'暂不可创建：尚未发布、未授权或新建入口未开放'}</p>
        <button className="btn-secondary mt-2" disabled={!row.canInstantiate} onClick={()=>{setSelection(row.bundleKey+'@'+row.bundleVersion);setBindings({});setName(row.name)}}>选择此包</button>
        {user?.role==='ADMIN' && row.status==='PUBLISHED' && <button onClick={()=>setGrant(row)}>教师授权</button>}
      </article>)}
    </section>
    {chosen && <section className="space-y-3 border p-4">
      <h2>创建 {chosen.name}</h2>
      <label className="block space-y-1">名称<input className="input w-full" value={name} onChange={e=>setName(e.target.value)} /></label>
      <label className="block space-y-1">投放课程<select aria-label="投放课程" className="input w-full" value={courseId} onChange={e=>setCourse(e.target.value)}><option value="">仅公开投放</option>
        {resources.courses.map((v:any)=><option key={v.id} value={v.id}>{v.title}</option>)}</select></label>
      <label className="block space-y-1"><input type="checkbox" checked={publicEnabled} onChange={e=>setPublic(e.target.checked)} />允许匿名参与</label>
      {publicEnabled && <label className="block space-y-1">截止时间<input type="datetime-local" value={expiresAt} onChange={e=>setExpiry(e.target.value)} /></label>}
      {chosen.slots.filter((v:any)=>['SCALE','COGNITIVE'].includes(v.unitType)).map((slot:any)=><label className="block" key={slot.slotKey}>
        {slot.slotKey} · {slot.instrumentKey} {slot.instrumentVersion}
        <select aria-label={slot.slotKey} className="input w-full" value={bindings[slot.slotKey] || ''} onChange={e=>setBindings({...bindings,[slot.slotKey]:e.target.value})}>
          <option value="">选择精确匹配的测评</option>
          {(slot.unitType==='SCALE'?resources.scales:resources.cognitive).filter((v:any)=>slot.unitType==='SCALE'
            ? v.code===slot.instrumentKey && v.version===slot.instrumentVersion
            : v.testType===slot.instrumentKey && v.configVersion===slot.instrumentVersion)
            .map((v:any)=><option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </label>)}
      <p>测评顺序、背景信息和分析规则由包固定，不能单独修改。</p>
      <button className="btn-primary" disabled={busy} onClick={()=>void create()}>创建 Bundle 草稿</button>
    </section>}
    <section className="space-y-3 my-4"><h2>已创建的包</h2>{rows.map(row=><p key={row.id}>
      <Link to={'/bundle-products/'+row.id}>{row.name}</Link> · {row.status}</p>)}</section>
    {grant && <MaterialGrantModal resourceType="ASSESSMENT_BUNDLE" resourceId={grant.bundleKey+'@'+grant.bundleVersion} resourceName={grant.name} onClose={()=>setGrant(null)} />}
  </ProductPage>
}
export function BundleProductDetail() {
  const { id } = useParams(), [row, setRow] = useState<any>(null), [error, setError] = useState('')
  const [publicUrl,setPublicUrl] = useState('')
  useEffect(()=>{void request('/bundle-products/'+id).then(setRow).catch(e=>setError(e.message))},[id])
  const publish = async()=> {try {setRow(await request('/bundle-products/'+id+'/publish',{revision:row.revision}))}catch(e:any){setError(e.message)}}
  const token = async()=> {try {
    const value=await request('/composite-assessments/'+id+'/public-tokens',{expiresAt:new Date(Date.now()+86400000).toISOString(),maxUses:100})
    setPublicUrl(window.location.origin+'/public/composite/'+value.token)
  }catch(e:any){setError(e.message)}}
  return <ProductPage width="management"><PageHeader title={row?.name || 'Bundle'} description="固定内容的综合测评包" />
    {error && <p role="alert">{error}</p>}
    {row && <><p>{row.bundle.name} · {row.bundle.bundleVersion} · {row.status}</p>
      <ul>{row.bundle.slots.map((v:any)=><li key={v.slotKey}>{v.slotKey} · {v.unitType} · {v.instrumentKey} {v.instrumentVersion}</li>)}</ul>
      {row.status!=='ARCHIVED' && <button className="btn-secondary" onClick={()=>void request('/bundle-products/'+id+'/archive',{revision:row.revision}).then(setRow).catch(e=>setError(e.message))}>归档，停止新作答</button>}
      {row.status==='DRAFT' && <button className="btn-primary" onClick={()=>void publish()}>发布 Bundle</button>}
      {row.status==='PUBLISHED' && row.publicEnabled && <button onClick={()=>void token()}>生成公开链接</button>}
      {publicUrl && <a href={publicUrl}>{publicUrl}</a>}
      <h2 className="mt-6">作答记录</h2>{row.attempts.map((v:any)=><p key={v.id}>{v.status} {v.completedAt}
        {v.status==='COMPLETED' && <Link to={'/composite-assessments/'+id+'/attempts/'+v.id+'/report'}>查看报告</Link>}</p>)}
    </>}
  </ProductPage>
}
