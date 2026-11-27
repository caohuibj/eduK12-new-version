import { useEffect, useState } from 'react'
import api from '../api/client'

type Item = { key:string; name:string; limit:number|null }
type Event = { revision:number; actor:string; createdAt:string; action:string; reason:string; tools:Item[]; previous:Item[] }
const base = '/admin/permissions/tool-licenses/'
const limit = (n:number|null) => n === null ? '不限' : String(n)

function changes(event:Event) {
  const before = new Map(event.previous.map(tool => [tool.key,tool]))
  const after = new Set(event.tools.map(tool => tool.key))
  const result = event.previous.filter(tool => !after.has(tool.key)).map(tool => '移除 '+tool.name)
  for (const tool of event.tools) {
    const previous = before.get(tool.key)
    if (!previous) result.push('新增 '+tool.name+'（额度 '+limit(tool.limit)+'）')
    else if (previous.limit !== tool.limit) result.push(tool.name+' 额度 '+limit(previous.limit)+' → '+limit(tool.limit))
  }
  return result
}

function usePage<T>(path:string) {
  const [rows,setRows] = useState<T[]>([])
  const [error,setError] = useState('')
  const [loading,setLoading] = useState(false)
  useEffect(()=>{
    let active=true
    setRows([]);setError('');setLoading(Boolean(path))
    if(path) void api.get<T[]>(path).then(response=>{
      if(active)setRows(response.data!)
    }).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'读取失败，请重新展开')})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[path])
  return {rows,error,loading}
}

export function LicenseHistory({id}:{id:string}) {
  const [open,setOpen] = useState(false)
  const [pages,setPages] = useState<number[]>([])
  const before=pages[pages.length-1]
  const {rows,error,loading}=usePage<Event>(open?base+id+'/history'+(before?'?before='+before:''):'')
  return <details onToggle={event=>setOpen(event.currentTarget.open)}><summary>查看变更历史</summary>
    {loading&&<p role="status">正在读取历史…</p>}{error&&<p role="alert">{error}</p>}
    <ol>{rows.map(event=><li key={event.revision}><strong>修订 {event.revision} · {event.action==='TERMINATED'?'终止':event.action==='CREATED'?'签发':'调整'}</strong>
      <p>{new Date(event.createdAt).toLocaleString('zh-CN')} · {event.actor} · {event.reason}</p>
      <ul>{changes(event).map((change,i)=><li key={i}>{change}</li>)}</ul>
    </li>)}</ol>
    {pages.length>0&&<button type="button" onClick={()=>setPages(p=>p.slice(0,-1))}>较新修订</button>}
    {rows.length>0&&rows[rows.length-1].revision>1&&<button type="button" onClick={()=>setPages(p=>[...p,rows[rows.length-1].revision])}>较早修订</button>}
  </details>
}
