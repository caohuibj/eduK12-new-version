import type {EducationPackageRef} from './packageReferenceClient'
import LocalDateTimeInput,{parseLocalDateTime} from '../LocalDateTimeInput'
import {formatLocalTimestamp,localTimeZoneLabel} from '../../utils/dateTime'
import {useEffect,useRef,useState} from 'react'
import {educationAssessmentResourceClient,mergeEducationAssessmentLicenses,appendEducationAssessmentChoices,type EducationAssessmentDisclosure,type EducationAssessmentFamily,type EducationAssessmentPreparation,type EducationAssessmentRegistration} from './assessmentResourceClient'
import type {PrivateToolApi,PrivateDraftState} from './privateToolClient'
type Client=ReturnType<typeof educationAssessmentResourceClient>
type Sources=Awaited<ReturnType<Client['sources']>>['list']
type Choices=Awaited<ReturnType<Client['choices']>>
type Rows=Awaited<ReturnType<Client['list']>>['list']
type Props={api:PrivateToolApi;organizationId:string;actorId:string;product:'SCHOOL'|'TEACHER';publicPackage?:EducationPackageRef;onDraftStateChange?:(state:PrivateDraftState)=>void}
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
const text=(value:unknown,fallback='未返回')=>typeof value==='string'&&value?value:fallback
const unavailableText=(reason:unknown)=>reason==='ORIGINAL_CONTENT_SCOPE_UNSUPPORTED'?'原包私有参考或报告仅适用于原来源，不能用于新的本校版本':reason==='MISSING_DISTRIBUTION_AUTHORITY'?'缺少必要分发许可':reason==='SOURCE_NOT_AVAILABLE'?'来源当前不可用':reason==='CONTENT_NOT_AVAILABLE'?'内容当前不可用':'等待许可确认'
const familyNames:Record<string,string>={BUNDLE:'组合测评',COGNITIVE:'认知测评',SITUATIONAL:'情境测评',SCALE:'量表',SJT:'情境测评'}
const disclosureNames:Record<string,string>={NONE:'不展示反馈',COMPLETION_ONLY:'仅完成确认',INDIVIDUAL_SUMMARY:'已批准报告的本人摘要'}
function FrozenRegistrationSummary({registration}:{registration:EducationAssessmentRegistration}){
 const entry=object(registration.entry),origin=object(entry.educationOrigin),applicability=object(entry.applicability)
 const policy=object(origin.feedbackPolicy),audience=object(object(object(entry.resultDisclosure).audiences).RESPONDENT)
 const units=Array.isArray(origin.units)?origin.units:[]
 const scheduled=typeof policy.releaseAt==='string'&&Number.isFinite(Date.parse(policy.releaseAt))?formatLocalTimestamp(policy.releaseAt):null
 return <div aria-label="冻结版本摘要">
  <h3>{text(entry.title,'等待完整冻结详情')}</h3>
  <dl><dt>工具家族</dt><dd>{familyNames[text(origin.family,text(applicability.resourceKind))]??'未返回'}</dd>
   <dt>精确版本</dt><dd>{text(applicability.resourceVersion,registration.version??'未返回')}</dd>
   <dt>审核状态</dt><dd>{{DRAFT:'草稿，等待独立审核',REVIEWED:'已独立审核，尚未发布',PUBLISHED:'已发布',RETIRED:'已停用新使用'}[registration.status]}</dd>
   <dt>创建者账号</dt><dd>{text(registration.createdBy)}</dd><dt>审核者账号</dt><dd>{text(registration.reviewedBy,'尚未独立审核')}</dd>
   <dt>本人披露</dt><dd>{disclosureNames[text(audience.mode)]??'未返回'}</dd>
   <dt>反馈开放方式</dt><dd>{policy.mode==='IMMEDIATE'?'完成后按权限开放':policy.mode==='SCHEDULED'?'按冻结时间开放':'未配置（保留原历史政策）'}</dd>
   {policy.mode==='SCHEDULED'&&<><dt>开放时间（本地时区）</dt><dd>{scheduled??'时间信息无效，请联系管理员核查'}</dd></>}
  </dl>
  {units.length===0?<p>未列测量 C/P/R 单元；纯表单组合仅使用已冻结表单流程。</p>:<ol>{units.map((raw,index)=>{
   const unit=object(raw),measurement=object(unit.measurement),report=object(unit.report),references=Array.isArray(unit.references)?unit.references:[]
   return <li key={text(unit.itemId,String(index))}>{familyNames[text(unit.family)]??'测量单元'} {index+1}<dl>
    <dt>固定内容 C</dt><dd>{text(measurement.releaseId)} · {text(measurement.contentHash)}</dd>
    <dt>选择的参考 P</dt><dd>{references.length?references.map(ref=>text(object(ref).releaseId)+' · '+text(object(ref).contentHash)).join('；'):'明确未选参考'}</dd>
    <dt>选择的报告 R</dt><dd>{typeof report.releaseId==='string'?report.releaseId+' · '+text(report.contentHash):'明确未选报告'}</dd>
   </dl></li>
  })}</ol>}
 </div>
}
export function EducationAssessmentRegistrationPanel(props:Props){return <Panel key={JSON.stringify([props.product,props.organizationId,props.actorId,props.publicPackage])} {...props}/>}
function Panel({api,organizationId,actorId,product,publicPackage,onDraftStateChange}:Props){
 const client=educationAssessmentResourceClient(api,organizationId)
 const [open,setOpen]=useState(false),[authorized,setAuthorized]=useState(false),[busy,setBusy]=useState(false)
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[rows,setRows]=useState<Rows>([]),[cursor,setCursor]=useState<string|null>(null)
 const [sourceCursor,setSourceCursor]=useState<string|null>(null)
 const [sources,setSources]=useState<Sources>([]),[sourceId,setSourceId]=useState(''),[title,setTitle]=useState(''),[family,setFamily]=useState<EducationAssessmentFamily>('BUNDLE')
 const [resourceId,setResourceId]=useState(''),[preparation,setPreparation]=useState<EducationAssessmentPreparation|null>(null),[choices,setChoices]=useState<Choices|null>(null)
 const [selectedP,setP]=useState<Record<string,string[]>>({}),[selectedR,setR]=useState<Record<string,string>>({})
 const policyKey=resourceId?`education-assessment:${resourceId}:disclosure:v1`:''
 const [disclosure,setDisclosure]=useState<'NONE'|'COMPLETION_ONLY'|'INDIVIDUAL_SUMMARY'>('COMPLETION_ONLY')
 const [longitudinalMetricKeys,setLongitudinalMetricKeys]=useState<string[]>([])
 const [feedback,setFeedback]=useState<''|'IMMEDIATE'|'SCHEDULED'>(''),[releaseAt,setReleaseAt]=useState('')
 const [registration,setRegistration]=useState<EducationAssessmentRegistration|null>(null),[reason,setReason]=useState(''),[uncertain,setUncertain]=useState(false)
 const epoch=useRef(0),alive=useRef(true),locked=useRef(false),writing=useRef(false),mutationSent=useRef(false),context=useRef(api);context.current=api
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++}},[])
 useEffect(()=>{epoch.current++;locked.current=false;setBusy(false);setAuthorized(false);setOpen(false);setPreparation(null);setRegistration(null);setSources([]);setSourceCursor(null);setRows([]);setChoices(null);setUncertain(writing.current);writing.current=false},[api])
 const perform=async(work:(valid:()=>boolean)=>Promise<void>,write=false)=>{
  if(locked.current)return
  locked.current=true;mutationSent.current=false;writing.current=write;setBusy(true);setError('');setNotice('')
  const token=++epoch.current,transport=api,valid=()=>alive.current&&token===epoch.current&&context.current===transport
  try{await work(valid)}catch(cause){if(valid()){
   setError(cause instanceof Error?cause.message:'操作未完成');if([401,403].includes((cause as {status?:number}).status??0))setAuthorized(false)
   if(write&&mutationSent.current){setUncertain(true);setNotice('写入结果尚未确认，请用原登记编号回读核对，不要重复提交。')}
  }}finally{if(valid()){locked.current=false;writing.current=false;setBusy(false)}}
 }
 useEffect(()=>{onDraftStateChange?.({dirty:!registration&&(!!preparation||!!title||!!sourceId||family!=='BUNDLE'),writing:busy&&writing.current})},[preparation,registration,title,sourceId,family,busy,onDraftStateChange])
 useEffect(()=>{setLongitudinalMetricKeys([])},[api,resourceId,sourceId])
 const applyFixed=(result:EducationAssessmentPreparation)=>{
  setP(Object.fromEntries(result.fixedSelection?.references.units.map(unit=>[unit.itemId,unit.choices.map(choice=>JSON.stringify([choice.releaseId,choice.entryKey]))])??[]))
  setR(Object.fromEntries(result.fixedSelection?.reports.map(report=>[report.itemId,report.releaseId])??[]))
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
   const result=await client.preparation(resourceId),options=await client.choices(resourceId)
   if(valid()){setPreparation(result);setChoices(options);setSourceId(result.sourceCompositeId);setTitle(result.title);setFamily(result.family);setRegistration(null);setUncertain(false);applyFixed(result);setNotice('已回读准备状态；请核对原编号和精确版本后继续。')}
  }
 })
 const prepare=()=>void perform(async valid=>{
  const source=sources.find(row=>row.sourceCompositeId===sourceId);if(!source?.canPrepare||!source.licenses?.length)return
  const id=resourceId||crypto.randomUUID();setResourceId(id)
  mutationSent.current=true
  const result=await client.prepare({resourceId:id,sourceCompositeId:source.sourceCompositeId,title:title.trim(),family,
   licenses:source.licenses.map(({resourceId,grantId})=>({resourceId,grantId})),...(publicPackage?{publicPackage}:{})})
  if(!valid())return
  setPreparation(result)
  const options=await client.choices(id);if(valid()){setChoices(options);applyFixed(result)}
 },true)
 const register=()=>void perform(async valid=>{
  if(!preparation||!choices||!feedback||!policyKey.trim())return
  const licenseGroups=[preparation.licenses]
  const references={schemaVersion:1 as const,units:choices.units.map(unit=>({itemId:unit.itemId,choices:(selectedP[unit.itemId]??[]).map((key,priority)=>{
   const [releaseId,entryKey]=JSON.parse(key) as [string,string];const ref=unit.references.find(row=>row.releaseId===releaseId)
   if(!ref?.selectable||!ref.choices.some(choice=>choice.entryKey===entryKey))throw Error('所选参考已不可选，请重新读取准备内容。')
   licenseGroups.push(ref.licenses);return {releaseId,entryKey,priority}
  })}))}
  const reports=choices.units.flatMap(unit=>{
   const selected=selectedR[unit.itemId];if(!selected)return []
   const report=unit.reports.find(row=>row.releaseId===selected)
   if(!report?.selectable)throw Error('所选报告已不可选，请重新读取准备内容。')
   licenseGroups.push(report.licenses);return [{itemId:unit.itemId,releaseId:report.releaseId}]
  })
  const audiences=Object.fromEntries(['RESPONDENT','SUBJECT','TEACHER','PARENT','PROFESSIONAL','ORGANIZATION','RESEARCH'].map(audience=>[audience,{
   mode:audience==='RESPONDENT'?disclosure:'NONE',metricKeys:audience==='RESPONDENT'&&disclosure==='INDIVIDUAL_SUMMARY'?[...new Set(choices.units.flatMap(unit=>unit.reports.find(row=>row.releaseId===selectedR[unit.itemId])?.metricKeys??[]))]:[],longitudinalMetricKeys:audience==='RESPONDENT'&&disclosure==='INDIVIDUAL_SUMMARY'?longitudinalMetricKeys.filter(key=>choices.units.some(unit=>unit.reports.find(row=>row.releaseId===selectedR[unit.itemId])?.metricKeys.includes(key))):[],
  }])) as EducationAssessmentDisclosure['audiences']
  if(disclosure==='INDIVIDUAL_SUMMARY'&&!reports.length)throw Error('本人摘要需要明确选择已批准报告版本。')
  let feedbackPolicy:{schemaVersion:1;mode:'IMMEDIATE'}|{schemaVersion:1;mode:'SCHEDULED';releaseAt:string}
  if(feedback==='SCHEDULED'){
   const date=parseLocalDateTime(releaseAt);if(!date||date.getTime()<=Date.now())throw Error('请选择有效的未来本地开放时间。')
   feedbackPolicy={schemaVersion:1,mode:'SCHEDULED',releaseAt:date.toISOString()}
  }else feedbackPolicy={schemaVersion:1,mode:'IMMEDIATE'}
  const licenses=mergeEducationAssessmentLicenses(...licenseGroups)
  mutationSent.current=true
  const result=await client.register(preparation.resourceId,{expectedPreparationHash:preparation.preparationHash,
   disclosure:{schemaVersion:1,policyKey:policyKey.trim(),minimumRespondents:null,audiences},feedbackPolicy,references:preparation.fixedSelection?.references??references,reports,licenses})
  if(!valid())return
  setRegistration(result);setPreparation(null);setChoices(null)
  const frozen=await client.read(result.resourceId);if(valid())setRegistration(frozen)
 },true)
 const transition=(action:'review'|'publish'|'retire')=>void perform(async valid=>{
  if(!registration||!reason.trim())return
  mutationSent.current=true
  await client.transition(registration.resourceId,action,{expectedEntryHash:registration.entryHash,reason:reason.trim()})
  if(!valid())return
  const frozen=await client.read(registration.resourceId);if(valid()){setRegistration(frozen);setReason('')}
 },true)
 const close=()=>{if(writing.current)return;epoch.current++;locked.current=false;setBusy(false);setOpen(false);setAuthorized(false);setPreparation(null);setChoices(null);setRegistration(null);setRows([]);setSources([]);setSourceCursor(null)}
 return <section className={product==='SCHOOL'?'hs-panel':'ht-panel'} aria-label="共享测评资源登记">
  <h2>测评资源登记与审核</h2><p>复用已获本校及当前入口分发授权的工具。准备、独立审核、发布与报告开放分别校验；不自动批准题本。</p>
  <button disabled={busy} onClick={load}>读取登记权限与资源</button>{open&&<button disabled={busy} onClick={close}>关闭登记管理</button>}
  {busy&&!writing.current&&<button onClick={close}>取消读取登记</button>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{busy&&<p role="status">正在处理，请保留原登记编号…</p>}
  {open&&authorized&&<fieldset disabled={busy}>
   <legend>当前学校的授权登记管理</legend>
   <label>登记编号<input value={resourceId} onChange={e=>{setResourceId(e.target.value);setPreparation(null);setChoices(null);setRegistration(null)}}/></label>
   <button disabled={!resourceId} onClick={recover}>回读准备或冻结登记</button>
   {uncertain&&<p>先按原编号回读核对；不会自动重复提交。</p>}
   <button disabled={uncertain||!!preparation||!!registration} onClick={()=>void perform(async valid=>{const data=await client.sources(undefined,publicPackage);if(valid()){setSources(data.list);setSourceCursor(data.nextCursor??null);setSourceId('');setP({});setR({})}})}>读取获授权来源</button>
   {sourceCursor&&<button disabled={uncertain||!!preparation||!!registration} onClick={()=>void perform(async valid=>{const data=await client.sources(sourceCursor,publicPackage);if(valid()){setSources(old=>{const seen=new Set(old.map(row=>row.sourceCompositeId));return [...old,...data.list.filter(row=>!seen.has(row.sourceCompositeId))]});setSourceCursor(data.nextCursor??null)}})}>继续加载获授权来源</button>}
   <label>获授权来源<select disabled={!!preparation||!!registration||uncertain} value={sourceId} onChange={e=>{setSourceId(e.target.value);setP({});setR({})}}><option value="">请选择</option>{sources.map(row=><option key={row.sourceCompositeId} value={row.sourceCompositeId} disabled={!row.canPrepare||!row.licenses?.length}>{row.title}{row.canPrepare?' · 可准备':' · '+unavailableText(row.unavailableReason)}</option>)}</select></label>
   {sourceId&&!preparation&&<p>{sources.find(row=>row.sourceCompositeId===sourceId)?.canPrepare?'来源与必要许可已核对，准备时仍由服务器重新校验。':'该来源当前不可准备。'}</p>}
   <details><summary>查看精确来源许可标识</summary><pre style={{maxWidth:'100%',overflowX:'auto'}}>{JSON.stringify(preparation?.licenses??sources.find(row=>row.sourceCompositeId===sourceId)?.licenses??[],null,2)}</pre></details>
   <label>登记标题<input disabled={!!preparation||!!registration||uncertain} value={title} onChange={e=>setTitle(e.target.value)} maxLength={200}/></label>
   <label>工具家族<select disabled={!!publicPackage||!!preparation||!!registration||uncertain} value={family} onChange={e=>setFamily(e.target.value as EducationAssessmentFamily)}><option value="BUNDLE">组合（含纯表单）</option><option value="COGNITIVE">认知</option><option value="SITUATIONAL">情境</option></select></label>
   <button disabled={!sources.find(row=>row.sourceCompositeId===sourceId)?.canPrepare||!sources.find(row=>row.sourceCompositeId===sourceId)?.licenses?.length||!title.trim()||!!preparation||!!registration||uncertain} onClick={prepare}>准备独立教育版本</button>
   {preparation&&choices&&!registration&&<>
    {preparation.fixedSelection&&<p>整包的成员、顺序、参数和综合报告保持原版；可补选本入口获授权的单项报告版本及反馈开放时间。</p>}
    <p>准备 hash：{preparation.preparationHash}；尚未登记或发布。固定来源：{preparation.sourceCompositeId}。</p>
    {choices.units.map(unit=><section key={unit.itemId}><h3>{unit.family} · {unit.itemId}</h3><p>固定内容 C：{unit.measurement.releaseId} · {unit.measurement.contentHash}</p>
     <fieldset><legend>{preparation.fixedSelection?'整包原参考 P（固定）':'精确参考 P（不选表示明确空）'}</legend>{unit.references.flatMap(ref=>ref.choices.map(choice=>{const key=JSON.stringify([ref.releaseId,choice.entryKey]);return <label key={key}><input type="checkbox" disabled={!!preparation.fixedSelection||!ref.selectable} checked={(selectedP[unit.itemId]??[]).includes(key)} onChange={e=>setP(old=>({...old,[unit.itemId]:e.target.checked?[...(old[unit.itemId]??[]),key]:(old[unit.itemId]??[]).filter(value=>value!==key)}))}/>{ref.releaseId} · {ref.contentHash} · {choice.entryKey} · {choice.metricKey}</label>}))}{unit.references.filter(ref=>!ref.selectable).map(ref=><p key={ref.releaseId}>参考 {ref.releaseId}：{unavailableText(ref.unavailableReason)}，不可选择。</p>)}</fieldset>
     <label>精确报告 R<select disabled={!!preparation.fixedSelection?.reports.some(report=>report.itemId===unit.itemId)} value={selectedR[unit.itemId]??''} onChange={e=>setR(old=>({...old,[unit.itemId]:e.target.value}))}><option value="">明确未选报告</option>{unit.reports.map(row=><option key={row.releaseId} value={row.releaseId} disabled={!row.selectable}>{row.title??row.releaseId} · {row.releaseId} · {row.contentHash}{row.selectable?'':' · '+unavailableText(row.unavailableReason)}</option>)}</select></label>
    </section>)}
    {choices.nextCursor&&<button onClick={()=>void perform(async valid=>{const next=await client.choices(preparation.resourceId,choices.nextCursor!);if(valid())setChoices(appendEducationAssessmentChoices(choices,next))})}>继续加载参考与报告版本</button>}
    <label>披露政策编号（系统标识）<input readOnly value={policyKey}/></label>
    <label>本人披露<select value={disclosure} onChange={e=>{setDisclosure(e.target.value as typeof disclosure);if(e.target.value!=='INDIVIDUAL_SUMMARY')setLongitudinalMetricKeys([])}}><option value="NONE">不展示反馈</option><option value="COMPLETION_ONLY">仅完成确认</option>{choices.units.length>0&&<option value="INDIVIDUAL_SUMMARY">已批准报告的本人摘要</option>}</select></label>
    {disclosure==='INDIVIDUAL_SUMMARY'&&<fieldset><legend>允许本人纵向查看的原始指标</legend><p>仅选择已获准本人数字反馈的指标子集；新教育版本固定后生效，不改变历史来源或其他受众。</p>{[...new Set(choices.units.flatMap(unit=>unit.reports.find(row=>row.releaseId===selectedR[unit.itemId])?.metricKeys??[]))].map(key=><label key={key}><input type="checkbox" checked={longitudinalMetricKeys.includes(key)} onChange={event=>setLongitudinalMetricKeys(old=>event.target.checked?[...new Set([...old,key])]:old.filter(value=>value!==key))}/>{key}</label>)}</fieldset>}
    <label>反馈开放方式<select value={feedback} onChange={e=>setFeedback(e.target.value as typeof feedback)}><option value="">请明确选择</option><option value="IMMEDIATE">完成后按权限开放</option><option value="SCHEDULED">按冻结时间开放</option></select></label>
    {feedback==='SCHEDULED'&&<label>开放时间（本地时区）<LocalDateTimeInput picker aria-label="开放时间（本地时区）" value={releaseAt} onChange={e=>setReleaseAt(e.target.value)}/><small>{localTimeZoneLabel()}；保存时转换为 UTC，冻结后不可原地修改。</small></label>}
    <button disabled={uncertain||!feedback||!policyKey.trim()} onClick={register}>冻结登记为草稿</button>
   </>}
   {registration&&<section aria-label="冻结登记详情"><FrozenRegistrationSummary registration={registration}/><details><summary>查看冻结技术详情</summary><pre style={{maxWidth:'100%',overflowX:'auto'}}>{JSON.stringify(registration.entry??registration,null,2)}</pre></details>
    <p>冻结后只能回读或登记新版本，不能原地修改开放时间、内容或政策。</p>
    <label>审核或状态变更理由<input value={reason} onChange={e=>setReason(e.target.value)}/></label>
    {registration.entry!==undefined&&registration.status==='DRAFT'&&typeof registration.createdBy==='string'&&registration.createdBy!==actorId&&<button disabled={uncertain||!reason.trim()} onClick={()=>transition('review')}>独立审核</button>}
    {registration.entry!==undefined&&registration.status==='REVIEWED'&&<button disabled={uncertain||!reason.trim()} onClick={()=>transition('publish')}>发布已审核版本</button>}
    {registration.entry!==undefined&&registration.status==='PUBLISHED'&&<button disabled={uncertain||!reason.trim()} onClick={()=>transition('retire')}>停用后续新使用</button>}
   </section>}
   <button disabled={uncertain} onClick={()=>{setResourceId('');setPreparation(null);setChoices(null);setRegistration(null);setP({});setR({});setFeedback('');setReleaseAt('');setDisclosure('COMPLETION_ONLY')}}>新建另一登记版本</button>
   <h3>已登记资源</h3>{rows.length===0&&<p>当前范围尚无登记资源。</p>}{rows.map(row=><button key={row.resourceId} onClick={()=>void perform(async valid=>{const value=await client.read(row.resourceId);if(valid()){setResourceId(row.resourceId);setRegistration(value);setPreparation(null);setChoices(null)}})}>{row.title} · {row.status}</button>)}
   {cursor&&<button onClick={()=>void perform(async valid=>{const page=await client.list(cursor);if(valid()){setRows(old=>[...new Map([...old,...page.list].map(row=>[row.resourceId,row])).values()]);setCursor(page.nextCursor)}})}>继续加载登记</button>}
  </fieldset>}
 </section>
}
