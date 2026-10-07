import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
import { useStaffFeedback } from '../../components/staff-ui/useStaffFeedback'
import { apiErrorMessage } from '../../utils/apiErrorMessage'

type Row={id:string;name:string;status:string;kind:string;editHref:string;created:string}
export default function AssessmentManagement(){const {user}=useAuth();return <Management key={user?.id}/>}
function Management(){
 const epoch=useRef(0),lock=useRef(false)
 const {feedback,confirm}=useStaffFeedback(),[rows,setRows]=useState<Row[]>([]),[selected,setSelected]=useState<string[]>([]),[search,setSearch]=useState(''),[status,setStatus]=useState(''),[since,setSince]=useState(''),[page,setPage]=useState(1),[total,setTotal]=useState(0)
 const [events,setEvents]=useState<Array<{id:string;action:string;resourceId:string;createdAt:string;metadata:{name?:string}}>>([]),[eventPage,setEventPage]=useState(1),[eventMore,setEventMore]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[outcomes,setOutcomes]=useState<Record<string,string>>({}),[retry,setRetry]=useState(0)
 useEffect(()=>{setPage(1)},[search,status,since])
 useEffect(()=>{epoch.current++;let live=true;setError('');setBusy(true);setRows([]);setEvents([]);setSelected([]);void Promise.all([api.get<{list:Row[];total:number}>(`/questionnaire-products?${new URLSearchParams({page:String(page),search,...(status?{status}:{}),...(since?{since}:{})})}`),api.get<{list:typeof events;hasMore:boolean}>(`/questionnaire-products/management-events?page=${eventPage}`)]).then(([r,e])=>{if(r.code!==0)throw r;if(e.code!==0)throw e;if(live){setRows(r.data.list);setTotal(r.data.total);setEvents(e.data.list);setEventMore(e.data.hasMore)}}).catch(e=>{if(live)setError(apiErrorMessage(e))}).finally(()=>{if(live)setBusy(false)});return()=>{live=false;epoch.current++}},[page,eventPage,retry,search,status,since])
 const visible=rows
 async function archive(){if(lock.current)return;const at=epoch.current;const targets=visible.filter(r=>selected.includes(r.id)&&r.kind==='COLLECTION'&&r.status!=='ARCHIVED');if(!targets.length||!await confirm({title:'批量归档组合测评',body:`核对选中的 ${targets.length} 个对象。归档会停止新作答，已有答案与报告保留；每个对象独立返回处理结果。`,confirmLabel:'确认归档'}))return;if(at!==epoch.current||lock.current)return;lock.current=true;setBusy(true);const results:Record<string,string>={}
  for(const row of targets){if(at!==epoch.current)break;try{const d=await api.get<{revision:number;status:string}>(`/questionnaire-products/${row.id}`);if(d.code!==0)throw d;if(at!==epoch.current)break;if(d.data.status!=='ARCHIVED'){const r=await api.post(`/questionnaire-products/${row.id}/archive`,{revision:d.data.revision});if(r.code!==0)throw r}results[row.id]='已归档';setRows(current=>current.map(r=>r.id===row.id?{...r,status:'ARCHIVED'}:r))}catch(e){results[row.id]=apiErrorMessage(e)}setOutcomes({...results})}lock.current=false;setBusy(false);setSelected([])
 }
 return <ProductPage width="management"><PageHeader title="合成对象与操作记录" description="按名称、状态和日期核对对象；批量归档保留历史，逐项记录处理结果。"/>{feedback}
  <div className="my-4 flex flex-wrap gap-4"><label>名称或测试标记<input className="input" value={search} onChange={e=>setSearch(e.target.value)}/></label><label>状态<select className="input" value={status} onChange={e=>setStatus(e.target.value)}><option value="">全部</option><option value="DRAFT">草稿</option><option value="PUBLISHED">已发布</option><option value="ARCHIVED">已归档</option></select></label><label>创建日期不早于（UTC）<input className="input" type="date" value={since} onChange={e=>setSince(e.target.value)}/></label></div>
  <p>筛选由服务器在全部有权管理对象中执行。可批量处理新版组合测评；历史对象继续通过各自管理入口维护。</p>
  {error&&<ProductStatus kind="error" title="管理数据读取失败" actions={<ProductButton onClick={()=>setRetry(x=>x+1)}>重新读取</ProductButton>}>{error}</ProductStatus>}
  <div className="my-4 space-y-3">{visible.map(row=><article key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-4"><label><input type="checkbox" disabled={busy||row.kind!=='COLLECTION'||row.status==='ARCHIVED'} checked={selected.includes(row.id)} onChange={e=>setSelected(s=>e.target.checked?[...s,row.id]:s.filter(id=>id!==row.id))}/> {row.name} · {row.status==='DRAFT'?'草稿':row.status==='PUBLISHED'?'已发布':'已归档'}</label><Link to={row.editHref}>查看定义与引用</Link>{outcomes[row.id]&&<p role="status">{outcomes[row.id]}</p>}</article>)}</div>
  <ProductButton disabled={busy||!selected.length} onClick={()=>void archive()}>{busy?'处理中…':'预览并归档选中对象'}</ProductButton><div className="my-4 flex gap-3"><ProductButton disabled={busy||page===1} onClick={()=>setPage(x=>x-1)}>上一页</ProductButton><span>对象第 {page} 页</span><ProductButton disabled={busy||page*25>=total} onClick={()=>setPage(x=>x+1)}>下一页</ProductButton></div>
  <ProductButton disabled={busy} onClick={()=>setRetry(x=>x+1)}>刷新对象与操作记录</ProductButton><h2 className="mt-8 text-xl font-semibold">我的操作记录</h2><p className="my-2">归档、模板管理与课堂小结记录实际操作者和处理时间；记录不包含学生答案。</p><ul>{events.map(e=><li key={e.id} className="my-2 rounded bg-slate-50 p-3">{({ASSESSMENT_ARCHIVE:'测评归档',TEMPLATE_SAVE:'保存模板',TEMPLATE_ARCHIVE:'模板归档',CLASSROOM_SUMMARY:'生成课堂小结'} as Record<string,string>)[e.action]||e.action} · {e.metadata.name||e.resourceId} · {new Date(e.createdAt).toLocaleString('zh-CN')}</li>)}</ul><div className="my-4 flex gap-3"><ProductButton disabled={busy||eventPage===1} onClick={()=>setEventPage(x=>x-1)}>前一页记录</ProductButton><ProductButton disabled={busy||!eventMore} onClick={()=>setEventPage(x=>x+1)}>后一页记录</ProductButton></div><Link to="/assessment-workbench">返回结果工作台</Link>
 </ProductPage>
}
