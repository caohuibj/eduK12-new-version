import {useEffect,useRef,useState} from 'react'
import type {TrainingAnalysisSource} from '../api/trainingAnalysis'
import {trainingReferenceApi,trainingReferenceEvidenceLabels,type TrainingReferenceCandidate,type TrainingReferenceContext,
 type TrainingReferenceEvidence,type TrainingReferenceOperation,type TrainingReferenceResult,type TrainingReferenceSelector} from '../api/trainingReference'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const digest=/^[a-f0-9]{64}$/
const sourceKey=(source:TrainingAnalysisSource)=>JSON.stringify([source.taskId,source.publication,source.configDigest,source.variantKey,source.materialGroupKey??null])
const metricKey=(metric:{itemId:string;metricKey:string})=>JSON.stringify([metric.itemId,metric.metricKey])
const emptyEvidence=()=>Object.fromEntries(Object.keys(trainingReferenceEvidenceLabels).map(key=>[key,''])) as TrainingReferenceEvidence
type Pending={schemaVersion:1;actorId:string;context:TrainingReferenceContext;request:TrainingReferenceOperation;hadUnknownOutcome:boolean}
export type TrainingReferenceReady={candidate:Pick<TrainingReferenceCandidate,'candidateId'|'candidateHash'>;analyzeGrantId:string;verified:boolean}
type Resume={schemaVersion:1;actorId:string;courseId:string;compositeId:string;candidateId:string;candidateHash:string;analyzeGrantId:string;selector:TrainingReferenceSelector}
function validResume(value:unknown,actorId:string,courseId:string):value is Resume{
 if(!value||typeof value!=='object')return false
 const row=value as Resume,selector=row.selector
 return row.schemaVersion===1&&row.actorId===actorId&&row.courseId===courseId&&uuid.test(row.compositeId)&&uuid.test(row.candidateId)&&digest.test(row.candidateHash)&&uuid.test(row.analyzeGrantId)
  &&Boolean(selector&&uuid.test(selector.itemId)&&typeof selector.scoreKey==='string'&&typeof selector.publication==='string'&&Number.isFinite(Date.parse(selector.publication)))
}
const matches=(source:TrainingAnalysisSource,compositeId:string,selector:TrainingReferenceSelector)=>source.taskId===compositeId&&source.publication===selector.publication
 &&source.configDigest===selector.configDigest&&source.variantKey===selector.variantKey&&source.materialGroupKey===selector.materialGroupKey
function validPending(value:unknown,actorId:string,courseId:string):value is Pending{
 if(!value||typeof value!=='object')return false
 const row=value as Pending,body=row.request?.body
 if(row.schemaVersion!==1||row.actorId!==actorId||row.context?.courseId!==courseId||!uuid.test(row.context.compositeId)||!uuid.test(row.context.grantId)
  ||typeof row.hadUnknownOutcome!=='boolean'||!body||!uuid.test(body.requestId))return false
 if(row.request.operation==='CREATE'){
  const input=row.request.body,selector=input.selector
  return Boolean(selector&&uuid.test(selector.itemId)&&typeof selector.scoreKey==='string'&&selector.scoreKey.trim()
   &&typeof selector.publication==='string'&&Number.isFinite(Date.parse(selector.publication))&&typeof input.referenceVersion==='string'
   &&input.evidence&&Object.keys(trainingReferenceEvidenceLabels).every(key=>typeof input.evidence[key as keyof TrainingReferenceEvidence]==='string'))
 }
 if(row.request.operation==='REVIEW')return uuid.test(row.request.body.candidateId)&&digest.test(row.request.body.candidateHash)
  &&['APPROVED','REJECTED'].includes(row.request.body.decision)&&typeof row.request.body.statement==='string'
 return row.request.operation==='PUBLISH'&&uuid.test(row.request.body.candidateId)&&uuid.test(row.request.body.reviewId)
  &&typeof row.request.body.localKey==='string'&&typeof row.request.body.version==='string'
}
/** Same-actor/course pending identity is stored before any mutation. All paths
 * are derived by the API helper; session storage cannot supply an endpoint. */
export function TrainingReferenceStudio({actorId,courseId,sources,disabled=false,onRiskChange,onCandidateReady}:{actorId:string;courseId:string;sources:TrainingAnalysisSource[];
 disabled?:boolean;onRiskChange?:(locked:boolean)=>void;onCandidateReady?:(ready:TrainingReferenceReady|null)=>void}){
 const storageKey='training-reference-pending:'+actorId+':'+courseId
 const resumeKey=storageKey+':candidate'
 const [recovery]=useState(()=>{try{const raw=sessionStorage.getItem(storageKey),saved=sessionStorage.getItem(resumeKey)
  const pending:unknown=raw?JSON.parse(raw):null,resume:unknown=saved?JSON.parse(saved):null
  if(pending&&!validPending(pending,actorId,courseId)||resume&&!validResume(resume,actorId,courseId))throw new Error()
  return {pending:pending as Pending|null,resume:resume as Resume|null,error:''}
 }catch{return {pending:null,resume:null,error:'无法核对本账号保存的请求。请保留记录，先核对既有操作，不要另建同一请求。'}}})
 const [pending,setPending]=useState<Pending|null>(recovery.pending),[missing,setMissing]=useState(false),[storageError,setStorageError]=useState(recovery.error)
 const resumedSource=recovery.resume?sources.find(item=>matches(item,recovery.resume!.compositeId,recovery.resume!.selector)):undefined
 const [selectedSource,setSelectedSource]=useState(()=>resumedSource?sourceKey(resumedSource):''),[selectedMetric,setSelectedMetric]=useState(()=>resumedSource&&recovery.resume?metricKey({itemId:recovery.resume.selector.itemId,metricKey:recovery.resume.selector.scoreKey}):'')
 const [analyzeGrant,setAnalyzeGrant]=useState(recovery.resume?.analyzeGrantId??''),[reviewGrant,setReviewGrant]=useState(''),[publishGrant,setPublishGrant]=useState('')
 const [version,setVersion]=useState(''),[evidence,setEvidence]=useState<TrainingReferenceEvidence>(emptyEvidence)
 const [candidateId,setCandidateId]=useState(recovery.resume?.candidateId??''),[candidate,setCandidate]=useState<TrainingReferenceCandidate|null>(null),[freshRead,setFreshRead]=useState(false)
 const [decision,setDecision]=useState<'APPROVED'|'REJECTED'>('APPROVED'),[statement,setStatement]=useState(''),[reviewId,setReviewId]=useState(''),[localKey,setLocalKey]=useState(''),[releaseVersion,setReleaseVersion]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const lock=useRef(false),epoch=useRef(0),scope=useRef({actorId,courseId})
 const source=sources.find(item=>sourceKey(item)===selectedSource),metric=source?.metrics.find(item=>metricKey(item)===selectedMetric)
 const context=(grantId:string,compositeId=source?.taskId??candidate?.source.compositeId??''):TrainingReferenceContext=>({courseId,compositeId,grantId})
 const locked=busy||Boolean(pending)||Boolean(storageError)
 useEffect(()=>{onRiskChange?.(locked);return()=>onRiskChange?.(false)},[locked,onRiskChange])
 useEffect(()=>()=>{epoch.current++},[])
 useEffect(()=>{if(!pending&&!busy)return;const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
  window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[pending,busy])
 useEffect(()=>{if(recovery.resume)onCandidateReady?.({candidate:{candidateId:recovery.resume.candidateId,candidateHash:recovery.resume.candidateHash},analyzeGrantId:recovery.resume.analyzeGrantId,verified:false})},[recovery,onCandidateReady])
 const active=()=>scope.current.actorId===actorId&&scope.current.courseId===courseId
 function clearReady(){onCandidateReady?.(null);try{sessionStorage.removeItem(resumeKey)}catch{setStorageError('无法更新已保存的候选身份，请先核对原请求。')}}
 function remember(value:TrainingReferenceCandidate,grantId:string){
  const resume:Resume={schemaVersion:1,actorId,courseId,compositeId:value.source.compositeId,candidateId:value.candidateId,candidateHash:value.candidateHash,analyzeGrantId:grantId,selector:value.source.selector}
  sessionStorage.setItem(resumeKey,JSON.stringify(resume));onCandidateReady?.({candidate:value,analyzeGrantId:grantId,verified:true})
 }
 async function run(work:()=>Promise<void>,recovery=false){if(lock.current||(!recovery&&disabled)||!active())return;lock.current=true;setBusy(true);setError('');const current=epoch.current
  try{await work()}catch(e){if(current===epoch.current)setError(e instanceof Error?e.message:'请求未完成')}
  finally{lock.current=false;if(current===epoch.current)setBusy(false)}}
 function save(value:Pending){sessionStorage.setItem(storageKey,JSON.stringify(value));setPending(value);setMissing(false)}
 function accept(value:Pending,result:TrainingReferenceResult){
  if(value.request.operation==='CREATE'){
   const created=result as TrainingReferenceCandidate
   if(!uuid.test(created.candidateId)||!digest.test(created.candidateHash)||created.source?.courseId!==courseId||created.source?.compositeId!==value.context.compositeId)throw new Error('候选结果身份不一致，请核对原请求。')
   setCandidate(created);setCandidateId(created.candidateId);setFreshRead(false);setReviewId('');setAnalyzeGrant(value.context.grantId)
   const matched=sources.find(item=>matches(item,created.source.compositeId,created.source.selector))
   if(matched){setSelectedSource(sourceKey(matched));setSelectedMetric(metricKey({itemId:created.source.selector.itemId,metricKey:created.source.selector.scoreKey}))}
   remember(created,value.context.grantId);setNotice('候选已创建。请使用独立 review 授权读取核验，再显式审核。')
  }else if(value.request.operation==='REVIEW'){
   if(!('reviewId' in result)||!uuid.test(result.reviewId))throw new Error('审核结果身份无法确认。')
   setCandidateId(value.request.body.candidateId);setReviewId(result.reviewId);setNotice('审核已保存：'+result.reviewId)
  }else{
   if(!('releaseId' in result)||!uuid.test(result.releaseId))throw new Error('发布结果身份无法确认。')
   setNotice('私有描述性参考已发布：'+result.releaseId+'。既有投放和历史结果不会自动切换。')
  }
  sessionStorage.removeItem(storageKey);setPending(null);setMissing(false)
 }
 function submit(value:Pending,recovery=false){
  if(lock.current||(!recovery&&disabled)||!active())return
  try{save({...value,hadUnknownOutcome:true})}catch{setStorageError('会话存储不可用，未发送请求。请先恢复存储后重试。');return}
  void run(async()=>{const current=epoch.current
   try{const result=await trainingReferenceApi.execute(value.context,value.request);if(current===epoch.current)accept(value,result)}
   catch(e){if(current!==epoch.current)return
    const status=(e as {status?:number}).status,message=e instanceof Error?e.message:'请求未确认'
    const known=!value.hadUnknownOutcome&&[400,403,409].includes(status??0)&&!/MFA|安全密钥|重新登录|会话|认证/.test(message)
    if(known){sessionStorage.removeItem(storageKey);setPending(null);setMissing(false);setError(message+'；本次请求明确未执行，可修正后提交。')}
    else {save({...value,hadUnknownOutcome:value.hadUnknownOutcome||![400,401,403,409,429].includes(status??0)});setError(message+'；结果未确认，请核对原请求。')}
   }
  },recovery)
 }
 function start(request:TrainingReferenceOperation,grantId:string,compositeId?:string){submit({schemaVersion:1,actorId,context:context(grantId,compositeId),request,hadUnknownOutcome:false})}
 function create(){if(!source||!metric||!uuid.test(analyzeGrant)||!version.trim()||Object.values(evidence).some(value=>!value.trim())){setError('请选择已授权来源与指标，并填写 analyze 授权、版本及九项证据。');return}
  if(!window.confirm('确认从所选精确课程投放的已保存 FINAL 创建描述性候选？这不是正式常模。'))return
  start({operation:'CREATE',body:{requestId:crypto.randomUUID(),selector:{itemId:metric.itemId,scoreKey:metric.metricKey,publication:source.publication,
   configDigest:source.configDigest,variantKey:source.variantKey,...(source.materialGroupKey===undefined?{}:{materialGroupKey:source.materialGroupKey})},referenceVersion:version.trim(),evidence}},analyzeGrant)
 }
 function read(){if(!source||!uuid.test(candidateId)||!uuid.test(reviewGrant)){setError('请选择实际课程来源，填写候选和 review 授权 ID。');return}
  setFreshRead(false);setCandidate(null);onCandidateReady?.(null);void run(async()=>{const current=epoch.current
   const result=await trainingReferenceApi.read(context(reviewGrant),candidateId)
   if(current!==epoch.current)return
   if(result.candidateId!==candidateId||result.source.courseId!==courseId||result.source.compositeId!==source.taskId||!digest.test(result.candidateHash))throw new Error('候选身份与本课程任务不一致')
   setCandidate(result);setFreshRead(true);setReviewId('');setNotice('已核对当前候选内容和数据权限。')
   if(uuid.test(analyzeGrant))remember(result,analyzeGrant)
  })
 }
 function review(){if(!candidate||!freshRead||!statement.trim()||!uuid.test(reviewGrant))return
  if(!window.confirm('确认对当前已读候选提交 '+decision+' 审核？'))return
  start({operation:'REVIEW',body:{requestId:crypto.randomUUID(),candidateId:candidate.candidateId,candidateHash:candidate.candidateHash,decision,statement:statement.trim()}},reviewGrant,candidate.source.compositeId)
 }
 function publish(){if(!candidate||!freshRead||!uuid.test(reviewId)||!uuid.test(publishGrant)||!localKey.trim()||!releaseVersion.trim()){setError('请先读取候选并填写 review ID、publish 授权及发布 key/版本。');return}
  if(!window.confirm('确认发布本课程私有描述性参考？不会升级既有投放或覆盖原始事实。'))return
  start({operation:'PUBLISH',body:{requestId:crypto.randomUUID(),candidateId:candidate.candidateId,reviewId,localKey:localKey.trim(),version:releaseVersion.trim()}},publishGrant,candidate.source.compositeId)
 }
 function status(){if(!pending)return;void run(async()=>{const current=epoch.current,result=await trainingReferenceApi.status(pending.context,pending.request)
  if(current!==epoch.current)return
  if(result.requestId!==pending.request.body.requestId)throw new Error('返回请求编号不一致')
  if(result.status==='COMPLETED'&&result.result)accept(pending,result.result)
  else if(result.status==='MISSING'){setMissing(true);setNotice('尚未找到完成记录，但原操作可能仍在执行。只可重试同一编号与完全相同内容。')}
  else throw new Error('请求状态不完整，请保留原请求。')
 },true)}
 function sourceChanged(value:string){setSelectedSource(value);setSelectedMetric('');setCandidate(null);setFreshRead(false);setCandidateId('');setReviewId('');clearReady()}
 return <section className="training-analysis-results training-reference-studio" aria-label="课程描述性参考工作台"><h3>课程描述性参考</h3>
  {recovery.resume&&!candidate&&<p>已恢复上次候选身份。现有正式提交可核对原请求；新提交前须重新读取当前候选，不把缓存当成当前授权。</p>}
  <p>基于一个精确投放与数值指标生成候选。每项操作需要独立内容能力；课程作者身份不代替授权。最多 250 份已完成 FINAL，低于披露人数或重复身份不会生成统计。发布不会自动建立正式常模或改写旧结果。</p>
  <fieldset disabled={disabled||locked||!actorId}><legend>已授权来源</legend>
   <label>参考来源投放<select value={selectedSource} onChange={e=>sourceChanged(e.target.value)}><option value="">选择课程任务、冻结版本和分组</option>{sources.map(item=><option key={sourceKey(item)} value={sourceKey(item)}>{item.taskName} · {item.publication} · {item.materialGroupKey??item.variantKey??'未分组'}</option>)}</select></label>
   <label>参考数值指标<select value={selectedMetric} onChange={e=>{setSelectedMetric(e.target.value);setCandidate(null);setFreshRead(false);setCandidateId('');setReviewId('');clearReady()}} disabled={!source}><option value="">选择实际指标</option>{source?.metrics.map(item=><option key={metricKey(item)} value={metricKey(item)}>{item.label??item.metricKey} · {item.itemId}</option>)}</select></label>
  </fieldset>
  <fieldset disabled={disabled||locked||!actorId}><legend>创建描述性候选</legend>
   <label>analyze 授权 ID<input value={analyzeGrant} onChange={e=>{setAnalyzeGrant(e.target.value.trim());clearReady()}}/></label>
   <label>参考候选版本<input maxLength={200} value={version} onChange={e=>setVersion(e.target.value)}/></label>
   {Object.entries(trainingReferenceEvidenceLabels).map(([key,label])=><label key={key}>{label}<textarea maxLength={4000} value={evidence[key as keyof TrainingReferenceEvidence]} onChange={e=>setEvidence({...evidence,[key]:e.target.value})}/></label>)}
   <button type="button" disabled={!source||!metric} onClick={create}>创建课程描述性候选</button>
  </fieldset>
  <fieldset disabled={disabled||locked||!actorId}><legend>读取当前候选</legend>
   <label>候选 ID<input value={candidateId} onChange={e=>{setCandidateId(e.target.value.trim());setCandidate(null);setFreshRead(false);setReviewId('');clearReady()}}/></label>
   <label>review 授权 ID<input value={reviewGrant} onChange={e=>{setReviewGrant(e.target.value.trim());setFreshRead(false)}}/></label>
   <button type="button" onClick={read}>读取课程候选核验</button>
  </fieldset>
  {candidate&&<article aria-label="课程参考候选聚合结果"><p>候选 {candidate.candidateId} · 样本量 {candidate.sampleSize} · 测量版本 {candidate.measurement.releaseId}</p>
   <p>当前候选摘要：{candidate.candidateHash}</p>{candidate.definition.entries.map((entry,index)=><div key={index}><p>{entry.scoreKey}：均值 {entry.statistics.mean??'不可估计'}；标准差 {entry.statistics.sd??'不提供转换'}</p>{entry.limitations?.map((text,i)=><p key={i}>{text}</p>)}</div>)}
   {Object.entries(candidate.exclusionCounts??{}).map(([reason,count])=><p key={reason}>{reason}：{count}</p>)}
   {Object.entries(candidate.evidence).map(([key,value])=><p key={key}>{key}：{value}</p>)}
  </article>}
  <fieldset disabled={disabled||locked||!freshRead||!actorId}><legend>审核已读候选</legend><label>审核决定<select value={decision} onChange={e=>setDecision(e.target.value as 'APPROVED'|'REJECTED')}><option value="APPROVED">批准</option><option value="REJECTED">拒绝</option></select></label>
   <label>审核说明<textarea maxLength={4000} value={statement} onChange={e=>setStatement(e.target.value)}/></label><button type="button" disabled={!statement.trim()} onClick={review}>提交课程参考审核</button>
  </fieldset>
  <fieldset disabled={disabled||locked||!freshRead||!actorId}><legend>显式发布私有参考</legend>
   <label>publish 授权 ID<input value={publishGrant} onChange={e=>setPublishGrant(e.target.value.trim())}/></label><label>实际 review ID<input value={reviewId} onChange={e=>setReviewId(e.target.value.trim())}/></label>
   <label>参考发布 key<input maxLength={165} value={localKey} onChange={e=>setLocalKey(e.target.value)}/></label><label>参考发布版本<input maxLength={200} value={releaseVersion} onChange={e=>setReleaseVersion(e.target.value)}/></label>
   <button type="button" onClick={publish}>发布课程私有参考</button>
  </fieldset>
  {pending&&<div role="status"><p>待核对 {pending.request.operation} · 请求 {pending.request.body.requestId}。原范围和内容已保存在本账号课程会话中。</p>
   <button type="button" disabled={busy} onClick={status}>核对参考请求状态</button>
   {(missing||!pending.hadUnknownOutcome)&&<button type="button" disabled={busy} onClick={()=>{if(window.confirm('确认只重试完全相同的编号、授权、范围和内容？'))submit(pending,true)}}>重试原参考请求</button>}
  </div>}
  {storageError&&<p role="alert">{storageError}</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </section>
}
