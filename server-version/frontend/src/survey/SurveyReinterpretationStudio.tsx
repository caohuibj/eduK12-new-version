import {useEffect,useRef,useState} from 'react'
import {SurveyDeclaredReport,type DeclaredReport} from './SurveyStoredReportReader'
type Choice={releaseId:string;entryKey:string;priority:number}
type Body={requestId:string;grantId:string;instrumentKey:string;reportReleaseId?:string;references:Choice[]}
type Artifact={artifactId:string;finalId:string;artifactHash:string;createdAt:string;semantics:'EXPLICIT_IMMUTABLE_INTERPRETATION';accessAudience:'researcher';artifact:{sourceFinalHash:string;report:DeclaredReport|null;interpretation:{units:{instrumentKey:string;report:{status:string};references:{metricKey:string;referenceKind:string;status:string;reason?:string}[]}[]}}}
type Api=<T>(path:string,method?:string,body?:unknown)=>Promise<T>
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const hash=/^[a-f0-9]{64}$/
/** Only frozen IDs and author choices are retained; no answers, reports or credentials in session storage. */
export function SurveyReinterpretationStudio({actorId,projectId,waveId,finalId,instrumentKey,request}:{actorId:string;projectId:string;waveId:string;finalId:string;instrumentKey:string;request:Api}){
 const cacheKey=['survey-reinterpret-request',actorId,projectId,waveId,finalId,instrumentKey].join(':')
 const [restored]=useState(()=>{try{const raw=sessionStorage.getItem(cacheKey);if(!raw)return {pending:null as Body|null,error:'',hadUnknown:false};const stored=JSON.parse(raw),data=stored.body??stored;if(!uuid.test(data.requestId)||!uuid.test(data.grantId)||data.instrumentKey!==instrumentKey||!Array.isArray(data.references)||data.references.length>100||data.references.some((r:Choice)=>!uuid.test(r.releaseId)||!hash.test(r.entryKey)||!Number.isSafeInteger(r.priority))||data.reportReleaseId!==undefined&&!uuid.test(data.reportReleaseId))throw Error();return {pending:data as Body,error:'',hadUnknown:stored.hadUnknown!==false}}catch{return {pending:null as Body|null,error:'无法恢复请求记录，请先按已知工件编号核对后再操作。',hadUnknown:true}}})
 const [pending,setPending]=useState<Body|null>(restored.pending),[storageError,setStorageError]=useState(restored.error)
 const [grant,setGrant]=useState(''),[report,setReport]=useState(''),[refs,setRefs]=useState(''),[artifactId,setArtifactId]=useState(restored.pending?.requestId??'')
 const [issued,setIssued]=useState(false),[hadUnknown,setHadUnknown]=useState(restored.hadUnknown)
 const [artifact,setArtifact]=useState<Artifact|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const epoch=useRef(0);useEffect(()=>()=>{epoch.current++},[])
 useEffect(()=>{if(!pending)return;const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[pending])
 const base=`/projects/${encodeURIComponent(projectId)}/analytics/waves/${encodeURIComponent(waveId)}/finals/${encodeURIComponent(finalId)}/interpretations`
 const retain=(body:Body,unknown:boolean)=>{sessionStorage.setItem(cacheKey,JSON.stringify({body,hadUnknown:unknown}));setPending(body);setArtifactId(body.requestId)}
 const accept=(value:Artifact)=>{if(value.finalId!==finalId||value.accessAudience!=='researcher'||value.semantics!=='EXPLICIT_IMMUTABLE_INTERPRETATION')throw Error('工件身份不匹配');setArtifact(value);setArtifactId(value.artifactId);setIssued(true)
   if(pending?.requestId===value.artifactId){sessionStorage.removeItem(cacheKey);setPending(null);setStorageError('')}}
 async function create(){
  setError('');let body=pending
  try{
   if(!body){const references=refs.trim()?refs.trim().split('\n').map(line=>{const [releaseId,entryKey,p]=line.trim().split(/\s+/);const priority=Number(p);if(!uuid.test(releaseId)||!hash.test(entryKey)||p===undefined||!Number.isSafeInteger(priority))throw Error('每行填写 release UUID、entryKey SHA-256 和整数优先级');return {releaseId,entryKey,priority}}):[]
    if(!uuid.test(grant.trim())||report.trim()&&!uuid.test(report.trim())||!report.trim()&&!references.length||references.length>100)throw Error('填写实际 data.reinterpret 授权，并显式选择报告版本或参考条目（最多 100 项）')
    body={requestId:crypto.randomUUID(),grantId:grant.trim(),instrumentKey,...(report.trim()?{reportReleaseId:report.trim()}:{}),references}
   }
   if(!window.confirm('为此 FINAL 创建独立新解释？旧计分事实和既有报告保持原样。'))return
   retain(body,true)
  }catch(e){setError(e instanceof Error?e.message:'请求不能保存，未发送');return}
  const token=++epoch.current;setBusy(true);setArtifact(null)
  try{const result=await request<Artifact>(base,'POST',body);if(token!==epoch.current)return
    if(result.artifactId!==body.requestId)throw Error('工件编号不匹配');accept(result);sessionStorage.removeItem(cacheKey);setPending(null);setStorageError('')
  }catch(e){if(token===epoch.current){
    const status=(e as {status?:number})?.status,message=e instanceof Error?e.message:'创建结果未知'
    if(!hadUnknown&&[400,403,404,409].includes(status??0)&&!/MFA|验证|会话|登录/.test(message)){
      try{sessionStorage.removeItem(cacheKey);setPending(null);setError(message+'；本次明确未执行，可修正输入。')}catch{setError(message+'；无法清理待核对记录，保留原编号。')}
    }else{
      const unknown=hadUnknown||!(status===401||status===403&&/MFA|验证|会话|登录/.test(message))
      setHadUnknown(unknown)
      try{retain(body!,unknown)}catch{setStorageError('无法保存当前恢复状态，请勿离开页面。')}
      setError(message+'；原请求编号已保存。请先读取该编号核对，不自动重试。')
    }
  }}
  finally{if(token===epoch.current)setBusy(false)}
 }
 async function read(download=false){
  setError('');setArtifact(null);if(!uuid.test(artifactId.trim())){setError('填写实际工件 UUID');return}
  const token=++epoch.current;setBusy(true)
  try{const value=await request<Artifact>(base+'/'+encodeURIComponent(artifactId.trim()));if(token!==epoch.current)return;accept(value)
    if(download){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);try{const link=document.createElement('a');link.href=url;link.download='survey-interpretation-'+value.artifactId+'.json';link.click()}finally{URL.revokeObjectURL(url)}}
  }catch(e){if(token===epoch.current)setError(e instanceof Error?e.message:'工件读取失败')}
  finally{if(token===epoch.current)setBusy(false)}
 }
 return <section className="border rounded p-3 space-y-3" aria-label="独立新解释"><h4>显式生成独立解释</h4><p>FINAL {finalId} · {instrumentKey}。需要当前数据权限与精确 data.reinterpret 能力；不重评分，不替换旧报告，不扩大被试披露。</p>
  <fieldset disabled={busy||Boolean(pending)||Boolean(storageError)||issued}><label>重新解释授权 UUID<input value={grant} onChange={e=>setGrant(e.target.value)}/></label><label>报告 release UUID（可选）<input value={report} onChange={e=>setReport(e.target.value)}/></label>
   <label>参考条目（每行 release UUID、entryKey、priority）<textarea value={refs} onChange={e=>setRefs(e.target.value)}/></label></fieldset>
  {pending&&<p>待核对请求 {pending.requestId}。先读取确认；重试始终使用保存的同一内容。</p>}
  <button type="button" disabled={busy||Boolean(storageError)||issued} onClick={()=>void create()}>{pending?'人工重试同一解释请求':'确认创建独立解释'}</button>
  {issued&&!pending&&<button type="button" disabled={busy} onClick={()=>{setIssued(false);setHadUnknown(false);setArtifact(null);setGrant('');setReport('');setRefs('')}}>编制另一份独立解释</button>}
  <label>已保存解释工件 UUID<input value={artifactId} disabled={busy} onChange={e=>{setArtifactId(e.target.value);setArtifact(null)}}/></label>
  <button type="button" disabled={busy} onClick={()=>void read()}>读取精确解释工件</button><button type="button" disabled={busy} onClick={()=>void read(true)}>独立导出解释 JSON</button>
  {error&&<p role="alert">{error}</p>}{storageError&&<p role="alert">{storageError}</p>}
  {artifact&&<article aria-label="新解释结果"><p>独立工件 {artifact.artifactId} · {artifact.createdAt}</p><p>工件摘要 {artifact.artifactHash} · 原 FINAL 摘要 {artifact.artifact.sourceFinalHash}</p>
    {artifact.artifact.interpretation.units.map(unit=><section key={unit.instrumentKey}><p>{unit.instrumentKey} · 报告状态 {unit.report.status}</p>{unit.references.map((ref,i)=><p key={i}>{ref.metricKey} · {ref.referenceKind} · {ref.status} {ref.reason??''}</p>)}</section>)}
    {artifact.artifact.report?<SurveyDeclaredReport report={artifact.artifact.report}/>:<p>此工件无可用模板报告，保留解释状态。</p>}</article>}
 </section>
}
