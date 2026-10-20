import {useEffect,useRef,useState} from 'react'
import {
  formalReferenceApi,type FormalReferenceCandidate,type FormalReferenceGrant,type FormalReferenceOperation,
  type FormalReferenceResult,type FormalReferenceSubmissionBody,type SurveyReferenceRequest,
} from '../api/formalReference'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const digest=/^[a-f0-9]{64}$/
type Pending={actorId:string;scope:string;product:'TRAINING'|'SURVEY';request:FormalReferenceOperation;hadUnknownOutcome:boolean}
function validPending(value:Pending,actorId:string,scope:string,product:string){
  if(value?.actorId!==actorId||value.scope!==scope||value.product!==product||typeof value.hadUnknownOutcome!=='boolean')return false
  const operation=value.request
  if(!operation||!operation.body)return false
  if(operation.operation==='SUBMIT')return scope===operation.body.sourceCandidateId+':'+operation.body.sourceCandidateHash
    &&uuid.test(operation.body.sourceCandidateId)&&digest.test(operation.body.sourceCandidateHash)&&uuid.test(operation.body.analyzeGrantId)
  if(product!=='TRAINING'||scope!=='platform'||!uuid.test(operation.body.candidateId)||!digest.test(operation.body.candidateHash)||!uuid.test(operation.body.grantId))return false
  if(operation.operation==='REVIEW')return uuid.test(operation.body.requestId)&&operation.body.consentReviewed===true
    &&['APPROVED','REJECTED'].includes(operation.body.decision)&&typeof operation.body.statement==='string'
  return operation.operation==='PUBLISH'&&uuid.test(operation.body.reviewId)&&typeof operation.body.localKey==='string'&&typeof operation.body.version==='string'
}
/** Exact pending body is saved before send. An older unknown outcome survives
 * later refusals; retries never acquire a new review UUID or publish version. */
function useFormalMutation({actorId,scope,product,disabled=false,onRiskChange,surveyRequest}:{
  actorId:string;scope:string;product:'TRAINING'|'SURVEY';disabled?:boolean;onRiskChange?:(risk:boolean)=>void;surveyRequest?:SurveyReferenceRequest;
}){
  const key='formal-reference:'+actorId+':'+product+':'+scope
  const [recovery]=useState(()=>{try{const raw=sessionStorage.getItem(key);if(!raw)return {pending:null,error:''}
    const value=JSON.parse(raw) as Pending;if(!validPending(value,actorId,scope,product))throw new Error()
    return {pending:value,error:''}
  }catch{return {pending:null,error:'无法核对本账号保存的正式参考请求。请保留原记录，先核对既有操作。'}}})
  const [pending,setPending]=useState<Pending|null>(recovery.pending),[busy,setBusy]=useState(false)
  const [error,setError]=useState(recovery.error),[result,setResult]=useState<FormalReferenceResult|null>(null)
  const [storageBlocked,setStorageBlocked]=useState(Boolean(recovery.error))
  const epoch=useRef(0),lock=useRef(false),identity=useRef(key)
  useEffect(()=>()=>{epoch.current++},[])
  useEffect(()=>{onRiskChange?.(busy||Boolean(pending)||storageBlocked);return()=>onRiskChange?.(false)},[busy,pending,storageBlocked,onRiskChange])
  useEffect(()=>{if(!pending&&!busy)return;const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
    window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[pending,busy])
  async function execute(request:FormalReferenceOperation,retry=false){
    if(lock.current||storageBlocked||identity.current!==key||(!retry&&(disabled||pending)))return
    const old=retry?pending:null
    if(retry&&(!old||JSON.stringify(old.request)!==JSON.stringify(request)))return
    const saved:Pending={actorId,scope,product,request,hadUnknownOutcome:old?.hadUnknownOutcome??false}
    try{sessionStorage.setItem(key,JSON.stringify({...saved,hadUnknownOutcome:true}))}
    catch{setStorageBlocked(true);setError('无法保存原请求，未发送。请恢复会话存储后重试。');return}
    setPending(saved);lock.current=true;setBusy(true);setError('');const active=epoch.current
    try{
      const value=await formalReferenceApi.execute(request,product,surveyRequest)
      if(epoch.current!==active||identity.current!==key)return
      if(request.operation==='SUBMIT'){
        if(!('candidateId' in value)||!uuid.test(value.candidateId)||!('sampleCount' in value)||!digest.test(value.candidateHash))throw new Error('候选结果身份无法核对')
      }else if(request.operation==='REVIEW'){
        if(!('reviewId' in value)||value.reviewId!==request.body.requestId||value.candidateHash!==request.body.candidateHash
          ||value.candidateId!==request.body.candidateId)throw new Error('审核结果身份无法核对')
      }else if(!('releaseId' in value)||!uuid.test(value.releaseId)||!digest.test(value.contentHash)||value.version!==request.body.version)
        throw new Error('发布结果身份无法核对')
      sessionStorage.removeItem(key);setPending(null);setResult(value)
    }catch(cause){
      if(epoch.current!==active||identity.current!==key)return
      const failure=cause as Error&{status?:number},message=failure instanceof Error?failure.message:'操作尚未确认'
      const stepUp=failure.status===401||/MFA|安全密钥|重新登录|会话/.test(message)
      if(!saved.hadUnknownOutcome&&[400,403,409,429].includes(failure.status??0)&&!stepUp){
        sessionStorage.removeItem(key);setPending(null);setError(message+'；本次明确未完成，可修正后重试。')
      }else{
        const next={...saved,hadUnknownOutcome:saved.hadUnknownOutcome||![400,401,403,409,429].includes(failure.status??0)}
        try{sessionStorage.setItem(key,JSON.stringify(next))}catch{setStorageBlocked(true)}
        setPending(next);setError(message+'；保留原请求，只可原样重试核对。')
      }
    }finally{lock.current=false;if(epoch.current===active)setBusy(false)}
  }
  return {busy,pending,error,result,setError,blocked:busy||Boolean(pending)||storageBlocked,
    start:(request:FormalReferenceOperation)=>void execute(request),
    retry:()=>pending&&void execute(pending.request,true)}
}
function PendingStatus({state}:{state:ReturnType<typeof useFormalMutation>}){
  return <>{state.error&&<p role="alert">{state.error}</p>}
    {state.pending&&<div role="status"><p>待核对 {state.pending.request.operation}。原请求已按当前账号保存，不会更换编号或版本。</p>
      <button type="button" disabled={state.busy} onClick={state.retry}>原样重试并核对</button></div>}</>
}
export function FormalReferenceSummary({candidate}:{candidate:FormalReferenceCandidate}){
  return <article aria-label="正式候选聚合证据"><h4>正式候选聚合证据</h4>
    <p>候选 {candidate.candidateId} · 摘要 {candidate.candidateHash}</p>
    <p>测量 {candidate.measurement.releaseId} · 样本数 {candidate.sampleCount} · 清单摘要 {candidate.sampleManifestHash}</p>
    <p>目标适用：{candidate.targetPopulation.kind==='GENERAL_POPULATION'?'显式总体范围':'明确受限范围'}；{candidate.targetPopulation.basis}</p>
    {candidate.targetPopulation.kind==='SUPPORTED_MATCH'&&Object.entries(candidate.targetPopulation.match).map(([key,value])=><p key={key}>{key}：{Array.isArray(value)?value.join('、'):value}</p>)}
    {candidate.definition.entries.map((entry,index)=><div key={index}><p>{entry.scoreKey}：均值 {entry.statistics.mean??'缺失'}；样本标准差 {entry.statistics.sd??'缺失'}</p>
      {entry.limitations?.map((text,i)=><p key={i}>{text}</p>)}</div>)}
    {Object.entries(candidate.evidence).map(([key,value])=><p key={key}>{key}：{value}</p>)}
    <p>提交说明：{candidate.submissionStatement}</p><p>来源方同意用途判断：{candidate.consentUseAssessment}</p>
    <h5>实际接受的同意范围证据</h5>{candidate.consentEvidence.map((consent,index)=><div key={index}>
      <p>版本 {consent.version} · 范围摘要 {consent.scopeHash} · 类型 {consent.dataCategories.join('、')}</p><p>{consent.purpose}</p><p>已接受同意正文摘要 {consent.bodyHash}</p><p style={{whiteSpace:'pre-wrap'}}>已接受同意正文：{consent.body}</p></div>)}
  </article>
}
const labels={statement:'正式提交说明',populationDescription:'目标人群说明',applicability:'正式适用性依据',
  sampleAdequacy:'正式样本充分性判断',uncertainty:'正式不确定性说明',consentUseAssessment:'已记录同意允许本用途的依据'} as const
export function FormalReferenceSubmission({actorId,product,candidateId,candidateHash,analyzeGrantId,disabled=false,onRiskChange,surveyRequest}:{
  actorId:string;product:'TRAINING'|'SURVEY';candidateId:string;candidateHash:string;analyzeGrantId:string;
  disabled?:boolean;onRiskChange?:(risk:boolean)=>void;surveyRequest?:SurveyReferenceRequest;
}){
  const [fields,setFields]=useState(()=>Object.fromEntries(Object.keys(labels).map(key=>[key,''])) as Record<keyof typeof labels,string>)
  const [mode,setMode]=useState<''|'SUPPORTED_MATCH'|'GENERAL_POPULATION'>(''),[basis,setBasis]=useState('')
  const [minAge,setMinAge]=useState(''),[maxAge,setMaxAge]=useState('')
  const state=useFormalMutation({actorId,scope:candidateId+':'+candidateHash,product,disabled,onRiskChange,surveyRequest})
  const locked=disabled||state.blocked
  function submit(){
    if(locked)return
    if(!uuid.test(candidateId)||!digest.test(candidateHash)||!uuid.test(analyzeGrantId)||Object.values(fields).some(text=>!text.trim())||!mode||!basis.trim()){
      state.setError('请完整填写用途、同意与科学依据，并明确选择目标适用范围。');return
    }
    const min=Number(minAge),max=Number(maxAge)
    if(mode==='SUPPORTED_MATCH'&&(!minAge||!maxAge||!Number.isInteger(min)||!Number.isInteger(max)||min<0||max<=min)){
      state.setError('请填写有效的年龄月数下界和不含上界；无法表示的范围应继续使用描述性参考。');return
    }
    const body:FormalReferenceSubmissionBody={sourceCandidateId:candidateId,sourceCandidateHash:candidateHash,analyzeGrantId,...fields,
      targetPopulation:mode==='SUPPORTED_MATCH'?{kind:mode,match:{minAgeMonthsInclusive:min,maxAgeMonthsExclusive:max},basis}:{kind:mode,basis}}
    if(window.confirm('仅提交现有聚合候选给独立审核，允许服务端在本次提交范围内复核当前来源。此操作不扩大被试同意，也不自动发布常模。'))state.start({operation:'SUBMIT',body})
  }
  return <section aria-label="提交正式参考候选" className="training-analysis-quality"><h3>提交正式跨入口候选</h3>
    <p>来源候选 {candidateId}。不会上传常模表或个人样本；实际同意须完整覆盖样本。提交不是科学批准，也不会替换旧结果。</p>
    <fieldset disabled={locked}><legend>用途与独立复核材料</legend>
      {Object.entries(labels).map(([key,label])=><label key={key}>{label}<textarea maxLength={4000} value={fields[key as keyof typeof labels]}
        onChange={event=>setFields({...fields,[key]:event.target.value})}/></label>)}
      <label>目标人群选择<select value={mode} onChange={event=>setMode(event.target.value as typeof mode)}>
        <option value="">请明确选择，不默认总体</option><option value="SUPPORTED_MATCH">年龄月数范围</option><option value="GENERAL_POPULATION">显式总体适用</option></select></label>
      {mode==='SUPPORTED_MATCH'&&<><label>年龄下界（月，含）<input type="number" min={0} max={2400} value={minAge} onChange={event=>setMinAge(event.target.value)}/></label>
        <label>年龄上界（月，不含）<input type="number" min={1} max={2401} value={maxAge} onChange={event=>setMaxAge(event.target.value)}/></label></>}
      <label>目标范围与代表性依据<textarea maxLength={4000} value={basis} onChange={event=>setBasis(event.target.value)}/></label>
      <button type="button" onClick={submit}>提交给独立正式审核</button>
    </fieldset>
    <PendingStatus state={state}/>{state.result&&'sampleCount' in state.result&&<><p role="status">正式候选已提交；请将下列候选 ID 与摘要交给有明确审核能力的独立人员。</p><FormalReferenceSummary candidate={state.result}/></>}
  </section>
}

export default function FormalReferenceStudio({actorId,disabled=false,onRiskChange}:{actorId:string;disabled?:boolean;onRiskChange?:(risk:boolean)=>void}){
  const [grants,setGrants]=useState<FormalReferenceGrant[]>([]),[grantError,setGrantError]=useState(''),[refresh,setRefresh]=useState(0)
  const [candidateId,setCandidateId]=useState(''),[readGrant,setReadGrant]=useState(''),[candidate,setCandidate]=useState<FormalReferenceCandidate|null>(null)
  const [publishGrant,setPublishGrant]=useState(''),[reviewId,setReviewId]=useState(''),[localKey,setLocalKey]=useState(''),[version,setVersion]=useState('')
  const [decision,setDecision]=useState<'APPROVED'|'REJECTED'>('APPROVED'),[statement,setStatement]=useState(''),[consentReviewed,setConsentReviewed]=useState(false)
  const [reading,setReading]=useState(false),readLock=useRef(false),epoch=useRef(0)
  const state=useFormalMutation({actorId,scope:'platform',product:'TRAINING',disabled,onRiskChange})
  useEffect(()=>{let active=true;setGrants([]);void formalReferenceApi.grants().then(value=>{if(active){setGrants(value);setGrantError('')}})
    .catch(()=>{if(active)setGrantError('正式治理能力暂时无法核对，请稍后刷新。')});return()=>{active=false;epoch.current++}},[actorId,refresh])
  useEffect(()=>{if(state.result&&'reviewId' in state.result)setReviewId(state.result.reviewId)},[state.result])
  const chosen=grants.find(grant=>grant.grantId===readGrant)
  const locked=disabled||state.blocked||reading
  const canReview=Boolean(candidate&&chosen?.capabilities.includes('reference.review')&&candidate.analyzerId!==actorId)
  async function read(){
    if(locked||readLock.current||!uuid.test(candidateId)||!chosen)return
    readLock.current=true;setReading(true);setCandidate(null);setReviewId('');setConsentReviewed(false);state.setError('');const current=epoch.current
    try{const value=await formalReferenceApi.read(candidateId,chosen.grantId,chosen.capabilities.includes('reference.review')?'REVIEW':'PUBLISH')
      if(epoch.current===current){if(value.candidateId!==candidateId||!digest.test(value.candidateHash))throw new Error('候选身份不匹配');setCandidate(value)}
    }catch(error){if(epoch.current===current)state.setError(error instanceof Error?error.message:'无法读取候选')}
    finally{readLock.current=false;if(epoch.current===current)setReading(false)}
  }
  function review(){
    if(locked||!candidate||!canReview||!statement.trim()||!consentReviewed)return
    if(window.confirm('确认对当前候选及实际同意范围提交独立审核决定？审核不等于发布，也不自动改变旧结果。'))
      state.start({operation:'REVIEW',body:{requestId:crypto.randomUUID(),candidateId:candidate.candidateId,candidateHash:candidate.candidateHash,
        grantId:readGrant,decision,statement:statement.trim(),consentReviewed:true}})
  }
  function publish(){
    if(locked||!candidate||!uuid.test(reviewId)||!localKey.trim()||!version.trim()||!grants.some(grant=>grant.grantId===publishGrant
      &&grant.capabilities.includes('reference.publish')&&grant.measurementReleaseIds.includes(candidate.measurement.releaseId)))return
    if(window.confirm('确认使用精确审核 ID 发布此正式参考版本？仅发布聚合证据，原投放候选集合与旧报告不会自动更新。'))
      state.start({operation:'PUBLISH',body:{candidateId:candidate.candidateId,candidateHash:candidate.candidateHash,grantId:publishGrant,
        reviewId,localKey:localKey.trim(),version:version.trim()}})
  }
  if(!grants.length&&!state.pending&&!state.result)return grantError?<p role="status">{grantError}<button type="button" onClick={()=>setRefresh(value=>value+1)}>刷新正式治理能力</button></p>:null
  return <section aria-label="正式参考独立审核与发布" className="training-analysis-quality"><h3>正式参考独立审核与发布</h3>
    <p>只显示当前账号实际获授的精确平台能力。计算者不能自审；管理身份、教师身份或来源分析权都不能替代科学审核能力。</p>
    <fieldset disabled={locked}><legend>读取精确聚合候选</legend>
      <label>正式候选 UUID<input value={candidateId} onChange={event=>{setCandidateId(event.target.value);setCandidate(null);setReviewId('')}}/></label>
      <label>读取能力授权<select value={readGrant} onChange={event=>{setReadGrant(event.target.value);setCandidate(null);setReviewId('')}}>
        <option value="">选择实际获授能力</option>{grants.map(grant=><option key={grant.grantId} value={grant.grantId}>{grant.grantId} · {grant.capabilities.join(' / ')}</option>)}</select></label>
      <button type="button" disabled={!uuid.test(candidateId)||!chosen} onClick={()=>void read()}>读取正式聚合证据</button>
    </fieldset>
    {candidate&&<><FormalReferenceSummary candidate={candidate}/>
      {candidate.analyzerId===actorId&&<p>你是该候选计算者，必须交由另一位获授审核能力的人员复核。</p>}
      {canReview&&<fieldset disabled={locked}><legend>独立科学审核</legend>
        <label>正式审核决定<select value={decision} onChange={event=>setDecision(event.target.value as typeof decision)}><option value="APPROVED">批准</option><option value="REJECTED">拒绝</option></select></label>
        <label>正式审核依据<textarea maxLength={4000} value={statement} onChange={event=>setStatement(event.target.value)}/></label>
        <label><input type="checkbox" checked={consentReviewed} onChange={event=>setConsentReviewed(event.target.checked)}/>已核对实际同意范围、适用人群和统计依据，未将提交说明当作新增同意</label>
        <button type="button" disabled={!statement.trim()||!consentReviewed} onClick={review}>保存正式审核决定</button>
      </fieldset>}
      {grants.some(grant=>grant.capabilities.includes('reference.publish'))&&<fieldset disabled={locked}><legend>精确审核后发布</legend>
        <label>正式发布授权<select value={publishGrant} onChange={event=>setPublishGrant(event.target.value)}><option value="">选择发布能力</option>
          {grants.filter(grant=>grant.capabilities.includes('reference.publish')&&grant.measurementReleaseIds.includes(candidate.measurement.releaseId))
            .map(grant=><option key={grant.grantId} value={grant.grantId}>{grant.grantId}</option>)}</select></label>
        <label>正式审核 UUID<input value={reviewId} onChange={event=>setReviewId(event.target.value)}/></label>
        <label>正式发布 key<input maxLength={165} value={localKey} onChange={event=>setLocalKey(event.target.value)}/></label>
        <label>正式发布版本<input maxLength={240} value={version} onChange={event=>setVersion(event.target.value)}/></label>
        <button type="button" disabled={!publishGrant||!uuid.test(reviewId)||!localKey.trim()||!version.trim()} onClick={publish}>发布精确正式参考</button>
      </fieldset>}
    </>}
    <PendingStatus state={state}/>
    {state.result&&'reviewId' in state.result&&<p role="status">审核已保存：{state.result.reviewId} · {state.result.decision}</p>}
    {state.result&&'releaseId' in state.result&&<p role="status">正式发布已确认：{state.result.releaseId} · 版本 {state.result.version} · {state.result.status}</p>}
  </section>
}
