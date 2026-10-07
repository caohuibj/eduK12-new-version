import { useEffect, useRef, useState } from 'react'
import { parentsApi, type PublicationPreview, type GrantOption } from '../../api/parents'
import { useAuth } from '../../contexts/AuthContext'
import { ProductButton, ProductStatus } from '../../components/product-ui'
import { useStaffFeedback } from '../../components/staff-ui/useStaffFeedback'
import { apiErrorMessage } from '../../utils/apiErrorMessage'
import ParentReportView from './ParentReportView'

type Item = { id: string; title: string; templates: Array<{key:string;version:string;title:string}>; template: string; preview?: PublicationPreview; checked?: boolean; result?: string; published?: boolean; grants?: GrantOption[]; grantResults?: Record<string,string> }
export default function ParentBatchPreparation({rows,scope}:{rows:Array<{id:string;title:string}>;scope:string}) {
 const {user}=useAuth();return <Batch key={`${user?.id}:${scope}`} rows={rows} principal={user?.id||''}/>
}
function Batch({rows,principal}:{rows:Array<{id:string;title:string}>;principal:string}){
 const {feedback,confirm}=useStaffFeedback(),[items,setItems]=useState<Item[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[grants,setGrants]=useState<string[]>([]),epoch=useRef(0),lock=useRef(false)
 const grantResult=(id:string,grantId:string,result:string)=>setItems(old=>old.map(row=>row.id===id?{...row,grantResults:{...row.grantResults,[grantId]:result}}:row))
 const update=(id:string,patch:Partial<Item>)=>setItems(old=>old.map(row=>row.id===id?{...row,...patch}:row))
 useEffect(()=>{const clear=()=>{epoch.current++;setItems([]);setGrants([]);setError('')};window.addEventListener('focus',clear);return()=>{epoch.current++;window.removeEventListener('focus',clear)}},[])
 async function action(run:(current:()=>boolean)=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');const at=epoch.current;try{await run(()=>epoch.current===at)}catch(e){if(epoch.current===at)setError(apiErrorMessage(e))}finally{lock.current=false;setBusy(false)}}
 async function select(row:{id:string;title:string},selected:boolean){if(!selected){setItems(old=>old.filter(i=>i.id!==row.id));return}await action(async current=>{const data=await parentsApi.templates(row.id);if(current())setItems(old=>[...old.filter(i=>i.id!==row.id),{...row,templates:data.list,template:data.list.length===1?`${data.list[0].key}:${data.list[0].version}`:''}])})}
 async function prepare(){await action(async current=>{for(const row of items){if(!current())return;if(row.published||!row.template)continue;try{const [key,version]=row.template.split(':');const preview=await parentsApi.previewPublication(row.id,key,version);if(!current())return
    // Only opaque request identity persists; report projections remain in memory.
    const storageKey=`parent-batch:${principal}:${row.id}`,fingerprint=JSON.stringify([preview.previewHash,preview.expectedVersion,preview.template])
    let saved:{fingerprint:string;commandKey:string}|null=null;try{saved=JSON.parse(sessionStorage.getItem(storageKey)||'null')}catch{/* discard malformed metadata */}
    if(saved?.fingerprint===fingerprint&&/^[a-f0-9-]{36}$/.test(saved.commandKey))preview.commandKey=saved.commandKey
    sessionStorage.setItem(storageKey,JSON.stringify({fingerprint,commandKey:preview.commandKey}))
    update(row.id,{preview,checked:false,result:'预览已准备，请逐份核对'})
   }catch(e){if(current())update(row.id,{preview:undefined,result:apiErrorMessage(e)})}}})}
 async function publish(){const selectedEpoch=epoch.current;const chosen=items.filter(i=>i.checked&&i.preview&&!i.published&&i.preview.allowedActions.includes('PUBLISH'));if(!chosen.length||!await confirm({title:'确认发布选中的家长摘要',body:`将发布已逐份核对的 ${chosen.length} 份摘要。家长仍需有效关系、学生对具体版本的同意和负责人授权才能读取。`,confirmLabel:'发布已核对摘要'})||selectedEpoch!==epoch.current)return
  await action(async current=>{for(const row of chosen){if(!current())return;try{await parentsApi.publish(row.preview!);if(!current())return;sessionStorage.removeItem(`parent-batch:${principal}:${row.id}`);update(row.id,{published:true,checked:false,preview:undefined,result:'已发布，等待学生同意后逐份授权'})}catch(e){if(current())update(row.id,{result:apiErrorMessage(e)})}}})
 }
 async function loadConsents(){await action(async current=>{for(const row of items){if(!current())return;try{const result=await parentsApi.consents(row.id);if(current())update(row.id,{grants:result.list,result:result.truncated?'同意记录较多，请在单份入口核对剩余记录':'已刷新当前有效同意'})}catch(e){if(current())update(row.id,{grants:[],result:apiErrorMessage(e)})}}setGrants([])})}
 async function grant(){const selectedEpoch=epoch.current;const chosen=items.flatMap(i=>(i.grants||[]).filter(g=>grants.includes(`${i.id}:${g.id}`)&&g.allowedActions.includes('GRANT')).map(g=>({artifact:i.id,grant:g})));if(!chosen.length||!await confirm({title:'确认逐份授权',body:`将为明确选中的 ${chosen.length} 项有效学生同意授予家长读取权限；每项在服务器再次核对关系、内容版本和当前权限。`,confirmLabel:'授权选中记录'})||selectedEpoch!==epoch.current)return
  await action(async current=>{for(const row of chosen){if(!current())return;try{await parentsApi.grant(row.artifact,row.grant);if(current()){setGrants(old=>old.filter(k=>k!==`${row.artifact}:${row.grant.id}`));grantResult(row.artifact,row.grant.id,`已授权给 ${row.grant.parentName}`)}}catch(e){if(current())grantResult(row.artifact,row.grant.id,apiErrorMessage(e))}}})
 }
 return <section className="my-6 space-y-4 rounded-xl border bg-white p-5" aria-label="家长报告批量准备"><h2 className="text-xl font-semibold">批量准备与逐份授权</h2><p>选择当前页报告，核对每份摘要后发布；学生同意和家长授权分别处理。切换窗口返回后会重新核对权限。</p>{feedback}{error&&<ProductStatus kind="error" title="批量操作未确认">{error}</ProductStatus>}
  <fieldset disabled={busy} className="grid gap-3 md:grid-cols-2"><legend>选择已完成的来源报告</legend>{rows.map(row=><label key={row.id} className="rounded border p-3"><input type="checkbox" checked={items.some(i=>i.id===row.id)} onChange={e=>void select(row,e.target.checked)}/> {row.title}</label>)}</fieldset>
  {items.map(row=><article key={row.id} className="space-y-3 border-t pt-4"><h3 className="font-semibold">{row.title}</h3><label>家长摘要模板<select className="input ml-2 max-w-full" disabled={busy||row.published} value={row.template} onChange={e=>update(row.id,{template:e.target.value,preview:undefined,checked:false})}><option value="">请选择已准入模板</option>{row.templates.map(t=><option key={`${t.key}:${t.version}`} value={`${t.key}:${t.version}`}>{t.title} · {t.version}</option>)}</select></label>
   {!row.templates.length&&<p>该来源暂无可发布模板，需要先核对正式模板与工具披露配置。</p>}
   {row.preview&&<><ParentReportView report={row.preview.projection}/><label><input type="checkbox" disabled={busy||!row.preview.allowedActions.includes('PUBLISH')} checked={!!row.checked} onChange={e=>update(row.id,{checked:e.target.checked})}/> 已核对本份家长摘要的内容与受众</label></>}
   {row.result&&<p role="status">{row.result}</p>}
   {row.grants?.map(g=><label key={g.id} className="block"><input type="checkbox" disabled={busy||!g.allowedActions.includes('GRANT')} checked={grants.includes(`${row.id}:${g.id}`)} onChange={e=>setGrants(old=>e.target.checked?[...old,`${row.id}:${g.id}`]:old.filter(k=>k!==`${row.id}:${g.id}`))}/> 有效同意 · 接收家长：{g.parentName}{row.grantResults?.[g.id]&&<span role="status" className="block">{row.grantResults[g.id]}</span>}</label>)}
  </article>)}
  <div className="flex flex-wrap gap-3"><ProductButton disabled={busy||!items.some(i=>i.template&&!i.published)} onClick={()=>void prepare()}>准备选中报告的预览</ProductButton><ProductButton variant="primary" disabled={busy||!items.some(i=>i.checked&&i.preview&&!i.published)} onClick={()=>void publish()}>发布已逐份核对的摘要</ProductButton><ProductButton disabled={busy||!items.length} onClick={()=>void loadConsents()}>刷新学生同意</ProductButton><ProductButton disabled={busy||!grants.length} onClick={()=>void grant()}>授权选中同意记录</ProductButton></div>
 </section>
}
