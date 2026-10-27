import {useEffect,useRef,useState} from 'react'
import {educationAssessmentResourceClient,type EducationAssessmentDisclosure,type EducationAssessmentFamily,type EducationAssessmentPreparation,type EducationAssessmentRegistration} from './assessmentResourceClient'
import type {PrivateToolApi} from './privateToolClient'
type Client=ReturnType<typeof educationAssessmentResourceClient>
type Sources=Awaited<ReturnType<Client['sources']>>['list']
type Choices=Awaited<ReturnType<Client['choices']>>
type Rows=Awaited<ReturnType<Client['list']>>['list']
type Props={api:PrivateToolApi;organizationId:string;actorId:string;product:'SCHOOL'|'TEACHER'}
export function EducationAssessmentRegistrationPanel(props:Props){return <Panel key={JSON.stringify([props.product,props.organizationId,props.actorId])} {...props}/>}
function Panel({api,organizationId,actorId,product}:Props){
 const client=educationAssessmentResourceClient(api,organizationId)
 const [open,setOpen]=useState(false),[authorized,setAuthorized]=useState(false),[busy,setBusy]=useState(false)
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[rows,setRows]=useState<Rows>([]),[cursor,setCursor]=useState<string|null>(null)
 const [sources,setSources]=useState<Sources>([]),[sourceId,setSourceId]=useState(''),[title,setTitle]=useState(''),[family,setFamily]=useState<EducationAssessmentFamily>('BUNDLE')
 const [licenseIds,setLicenseIds]=useState<string[]>([])
 const [resourceId,setResourceId]=useState(''),[preparation,setPreparation]=useState<EducationAssessmentPreparation|null>(null),[choices,setChoices]=useState<Choices|null>(null)
 const [selectedP,setP]=useState<Record<string,string[]>>({}),[selectedR,setR]=useState<Record<string,string>>({})
 const [policyKey,setPolicyKey]=useState(''),[disclosure,setDisclosure]=useState<'COMPLETION_ONLY'|'INDIVIDUAL_SUMMARY'>('COMPLETION_ONLY')
 const [feedback,setFeedback]=useState<''|'IMMEDIATE'|'SCHEDULED'>(''),[releaseAt,setReleaseAt]=useState('')
 const [registration,setRegistration]=useState<EducationAssessmentRegistration|null>(null),[reason,setReason]=useState(''),[uncertain,setUncertain]=useState(false)
 const epoch=useRef(0),alive=useRef(true),locked=useRef(false),writing=useRef(false),context=useRef(api);context.current=api
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++}},[])
 useEffect(()=>{epoch.current++;locked.current=false;setBusy(false);setAuthorized(false);setOpen(false);setPreparation(null);setRegistration(null);setSources([]);setRows([]);setChoices(null);setUncertain(writing.current);writing.current=false},[api])
 const perform=async(work:(valid:()=>boolean)=>Promise<void>,write=false)=>{
  if(locked.current)return
  locked.current=true;writing.current=write;setBusy(true);setError('');setNotice('')
  const token=++epoch.current,transport=api,valid=()=>alive.current&&token===epoch.current&&context.current===transport
  try{await work(valid)}catch(cause){if(valid()){
   setError(cause instanceof Error?cause.message:'操作未完成');if([401,403].includes((cause as {status?:number}).status??0))setAuthorized(false)
   if(write){setUncertain(true);setNotice('写入结果尚未确认，请用原登记编号回读核对，不要重复提交。')}
  }}finally{if(valid()){locked.current=false;writing.current=false;setBusy(false)}}
 }
 const load=()=>void perform(async valid=>{
  const result=await client.list();if(!valid())return
  // This actual read requires the same current product-admin/psychology issuer
  // service as writes. Private authoring flags never grant registration access.
  setAuthorized(true);setRows(result.list);setCursor(result.nextCursor);setOpen(true)
 })
 const recover=()=>void perform(async valid=>{
  if(!resourceId)return
  try{const result=await client.read(resourceId);if(valid()){setRegistration(result);setPreparation(null);setChoices(null);setUncertain(false)}}
  catch(cause){
   if((cause as {status?:number}).status!==404)throw cause
   const result=await client.preparation(resourceId),options=await client.choices(resourceId),available=await client.sources()
   if(valid()){setPreparation(result);setChoices(options);setSources(available.list);setSourceId(result.sourceCompositeId);setLicenseIds(available.list.find(row=>row.sourceCompositeId===result.sourceCompositeId)?.grantedResourceIds??[]);setRegistration(null);setUncertain(false);setP({});setR({});setNotice('已回读准备状态；请核对原编号和精确版本后继续。')}
  }
 })
 const prepare=()=>void perform(async valid=>{
  const source=sources.find(row=>row.sourceCompositeId===sourceId);if(!source)return
  const id=resourceId||crypto.randomUUID();setResourceId(id)
  const result=await client.prepare({resourceId:id,sourceCompositeId:source.sourceCompositeId,title:title.trim(),family,
   licenses:licenseIds.map(resourceId=>({resourceId,grantId:source.grantId}))})
  if(!valid())return
  setPreparation(result)
  const options=await client.choices(id);if(valid()){setChoices(options);setP({});setR({})}
 },true)
 const register=()=>void perform(async valid=>{
  if(!preparation||!choices||!feedback||!policyKey.trim())return
  const licenses=new Map<string,string>()
  const source=sources.find(row=>row.sourceCompositeId===preparation.sourceCompositeId)
  if(!source)throw Error('请重新读取获授权来源，以核对原分发授权。')
  for(const id of licenseIds)licenses.set(id,source.grantId)
  const references={schemaVersion:1 as const,units:choices.units.map(unit=>({itemId:unit.itemId,choices:(selectedP[unit.itemId]??[]).map((key,priority)=>{
   const [releaseId,entryKey]=JSON.parse(key) as [string,string];const ref=unit.references.find(row=>row.releaseId===releaseId)!
   licenses.set(releaseId,ref.grantId);return {releaseId,entryKey,priority}
  })}))}
  const reports=choices.units.flatMap(unit=>{
   const report=unit.reports.find(row=>row.releaseId===selectedR[unit.itemId]);if(!report)return []
   licenses.set(report.releaseId,report.grantId);return [{itemId:unit.itemId,releaseId:report.releaseId}]
  })
  const audiences=Object.fromEntries(['RESPONDENT','SUBJECT','TEACHER','PARENT','PROFESSIONAL','ORGANIZATION','RESEARCH'].map(audience=>[audience,{
   mode:audience==='RESPONDENT'?disclosure:'NONE',metricKeys:audience==='RESPONDENT'&&disclosure==='INDIVIDUAL_SUMMARY'?[...new Set(choices.units.flatMap(unit=>unit.reports.find(row=>row.releaseId===selectedR[unit.itemId])?.metricKeys??[]))]:[],longitudinalMetricKeys:[],
  }])) as EducationAssessmentDisclosure['audiences']
  if(disclosure==='INDIVIDUAL_SUMMARY'&&!reports.length)throw Error('本人摘要需要明确选择已批准报告版本。')
  let feedbackPolicy:{schemaVersion:1;mode:'IMMEDIATE'}|{schemaVersion:1;mode:'SCHEDULED';releaseAt:string}
  if(feedback==='SCHEDULED'){
   const date=new Date(releaseAt+'Z');if(!releaseAt||!Number.isFinite(date.getTime())||date.getTime()<=Date.now())throw Error('请选择未来的 UTC 开放时间。')
   feedbackPolicy={schemaVersion:1,mode:'SCHEDULED',releaseAt:date.toISOString()}
  }else feedbackPolicy={schemaVersion:1,mode:'IMMEDIATE'}
  const result=await client.register(preparation.resourceId,{expectedPreparationHash:preparation.preparationHash,
   disclosure:{schemaVersion:1,policyKey:policyKey.trim(),minimumRespondents:null,audiences},feedbackPolicy,references,reports,licenses:[...licenses].map(([resourceId,grantId])=>({resourceId,grantId}))})
  if(!valid())return
  setRegistration(result);setPreparation(null);setChoices(null)
  const frozen=await client.read(result.resourceId);if(valid())setRegistration(frozen)
 },true)
 const transition=(action:'review'|'publish'|'retire')=>void perform(async valid=>{
  if(!registration||!reason.trim())return
  await client.transition(registration.resourceId,action,{expectedEntryHash:registration.entryHash,reason:reason.trim()})
  if(!valid())return
  const frozen=await client.read(registration.resourceId);if(valid()){setRegistration(frozen);setReason('')}
 },true)
 const close=()=>{if(writing.current)return;epoch.current++;locked.current=false;setBusy(false);setOpen(false);setAuthorized(false);setPreparation(null);setChoices(null);setRegistration(null);setRows([]);setSources([])}
 return <section className={product==='SCHOOL'?'hs-panel':'ht-panel'} aria-label="共享测评资源登记">
  <h2>测评资源登记与审核</h2><p>复用已获本校及当前入口分发授权的工具。准备、独立审核、发布与报告开放分别校验；不自动批准题本。</p>
  <button disabled={busy} onClick={load}>读取登记权限与资源</button>{open&&<button disabled={busy} onClick={close}>关闭登记管理</button>}
  {busy&&!writing.current&&<button onClick={close}>取消读取登记</button>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{busy&&<p role="status">正在处理，请保留原登记编号…</p>}
  {open&&authorized&&<fieldset disabled={busy}>
   <legend>当前学校的授权登记管理</legend>
   <label>登记编号<input value={resourceId} onChange={e=>{setResourceId(e.target.value);setPreparation(null);setChoices(null);setRegistration(null)}}/></label>
   <button disabled={!resourceId} onClick={recover}>回读准备或冻结登记</button>
   {uncertain&&<p>先按原编号回读核对；不会自动重复提交。</p>}
   <button disabled={uncertain} onClick={()=>void perform(async valid=>{const data=await client.sources();if(valid())setSources(data.list)})}>读取获授权来源</button>
   <label>获授权来源<select disabled={!!preparation||!!registration||uncertain} value={sourceId} onChange={e=>{setSourceId(e.target.value);setLicenseIds(sources.find(row=>row.sourceCompositeId===e.target.value)?.grantedResourceIds??[])}}><option value="">请选择</option>{sources.map(row=><option key={row.sourceCompositeId} value={row.sourceCompositeId}>{row.title} · {row.sourceCompositeId}</option>)}</select></label>
   {sourceId&&<fieldset disabled={!!registration||uncertain}><legend>本版本使用的来源、内容及素材授权</legend><p>只选本来源准备所需的授权集合；额外或缺失项均由服务器拒绝。</p>{(sources.find(row=>row.sourceCompositeId===sourceId)?.grantedResourceIds??[]).map(id=><label key={id}><input type="checkbox" checked={licenseIds.includes(id)} onChange={e=>setLicenseIds(old=>e.target.checked?[...old,id]:old.filter(value=>value!==id))}/>{id}</label>)}</fieldset>}
   <label>登记标题<input disabled={!!preparation||!!registration||uncertain} value={title} onChange={e=>setTitle(e.target.value)} maxLength={200}/></label>
   <label>工具家族<select disabled={!!preparation||!!registration||uncertain} value={family} onChange={e=>setFamily(e.target.value as EducationAssessmentFamily)}><option value="BUNDLE">组合（含纯表单）</option><option value="COGNITIVE">认知</option><option value="SITUATIONAL">情境</option></select></label>
   <button disabled={!sourceId||!title.trim()||!!preparation||!!registration||uncertain} onClick={prepare}>准备独立教育版本</button>
   {preparation&&choices&&!registration&&<>
    <p>准备 hash：{preparation.preparationHash}；尚未登记或发布。</p>
    {choices.units.map(unit=><section key={unit.itemId}><h3>{unit.family} · {unit.itemId}</h3><p>固定内容 C：{unit.measurement.releaseId} · {unit.measurement.contentHash}</p>
     <fieldset><legend>精确参考 P（不选表示明确空）</legend>{unit.references.flatMap(ref=>ref.choices.map(choice=>{const key=JSON.stringify([ref.releaseId,choice.entryKey]);return <label key={key}><input type="checkbox" checked={(selectedP[unit.itemId]??[]).includes(key)} onChange={e=>setP(old=>({...old,[unit.itemId]:e.target.checked?[...(old[unit.itemId]??[]),key]:(old[unit.itemId]??[]).filter(value=>value!==key)}))}/>{ref.releaseId} · {ref.contentHash} · {choice.entryKey} · {choice.metricKey}</label>}))}</fieldset>
     <label>精确报告 R<select value={selectedR[unit.itemId]??''} onChange={e=>setR(old=>({...old,[unit.itemId]:e.target.value}))}><option value="">明确未选报告</option>{unit.reports.map(row=><option key={row.releaseId} value={row.releaseId}>{row.title??row.releaseId} · {row.releaseId} · {row.contentHash}</option>)}</select></label>
    </section>)}
    <label>披露政策编号<input value={policyKey} onChange={e=>setPolicyKey(e.target.value)}/></label>
    <label>本人披露<select value={disclosure} onChange={e=>setDisclosure(e.target.value as typeof disclosure)}><option value="COMPLETION_ONLY">仅完成确认</option>{choices.units.length>0&&<option value="INDIVIDUAL_SUMMARY">已批准报告的本人摘要</option>}</select></label>
    <label>反馈开放方式<select value={feedback} onChange={e=>setFeedback(e.target.value as typeof feedback)}><option value="">请明确选择</option><option value="IMMEDIATE">完成后按权限开放</option><option value="SCHEDULED">按冻结 UTC 时间开放</option></select></label>
    {feedback==='SCHEDULED'&&<label>开放时间（UTC）<input type="datetime-local" value={releaseAt} onChange={e=>setReleaseAt(e.target.value)}/></label>}
    <button disabled={uncertain||!feedback||!policyKey.trim()} onClick={register}>冻结登记为草稿</button>
   </>}
   {registration&&<section aria-label="冻结登记详情"><p>状态：{registration.status} · hash：{registration.entryHash}</p><pre>{JSON.stringify(registration.entry??registration,null,2)}</pre>
    <p>冻结后只能回读或登记新版本，不能原地修改开放时间、内容或政策。</p>
    <label>审核或状态变更理由<input value={reason} onChange={e=>setReason(e.target.value)}/></label>
    {registration.entry!==undefined&&registration.status==='DRAFT'&&typeof registration.createdBy==='string'&&registration.createdBy!==actorId&&<button disabled={uncertain||!reason.trim()} onClick={()=>transition('review')}>独立审核</button>}
    {registration.entry!==undefined&&registration.status==='REVIEWED'&&<button disabled={uncertain||!reason.trim()} onClick={()=>transition('publish')}>发布已审核版本</button>}
    {registration.entry!==undefined&&registration.status==='PUBLISHED'&&<button disabled={uncertain||!reason.trim()} onClick={()=>transition('retire')}>停用后续新使用</button>}
   </section>}
   <button disabled={uncertain} onClick={()=>{setResourceId('');setPreparation(null);setChoices(null);setRegistration(null);setP({});setR({});setFeedback('');setReleaseAt('');setPolicyKey('');setDisclosure('COMPLETION_ONLY')}}>新建另一登记版本</button>
   <h3>已登记资源</h3>{rows.length===0&&<p>当前范围尚无登记资源。</p>}{rows.map(row=><button key={row.resourceId} onClick={()=>void perform(async valid=>{const value=await client.read(row.resourceId);if(valid()){setResourceId(row.resourceId);setRegistration(value);setPreparation(null);setChoices(null)}})}>{row.title} · {row.status}</button>)}
   {cursor&&<button onClick={()=>void perform(async valid=>{const page=await client.list(cursor);if(valid()){setRows(old=>[...new Map([...old,...page.list].map(row=>[row.resourceId,row])).values()]);setCursor(page.nextCursor)}})}>继续加载登记</button>}
  </fieldset>}
 </section>
}
