import {useEffect,useRef,useState} from 'react'
import {sessionFetch} from '../../api/client'
import {TrainingContentReports} from './TrainingContentReports'
import type {TrainingContentReport} from './types'
type Choice={releaseId:string;entryKey:string;priority:number}
type Body={requestId:string;itemId:string;reason:string;previousArtifactId?:string;reportReleaseId?:string;references:Choice[]}
type Pending={courseId:string;grantId:string;body:Body;hadUnknown:boolean}
type Saved={artifactId:string;artifactHash:string;createdAt:string;currentUseStatus:'AVAILABLE'|'REVOKED';lifecycleNotices:TrainingContentReport['lifecycleNotices'];artifact:{
 schemaVersion:1;semantics:'EXPLICIT_IMMUTABLE_INTERPRETATION';actorId:string;courseId:string;compositeId:string;attemptId:string;itemId:string;reason:string;
 sourceReceiptHash:string;previous:{kind:string;artifactId?:string;hash:string};report:TrainingContentReport['rendered'];
 versions:{report:{releaseId:string;contentHash:string}|null};interpretation:{units:Array<{report:{status:TrainingContentReport['status']};references:Array<{metricKey:string;referenceKind:string;status:string;reason?:string}>}>}}}
type Exported={document:{schemaVersion:1;schema:'TRAINING_INTERPRETATION_EXPORT_V1';artifactId:string;artifactHash:string;createdAt:string;artifact:Saved['artifact']};exportHash:string;lifecycleNotices:Saved['lifecycleNotices'];currentUseStatus:Saved['currentUseStatus']}
type Transport=<T>(path:string,method?:string,body?:unknown)=>Promise<T>
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,hash=/^[a-f0-9]{64}$/
const transport:Transport=async<T,>(path:string,method='GET',body?:unknown):Promise<T>=>{
 const response=await sessionFetch('/api'+path,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
 let value:{code:number;message?:string;data:T}
 try{value=await response.json()}catch{throw new Error('请求结果尚未确认')}
 if(!response.ok||value.code!==0)throw Object.assign(new Error(value.message||'解释请求失败'),{status:response.status})
 return value.data
}
/** Explicit one-unit authoring, never part of a default export. Recovery stores
 * only the exact author choices/identities, not answers, reports or credentials. */
export function TrainingReinterpretationStudio({actorId,compositeId,attemptId,itemIds,request=transport}:{actorId:string;compositeId:string;attemptId:string;itemIds:string[];request?:Transport}){
 const cacheKey=['training-interpretation',actorId,compositeId,attemptId].join(':')
 const [restored]=useState(()=>{try{
  const raw=sessionStorage.getItem(cacheKey);if(!raw)return {pending:null as Pending|null,error:''}
  const p=JSON.parse(raw) as Pending,b=p.body
  if(!uuid.test(p.courseId)||!uuid.test(p.grantId)||!uuid.test(b.requestId)||!itemIds.includes(b.itemId)||b.reason?.trim().length<3||b.reason.length>1000
   ||!Array.isArray(b.references)||b.references.length>100||b.references.some(r=>!uuid.test(r.releaseId)||!hash.test(r.entryKey)||!Number.isSafeInteger(r.priority))
   ||b.reportReleaseId!==undefined&&!uuid.test(b.reportReleaseId)||b.previousArtifactId!==undefined&&!uuid.test(b.previousArtifactId)||!b.reportReleaseId&&!b.references.length)throw Error()
  return {pending:{...p,hadUnknown:p.hadUnknown!==false},error:''}
 }catch{return {pending:null,error:'恢复记录不可读取；请用已知工件编号核对，暂不能创建新请求。'}}})
 const [pending,setPending]=useState<Pending|null>(restored.pending),[storageError,setStorageError]=useState(restored.error)
 const [course,setCourse]=useState(restored.pending?.courseId??''),[grant,setGrant]=useState(restored.pending?.grantId??'')
 const [item,setItem]=useState(itemIds[0]??''),[reason,setReason]=useState(''),[report,setReport]=useState(''),[references,setReferences]=useState(''),[previous,setPrevious]=useState('')
 const [artifactId,setArtifactId]=useState(restored.pending?.body.requestId??''),[artifact,setArtifact]=useState<Saved|null>(null)
 const [busy,setBusy]=useState(false),[issued,setIssued]=useState(false),[error,setError]=useState('')
 const epoch=useRef(0);useEffect(()=>()=>{epoch.current++},[])
 useEffect(()=>{if(!pending&&!busy)return;const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[pending,busy])
 const path=(courseId:string,grantId:string,suffix='')=>`/questionnaire-products/${encodeURIComponent(compositeId)}/courses/${encodeURIComponent(courseId)}/attempts/${encodeURIComponent(attemptId)}/interpretations${suffix}?grantId=${encodeURIComponent(grantId)}`
 const retain=(p:Pending)=>{sessionStorage.setItem(cacheKey,JSON.stringify(p));setPending(p);setArtifactId(p.body.requestId)}
 const accept=(value:Saved,expectedCourse:string)=>{
  const a=value.artifact
  if(a.schemaVersion!==1||a.semantics!=='EXPLICIT_IMMUTABLE_INTERPRETATION'||a.courseId!==expectedCourse||a.compositeId!==compositeId||a.attemptId!==attemptId||!itemIds.includes(a.itemId)||!hash.test(value.artifactHash))throw Error('解释工件身份不匹配')
  setArtifact(value);setArtifactId(value.artifactId)
  if(!pending||pending.body.requestId===value.artifactId)setIssued(true)
  if(pending?.body.requestId===value.artifactId){sessionStorage.removeItem(cacheKey);setPending(null);setStorageError('')}
 }
 async function create(){
  setError('');let p=pending
  try{
   if(!p){
    const refs=references.trim()?references.trim().split('\n').map(line=>{const parts=line.trim().split(/\s+/),[releaseId,entryKey,rawPriority]=parts,priority=Number(rawPriority)
     if(parts.length!==3||!uuid.test(releaseId)||!hash.test(entryKey)||!Number.isSafeInteger(priority))throw Error('每行填写参考 release UUID、entryKey SHA-256、整数优先级');return {releaseId,entryKey,priority}}):[]
    if(!uuid.test(course)||!uuid.test(grant)||!itemIds.includes(item)||reason.trim().length<3||reason.trim().length>1000||refs.length>100
     ||report&&!uuid.test(report)||previous&&!uuid.test(previous)||!report&&!refs.length)throw Error('请填写精确课程、授权、原因，并显式选择报告或参考版本')
    p={courseId:course,grantId:grant,body:{requestId:crypto.randomUUID(),itemId:item,reason:reason.trim(),references:refs,...(report?{reportReleaseId:report}:{}),...(previous?{previousArtifactId:previous}:{})},hadUnknown:false}
   }
   if(!window.confirm('创建独立新解释？原始计分、旧报告和默认原始导出保持不变。'))return
   retain({...p,hadUnknown:true})
  }catch(e){setError(e instanceof Error?e.message:'请求未发送');return}
  const token=++epoch.current;setBusy(true);setArtifact(null)
  try{const result=await request<Saved>(path(p.courseId,p.grantId),'POST',p.body);if(token!==epoch.current)return
   if(result.artifactId!==p.body.requestId)throw Error('请求编号不匹配');accept(result,p.courseId);sessionStorage.removeItem(cacheKey);setPending(null);setStorageError('');setIssued(true)
  }catch(e){if(token===epoch.current){const status=(e as {status?:number}).status,message=e instanceof Error?e.message:'结果未知'
   if(!p.hadUnknown&&[400,403,404,409].includes(status??0)){
    try{sessionStorage.removeItem(cacheKey);setPending(null);setError(message+'；本次明确未执行，可以修正输入。')}catch{setError(message+'；恢复记录仍保留。')}
   }else{const unknown=p.hadUnknown||status!==401;try{retain({...p,hadUnknown:unknown})}catch{setStorageError('无法保存恢复状态，请勿离开页面。')}
    setError(message+'；原请求编号已保存，请核对后重试同一请求。')}
  }}finally{if(token===epoch.current)setBusy(false)}
 }
 async function read(download=false){
  setError('');setArtifact(null)
  const courseId=pending?.courseId??course,grantId=pending?.grantId??grant
  if(!uuid.test(courseId)||!uuid.test(grantId)||!uuid.test(artifactId)){setError('请填写精确课程、授权和工件 UUID');return}
  const requestedId=artifactId,token=++epoch.current;setBusy(true)
  try{
   if(download){const result=await request<Exported>(path(courseId,grantId,'/'+encodeURIComponent(requestedId)+'/export'));if(token!==epoch.current)return
    if(result.document.schema!=='TRAINING_INTERPRETATION_EXPORT_V1'||result.document.schemaVersion!==1||result.document.artifactId!==requestedId||!hash.test(result.exportHash))throw Error('导出合同不匹配')
    accept({...result.document,lifecycleNotices:result.lifecycleNotices,currentUseStatus:result.currentUseStatus},courseId)
    if(result.currentUseStatus==='REVOKED'&&!window.confirm('此历史解释引用了已撤回版本，不可作为当前有效结论。仍下载原始历史解释工件吗？'))return
    const url=URL.createObjectURL(new Blob([JSON.stringify({document:result.document,exportHash:result.exportHash},null,2)],{type:'application/json;charset=utf-8'}))
    try{const link=document.createElement('a');link.href=url;link.download='training-interpretation-'+requestedId+'.json';link.click()}finally{URL.revokeObjectURL(url)}
   }else{const result=await request<Saved>(path(courseId,grantId,'/'+encodeURIComponent(requestedId)));if(token!==epoch.current)return
    if(result.artifactId!==requestedId)throw Error('工件编号不匹配');accept(result,courseId)}
  }catch(e){if(token===epoch.current)setError(e instanceof Error?e.message:'工件读取失败')}finally{if(token===epoch.current)setBusy(false)}
 }
 return <section className="my-5 rounded border p-4 space-y-3" aria-label="Training 独立解释"><h2>显式新解释与独立导出</h2>
  <p>仅处理此已完成作答的精确单元。需要当前课程数据权限和 data.reinterpret 授权；不自动更新旧解释，不重评分，默认原始导出不混入解释。</p>
  <fieldset disabled={busy||Boolean(pending)||Boolean(storageError)||issued} className="space-y-2">
   <label>投放课程 UUID<input className="input" value={course} onChange={e=>setCourse(e.target.value.trim())}/></label>
   <label>重新解释授权 UUID<input className="input" value={grant} onChange={e=>setGrant(e.target.value.trim())}/></label>
   <label>精确作答单元<select className="input" value={item} onChange={e=>setItem(e.target.value)}>{itemIds.map(id=><option key={id} value={id}>{id}</option>)}</select></label>
   <label>新解释原因<textarea className="input" value={reason} onChange={e=>setReason(e.target.value)}/></label>
   <label>报告 release UUID（可选）<input className="input" value={report} onChange={e=>setReport(e.target.value.trim())}/></label>
   <label>参考条目（每行 release UUID、entryKey、priority）<textarea className="input" value={references} onChange={e=>setReferences(e.target.value)}/></label>
   <label>前一解释工件 UUID（留空关联原 FINAL）<input className="input" value={previous} onChange={e=>setPrevious(e.target.value.trim())}/></label>
  </fieldset>
  {pending&&<p role="status">待核对请求 {pending.body.requestId}。读取其他工件不会取消此请求。</p>}
  <button type="button" className="btn-primary" disabled={busy||Boolean(storageError)||issued&&!pending} onClick={()=>void create()}>{pending?'重试同一解释请求':'确认创建独立解释'}</button>
  {issued&&!pending&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>{setIssued(false);setArtifact(null);setReason('');setPrevious(artifact?.artifactId??'')}}>编制另一份独立解释</button>}
  <label>已保存解释工件 UUID<input className="input" value={artifactId} disabled={busy} onChange={e=>{setArtifactId(e.target.value.trim());setArtifact(null)}}/></label>
  <button type="button" className="btn-secondary" disabled={busy} onClick={()=>void read()}>读取精确解释工件</button>
  <button type="button" className="btn-secondary" disabled={busy} onClick={()=>void read(true)}>独立导出解释 JSON</button>
  {error&&<p role="alert">{error}</p>}{storageError&&<p role="alert">{storageError}</p>}
  {artifact&&<article aria-label="独立解释结果"><p>工件 {artifact.artifactId} · {artifact.createdAt}</p><p className="break-all">摘要 {artifact.artifactHash}</p>
   <p>原因：{artifact.artifact.reason} · 原件 {artifact.artifact.previous.artifactId??artifact.artifact.previous.hash}</p>
   {artifact.lifecycleNotices.map((notice,i)=><p role="status" key={i}>当前版本状态：{notice.layer} · {notice.releaseId} · {notice.status}</p>)}
   {artifact.currentUseStatus==='REVOKED'?<p role="alert">此历史解释引用了已撤回版本，停止展示结论；原始事实未被修改。</p>:<>
    {artifact.artifact.interpretation.units[0]?.references.map((reference,i)=><p key={i}>{reference.metricKey} · {reference.referenceKind} · {reference.status} {reference.reason??''}</p>)}
    <TrainingContentReports audience="teacher" reports={[{itemId:artifact.artifact.itemId,status:artifact.artifact.interpretation.units[0]?.report.status??'UNAVAILABLE',
     reportRelease:artifact.artifact.versions.report,lifecycleNotices:[],rendered:artifact.artifact.report}]}/>
   </>}
  </article>}
 </section>
}
