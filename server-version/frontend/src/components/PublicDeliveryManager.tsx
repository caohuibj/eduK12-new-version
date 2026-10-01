import { AnonymousStudyManager } from './AnonymousStudyManager'
import { useEffect, useMemo, useRef, useState } from 'react'
import { publicDeliveryAdapter, publicLinkStatus, type PublicDeliveryFamily, type PublicDeliveryLink } from '../api/publicDelivery'

export function PublicDeliveryManager({ family, resourceId, canCreate = true, maximumExpiry }: {
  family: PublicDeliveryFamily; resourceId: string; canCreate?: boolean; maximumExpiry?: string | null
}) {
  const adapter = useMemo(()=>publicDeliveryAdapter(family,resourceId),[family,resourceId])
  const [links,setLinks]=useState<PublicDeliveryLink[]>([])
  const [expiresAt,setExpiry]=useState(''),[maxUses,setMaxUses]=useState('0')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const generation=useRef(0)
  useEffect(()=>{
    const current=++generation.current
    setLinks([]);setError('');setNotice('');setExpiry('');setMaxUses('0');setBusy(true)
    adapter.listLinks().then(rows=>{if(current===generation.current)setLinks(rows)})
      .catch(()=>{if(current===generation.current)setError('无法读取匿名链接，请确认当前访问权限后重试')})
      .finally(()=>{if(current===generation.current)setBusy(false)})
    return ()=>{generation.current=current+1}
  },[adapter])
  const act=async(work:()=>Promise<void>)=>{
    setBusy(true);setError('');setNotice('')
    const current=generation.current
    try{await work()}catch(e){if(current===generation.current){setLinks([]);setError(e instanceof Error?e.message:'匿名链接操作失败')}}
    finally{if(current===generation.current)setBusy(false)}
  }
  const create=()=>act(async()=>{
    const expiry=new Date(expiresAt)
    if(!expiresAt || !Number.isFinite(expiry.getTime())) throw new Error('请选择有效期')
    if(maximumExpiry && expiry.getTime()>Date.parse(maximumExpiry)) throw new Error('链接有效期不能晚于测评截止时间，请先在测评设置中调整截止时间')
    if(!maxUses.trim()) throw new Error('请填写最大参与次数，0 表示不限')
    const current=generation.current
    const link=await adapter.createLink({expiresAt:expiry.toISOString(),maxUses:Number(maxUses)})
    if(current===generation.current){setLinks(old=>[link,...old.filter(l=>l.id!==link.id)]);setNotice('匿名链接已生成')}
  })
  const disable=(link:PublicDeliveryLink)=>act(async()=>{
    const current=generation.current
    await adapter.disableLink(link.id)
    if(current===generation.current){setLinks(old=>old.map(l=>l.id===link.id?{...l,isActive:false}:l));setNotice('链接已停用，不再接受新参与者')}
  })
  const copy=(link:PublicDeliveryLink)=>act(async()=>{
    const revealed=link.token?link:await adapter.revealLink(link.id)
    const url=adapter.getPublicEntry(revealed)
    if(!url) throw new Error('此链接凭证无法恢复，请生成新链接')
    const current=generation.current
    await navigator.clipboard.writeText(url)
    if(current===generation.current)setNotice('链接已复制')
  })
  return <section className="card p-6 space-y-4" aria-label="匿名作答链接管理">
    <h2 className="font-semibold">公开匿名链接</h2>
    <p className="text-sm text-gray-600">参与者无需登录，按内容权限查看当次个人反馈。发布者可统计参与和完成情况、导出授权数据。{family==='COMPOSITE' && '保存研究内身份后，可在同一研究内参与多波次并查看本人历史报告。'}</p>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <button disabled={busy} className="btn-secondary" onClick={()=>void act(async()=>{const current=generation.current;const rows=await adapter.listLinks();if(current===generation.current)setLinks(rows)})}>刷新链接</button>
    {family==='COMPOSITE' && <AnonymousStudyManager compositeId={resourceId} links={links}/>}
    {!links.length && !busy && !error && <p>尚未生成链接</p>}
    {links.map(link=>{const url=adapter.getPublicEntry(link);return <article key={link.id} className="rounded border p-3 text-sm space-y-2">
      {url ? <a className="block break-all text-action" href={url}>{url}</a> : <p>链接地址已隐藏，复制时会重新验证权限。</p>}
      <p>创建于：{link.createdAt?new Date(link.createdAt).toLocaleString():'刚刚'} · 有效期至：{new Date(link.expiresAt).toLocaleString()}</p>
      <p>已使用 {link.usedCount} 次 / 最大次数：{link.maxUses || '不限'} · {publicLinkStatus(link)}</p>
      <div className="flex gap-3"><button disabled={busy} onClick={()=>void copy(link)}>复制链接</button>{link.isActive && <button disabled={busy} onClick={()=>void disable(link)}>停用此链接</button>}</div>
    </article>})}
    {canCreate ? <div className="flex flex-wrap gap-3 items-end">
      <label className="grid gap-1">有效期<input type="datetime-local" value={expiresAt} onChange={e=>setExpiry(e.target.value)} disabled={busy} className="border rounded px-3 py-2" /></label>
      <label className="grid gap-1">最大参与次数（0 表示不限）<input type="number" min="0" max="2147483647" step="1" value={maxUses} onChange={e=>setMaxUses(e.target.value)} disabled={busy} className="border rounded px-3 py-2" /></label>
      <button disabled={busy} className="btn-primary" onClick={()=>void create()}>生成新链接</button>
      {maximumExpiry && <p className="w-full text-sm text-gray-600">测评截止：{new Date(maximumExpiry).toLocaleString()}</p>}
    </div> : <p>发布后才能生成匿名链接。</p>}
  </section>
}
