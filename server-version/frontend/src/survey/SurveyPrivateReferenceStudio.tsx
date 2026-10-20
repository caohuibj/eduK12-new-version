import {useEffect,useRef,useState} from 'react'
import {FormalReferenceSubmission} from '../training/FormalReferenceStudio'
const evidenceFields={methodRationale:'方法依据',inclusionRule:'纳入规则',missingness:'缺失处理',repeatResponses:'重复作答',organizationClustering:'组织聚类',administrationDifferences:'施测差异',uncertainty:'不确定性',applicability:'适用范围',sampleAdequacy:'样本充分性'} as const
type Evidence=Record<keyof typeof evidenceFields,string>
type Candidate={candidateId:string;candidateHash:string;sampleSize:number;measurement:{releaseId:string};definition:{referenceVersion:string;entries:{scoreKey:string;statistics:{mean?:number;sd?:number};limitations?:string[]}[]};evidence:Record<string,string>;exclusionCounts?:Record<string,number>}
type FormalResume={candidateId:string;candidateHash:string;analyzeGrantId:string}
type Pending={operation:'CREATE'|'REVIEW'|'PUBLISH';path:string;body:Record<string,unknown>;hadUnknownOutcome?:boolean}
type Request=<T>(path:string,method?:string,body?:unknown)=>Promise<T>
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function validPendingPath(value:Pending,base:string){
 if(value.operation==='CREATE')return value.path===base
 const tail=value.path.slice(base.length+1).split('/')
 return value.path.startsWith(base+'/')&&tail.length===2&&uuid.test(tail[0])&&tail[1]===(value.operation==='REVIEW'?'reviews':'publish')
}
const emptyEvidence=()=>Object.fromEntries(Object.keys(evidenceFields).map(key=>[key,''])) as Evidence
export function SurveyPrivateReferenceStudio({projectId,waveId,actorId,request}:{projectId:string;waveId:string;actorId?:string;request:Request}){
 const [formalRisk,setFormalRisk]=useState(false)
 const resumeKey=actorId?'survey-reference-formal-source:'+actorId+':'+projectId+':'+waveId:null
 const [resumeRecovery]=useState(()=>{try{const raw=resumeKey?sessionStorage.getItem(resumeKey):null;if(!raw)return {source:null,error:''}
  const value=JSON.parse(raw);if(value.actorId!==actorId||value.projectId!==projectId||value.waveId!==waveId||!uuid.test(value.source?.candidateId)||!uuid.test(value.source?.analyzeGrantId)||!/^[a-f0-9]{64}$/.test(value.source?.candidateHash))throw new Error()
  return {source:value.source as FormalResume,error:''}
 }catch{return {source:null,error:'无法恢复本波次正式提交的来源身份，请先核对原记录。'}}})
 const [resumeSource,setResumeSource]=useState<FormalResume|null>(resumeRecovery.source)
 const storageKey=actorId?'survey-reference-pending:'+actorId+':'+projectId+':'+waveId:null
 const [recovery]=useState(()=>{try{const saved=storageKey?sessionStorage.getItem(storageKey):null;if(!saved)return {pending:null,error:''};const data=JSON.parse(saved);const prefix='/projects/'+encodeURIComponent(projectId)+'/analytics/waves/'+encodeURIComponent(waveId)+'/reference-candidates';if(data.actorId!==actorId||!['CREATE','REVIEW','PUBLISH'].includes(data.pending?.operation)||typeof data.pending?.path!=='string'||!validPendingPath(data.pending,prefix)||!data.pending.body)throw new Error();return {pending:{...data.pending,hadUnknownOutcome:data.pending.hadUnknownOutcome!==false} as Pending,error:''}}catch{return {pending:null,error:'无法恢复本账号的待核对请求，请先核对原记录。'}}})
 const [pending,setPending]=useState<Pending|null>(recovery.pending),[missing,setMissing]=useState(false),[storageError,setStorageError]=useState(recovery.error)
 const [analyzeGrant,setAnalyzeGrant]=useState(resumeRecovery.source?.analyzeGrantId??''),[reviewGrant,setReviewGrant]=useState(''),[publishGrant,setPublishGrant]=useState('')
 const [instrument,setInstrument]=useState(''),[metric,setMetric]=useState(''),[version,setVersion]=useState(''),[evidence,setEvidence]=useState<Evidence>(emptyEvidence)
 const [candidateId,setCandidateId]=useState(resumeRecovery.source?.candidateId??''),[candidate,setCandidate]=useState<Candidate|null>(null),[readId,setReadId]=useState('')
 const [decision,setDecision]=useState('APPROVED'),[statement,setStatement]=useState(''),[reviewId,setReviewId]=useState(''),[localKey,setLocalKey]=useState(''),[releaseVersion,setReleaseVersion]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(recovery.pending?'存在未确认请求，请先核对请求结果。':'')
 const epoch=useRef(0),lock=useRef(false)
 useEffect(()=>()=>{epoch.current++},[])
 useEffect(()=>{if(!uncertain)return;const guard=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[uncertain])
 const base='/projects/'+encodeURIComponent(projectId)+'/analytics/waves/'+encodeURIComponent(waveId)+'/reference-candidates'
 async function run(work:()=>Promise<void>,mutation=''){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');const current=epoch.current
  try{await work()}catch(e){if(current===epoch.current){setError(e instanceof Error?e.message:'操作未完成');if(mutation)setUncertain(mutation+'结果尚未确认；不要重复提交。请保留本页并核对实际记录。')}}finally{lock.current=false;if(current===epoch.current)setBusy(false)}
 }
 function savePending(value:Pending,inFlight=false){
  if(!storageKey)throw new Error('当前研究者身份不可用，请重新登录后操作')
  sessionStorage.setItem(storageKey,JSON.stringify({actorId,pending:inFlight?{...value,hadUnknownOutcome:true}:value}));setPending(value);setMissing(false)
 }
 function accept(value:Pending,result:Candidate|{reviewId:string}|unknown){
  if(value.operation==='CREATE'){const created=result as Candidate;setCandidate(created);setCandidateId(created.candidateId);setReadId('')
   const grant=String(value.body.grantId??'');setAnalyzeGrant(grant)
   if(resumeKey&&uuid.test(created.candidateId)&&/^[a-f0-9]{64}$/.test(created.candidateHash)&&uuid.test(grant)){
    const source={candidateId:created.candidateId,candidateHash:created.candidateHash,analyzeGrantId:grant}
    try{sessionStorage.setItem(resumeKey,JSON.stringify({actorId,projectId,waveId,source}));setResumeSource(source)}catch{setStorageError('来源候选已创建，但无法保存正式提交恢复身份；请保留候选 ID 和摘要。')}
   }
   setNotice('候选已创建。审核前请使用独立 review 能力读取核验。')}
  else if(value.operation==='REVIEW'){setReviewId((result as {reviewId:string}).reviewId);setNotice('审核已保存：'+(result as {reviewId:string}).reviewId)}
  else setNotice('私有描述性样本参考发布已确认。')
  if(storageKey)sessionStorage.removeItem(storageKey);setPending(null);setMissing(false);setUncertain('')
 }
 function submit(value:Pending){
  try{savePending(value,true)}catch{setStorageError('无法保存本账号待核对请求，未发送。请恢复浏览器会话存储后再试。');return}
  void run(async()=>{
   try{const result=await request(value.path,'POST',value.body);accept(value,result)}catch(e){
    const failure=e as Error&{status?:number},message=failure instanceof Error?failure.message:'操作未完成'
    const stepUp=failure.status===401||/MFA|二次验证|安全密钥|重新登录|会话/.test(message)
    if(!value.hadUnknownOutcome&&[400,403,409].includes(failure.status??0)&&!stepUp){
     if(storageKey)sessionStorage.removeItem(storageKey);setPending(null);setMissing(false);setUncertain('');setError(message+'；本次请求明确未执行，可修改后重新提交。')
    }else{
     const unknown=Boolean(value.hadUnknownOutcome)||![400,401,403,409,429].includes(failure.status??0)
     savePending({...value,hadUnknownOutcome:unknown});setError(message);setUncertain(value.operation+'结果尚未确认；请核对或重新认证后使用原请求。')
    }
   }
  },value.operation)
 }
 function status(){if(!pending||pending.operation==='PUBLISH')return
  void run(async()=>{const result=await request<{status:'MISSING'|'COMPLETED';result?:unknown}>(pending.path+'/request-status','POST',pending.body)
   if(result.status==='COMPLETED')accept(pending,result.result)
   else if(result.status==='MISSING'){setMissing(true);setNotice('当前未发现已完成记录，原操作可能仍在计算；只可重试原编号与完全相同内容。')}
  })
 }
 function create(){if(!uuid.test(analyzeGrant)||!instrument.trim()||!metric.trim()||!version.trim()||Object.values(evidence).some(v=>!v.trim())){setError('请填写 analyze 授权 UUID、工具/指标/版本及九项方法证据。');return}
  if(!window.confirm('确认从本项目本波次的真实已保存计分事实创建描述性样本参考候选？'))return
  submit({operation:'CREATE',path:base,body:{requestId:crypto.randomUUID(),grantId:analyzeGrant,instrumentKey:instrument.trim(),scoreKey:metric.trim(),referenceVersion:version.trim(),evidence}})
 }
 function read(){if(!uuid.test(candidateId)||!uuid.test(reviewGrant)){setError('请填写实际候选和 review 授权 UUID');return}
  setCandidate(null);setReadId('');void run(async()=>{const result=await request<Candidate>(base+'/'+candidateId+'?grantId='+encodeURIComponent(reviewGrant));setCandidate(result);setReadId(result.candidateId)})
 }
 function review(){if(!readId||!uuid.test(reviewGrant)||!statement.trim())return
  if(!window.confirm('确认提交 '+decision+' 审核意见？此操作不会自动重试。'))return
  submit({operation:'REVIEW',path:base+'/'+readId+'/reviews',body:{requestId:crypto.randomUUID(),candidateHash:candidate!.candidateHash,grantId:reviewGrant,decision,statement:statement.trim()}})
 }
 function publish(){if(!readId||!uuid.test(publishGrant)||!uuid.test(reviewId)||!localKey.trim()||!releaseVersion.trim()){setError('发布需要已读候选、实际 review UUID、publish 授权和本地 key/版本。');return}
  if(!window.confirm('确认发布本项目私有描述性样本参考？不构成正式常模。'))return
  submit({operation:'PUBLISH',path:base+'/'+readId+'/publish',body:{grantId:publishGrant,reviewId,localKey:localKey.trim(),version:releaseVersion.trim()}})
 }
 return <section className="border rounded-xl p-4 space-y-3" aria-label="私有描述性样本参考"><h3>本项目描述性样本参考</h3><p>仅描述本项目本波次样本，不是正式常模。当前数据权限、近期 MFA 与每项独立内容能力均由后台核验；项目所有者身份不能代替能力授权。</p>
 <fieldset disabled={formalRisk||busy||Boolean(pending)||!actorId||Boolean(recovery.error)}><legend>创建候选</legend>
 <label>analyze 授权 UUID<input value={analyzeGrant} onChange={e=>setAnalyzeGrant(e.target.value)}/></label>
 <label>来源工具 key<input maxLength={240} value={instrument} onChange={e=>setInstrument(e.target.value)}/></label><label>指标 key<input maxLength={240} value={metric} onChange={e=>setMetric(e.target.value)}/></label><label>参考候选版本<input maxLength={240} value={version} onChange={e=>setVersion(e.target.value)}/></label>
 {Object.entries(evidenceFields).map(([key,label])=><label key={key}>{label}<textarea maxLength={4000} value={evidence[key as keyof Evidence]} onChange={e=>setEvidence({...evidence,[key]:e.target.value})}/></label>)}
 <button type="button" onClick={create}>创建描述性候选</button></fieldset>
 <fieldset disabled={formalRisk||busy}><legend>核验实际候选</legend><label>候选 UUID<input value={candidateId} onChange={e=>{setCandidateId(e.target.value);setCandidate(null);setReadId('');setReviewId('')}}/></label><label>review 授权 UUID<input value={reviewGrant} onChange={e=>{setReviewGrant(e.target.value);setReadId('')}}/></label><button type="button" onClick={read}>读取候选核验</button></fieldset>
 {candidate&&<article><h4>候选聚合结果</h4><p>候选 {candidate.candidateId} · 样本量 {candidate.sampleSize} · 测量版本 {candidate.measurement.releaseId}</p><p>候选摘要 {candidate.candidateHash}</p>
 {candidate.definition.entries.map((entry,index)=><div key={index}><p>{entry.scoreKey}：均值 {entry.statistics.mean??'不可估计'}；标准差 {entry.statistics.sd??'不提供转换'}</p>{entry.limitations?.map((line,i)=><p key={i}>{line}</p>)}</div>)}
 {candidate.exclusionCounts&&Object.entries(candidate.exclusionCounts).map(([key,count])=><p key={key}>排除 {key}：{count}</p>)}
 {Object.entries(candidate.evidence).map(([key,value])=><p key={key}>{key}：{value}</p>)}</article>}
 <fieldset disabled={formalRisk||busy||!readId||Boolean(pending)||!actorId||Boolean(recovery.error)}><legend>审核已读候选</legend><label>审核决定<select value={decision} onChange={e=>setDecision(e.target.value)}><option value="APPROVED">批准</option><option value="REJECTED">拒绝</option></select></label><label>审核说明<textarea maxLength={4000} value={statement} onChange={e=>setStatement(e.target.value)}/></label><button type="button" disabled={!statement.trim()} onClick={review}>提交审核</button></fieldset>
 <fieldset disabled={formalRisk||busy||!readId||Boolean(pending)||!actorId||Boolean(recovery.error)}><legend>显式发布</legend><label>publish 授权 UUID<input value={publishGrant} onChange={e=>setPublishGrant(e.target.value)}/></label><label>实际 review UUID<input value={reviewId} onChange={e=>setReviewId(e.target.value)}/></label><label>发布本地 key<input maxLength={165} value={localKey} onChange={e=>setLocalKey(e.target.value)}/></label><label>发布版本<input maxLength={240} value={releaseVersion} onChange={e=>setReleaseVersion(e.target.value)}/></label><button type="button" onClick={publish}>确认发布私有参考</button></fieldset>
 {actorId&&(candidate??resumeSource)&&uuid.test(analyzeGrant)&&<>
   {!candidate&&<p>已恢复正式来源身份，但未重新读取当前候选；仅可核对原待确认请求，不可新提交。</p>}
   <FormalReferenceSubmission key={actorId+':'+(candidate??resumeSource)!.candidateId+':'+(candidate??resumeSource)!.candidateHash}
    actorId={actorId} product="SURVEY" candidateId={(candidate??resumeSource)!.candidateId} candidateHash={(candidate??resumeSource)!.candidateHash}
    analyzeGrantId={analyzeGrant} surveyRequest={request} disabled={!candidate||busy||Boolean(pending)} onRiskChange={setFormalRisk}/></>}
 {resumeRecovery.error&&<p role="alert">{resumeRecovery.error}</p>}
 {pending&&<div><p>待核对操作 {pending.operation} · 请求编号 {String(pending.body.requestId??'固定发布 key/version')} · 本项目本波次会话已保存</p>
 {pending.operation!=='PUBLISH'&&<button type="button" disabled={busy} onClick={status}>核对待确认请求</button>}
 {pending.operation==='PUBLISH'&&<button type="button" disabled={busy} onClick={()=>{if(window.confirm('确认重试完全相同的发布 key、版本与内容？'))submit(pending)}}>重试同一发布请求</button>}
 {pending.operation!=='PUBLISH'&&pending.hadUnknownOutcome===false&&!missing&&<button type="button" disabled={busy} onClick={()=>{if(window.confirm('确认重新认证后重试原请求？'))submit(pending)}}>重新认证后重试原请求</button>}
 {missing&&<button type="button" disabled={busy} onClick={()=>{if(window.confirm('确认使用原请求编号及完全相同内容重试？'))submit(pending)}}>重试原编号和内容</button>}</div>}
 {storageError&&<p role="alert">{storageError}</p>}{error&&<p role="alert">{error}</p>}{uncertain&&<p role="alert">{uncertain}</p>}{notice&&<p role="status">{notice}</p>}
 </section>
}
