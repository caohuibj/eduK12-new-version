import { useEffect, useState } from 'react'
import api from '../../api/client'
import { ProductButton, ProductStatus } from '../../components/product-ui'
import { apiErrorMessage } from '../../utils/apiErrorMessage'
type Summary={contentHash:string;payload:{name:string;frozenAt:string;participants:number;meaning:string;questions:Array<{id:string;title:string;ordinal:number;type:string;answered:number}>}}
export default function ClassroomSummary({id}:{id:string}){
 const [summary,setSummary]=useState<Summary|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0)
 useEffect(()=>{let live=true;setSummary(null);setError('');setBusy(true);void api.get<Summary|null>(`/classrooms/${id}/summary`).then(r=>{if(r.code!==0)throw r;if(live)setSummary(r.data)}).catch(e=>{if(live)setError(apiErrorMessage(e))}).finally(()=>{if(live)setBusy(false)});return()=>{live=false}},[id,retry])
 async function generate(){setBusy(true);setError('');try{const r=await api.post<Summary>(`/classrooms/${id}/summary`,{});if(r.code!==0)throw r;setSummary(r.data)}catch(e){setError(apiErrorMessage(e))}finally{setBusy(false)}}
 function download(){if(!summary)return;const blob=new Blob([JSON.stringify({schemaVersion:1,...summary},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='classroom-summary.json';a.click();URL.revokeObjectURL(url)}
 return <section className="my-6 space-y-4 rounded-xl border bg-white p-5" aria-label="课堂结束小结"><h2 className="text-xl font-semibold">课堂结束小结</h2>{error&&<ProductStatus kind="error" title="小结操作未完成" actions={<ProductButton onClick={()=>setRetry(x=>x+1)}>重新读取</ProductButton>}>{error}</ProductStatus>}
  {busy&&<p role="status">正在核对小结…</p>}{!summary&&<><p>课堂已结束，可生成绑定题目与结束后提交统计的只读小结。生成后内容冻结，重复操作返回同一记录。</p><ProductButton disabled={busy} variant="primary" onClick={()=>void generate()}>生成课堂小结</ProductButton></>}
  {summary&&<><p>参与会话 {summary.payload.participants} · 生成时间 {new Date(summary.payload.frozenAt).toLocaleString('zh-CN')}</p><p className="text-sm">{summary.payload.meaning}</p><ol className="space-y-3">{summary.payload.questions.map(q=><li key={q.id} className="rounded bg-slate-50 p-3">第 {q.ordinal+1} 题 · {q.title} · 提交 {q.answered} 份</li>)}</ol><ProductButton onClick={download}>下载只读小结</ProductButton><ProductButton onClick={()=>window.print()}>打印小结</ProductButton><details><summary>小结版本</summary><p className="break-all">{summary.contentHash}</p></details></>}
 </section>
}
