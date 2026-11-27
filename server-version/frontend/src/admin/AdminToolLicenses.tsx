import {useEffect,useRef,useState} from 'react'
import {Link} from "react-router-dom"
import api from '../api/client'
import {ToolCatalogTagsPanel} from '../components/tool-licensing/ToolCatalogTags'
import {products,type Product,type ToolLicenseFocus} from './toolLicenseFocus'
import {BatchConfirmation, isBatchReceipt, matchesBatchPreview, readPendingBatch, type BatchCommit, type BatchIntent, type BatchPreview, type BatchReceipt} from './AdminToolLicenseBatch'
import {licenseAssignmentPath} from './standardAssignmentTarget'
import {LicenseHistory} from './LicenseRecordDetails'
import './tool-licenses.css'

const base='/admin/permissions/tool-licenses'
const catalog='/admin/tool-catalog-tags'
type Subject={id:string;label:string;description?:string}
type Tool={key:string;name:string;family:string;tags?:string[]}
type LicenseTool=Tool&{limit:number|null;used:number}
type License={id:string;product:Product;subjectId:string;nextLicenseId?:string|null;missingTools?:string[];subjectType:string;subjectLabel:string;startsAt:string;expiresAt:string;revision:number;status:'SCHEDULED'|'ACTIVE'|'EXPIRED'|'TERMINATED';reason:string;tools:LicenseTool[]}
type TerminationImpact=Pick<License,'id'|'revision'|'product'|'status'|'subjectLabel'>&{tools:Array<Pick<Tool,'key'|'name'>>;meteredPublications:number;outstandingReservations:number}
type Page<T>={list:T[];hasMore:boolean;enforcedProducts?:Product[];pilotToolFamilies?:Partial<Record<Product,string[]>>}
type SelectedTool=Tool&{limitInput:string;used:number}
type Issue={requestId:string;product:Product;subjectId:string;startsAt:string;expiresAt:string;reason:string;tools:Array<{key:string;limit:number|null}>}
const states={SCHEDULED:'待生效',ACTIVE:'有效',EXPIRED:'已到期',TERMINATED:'已终止'}
const recordStates={...states,EXPIRING:'30 天内到期'}
const families:Record<string,string>={SCALE:'量表',FORM:'表单',COGNITIVE:'认知测评',SJT:'情境测评',COMBINATION:'普通组合',COMPOSITION:'普通组合',BUNDLE:'组合包'}
const message=(error:unknown)=>error instanceof Error?error.message:typeof(error as {message?:unknown})?.message==='string'?(error as {message:string}).message:'操作未完成，请稍后核对。'
const uncertain=(error:unknown)=>{const status=(error as {status?:number})?.status;return status===undefined||status===408||status>=500}
const displayTime=(value:string)=>new Date(value).toLocaleString('zh-CN',{hour12:false})
function localTime(value:Date){
 const pad=(part:number)=>String(part).padStart(2,'0')
 return `${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`
}
function monthsAfter(value:string,months:number){
 const date=new Date(value)
 if(!Number.isFinite(date.getTime()))return ''
 const day=date.getDate();date.setDate(1);date.setMonth(date.getMonth()+months)
 const last=new Date(date.getFullYear(),date.getMonth()+1,0).getDate()
 date.setDate(Math.min(day,last));return localTime(date)
}
function usePage<T>(path:string,query:string,active:boolean){
 const [data,setData]=useState<Page<T>|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[epoch,setEpoch]=useState(0)
 const generation=useRef(0)
 useEffect(()=>{
  const version=++generation.current
  let cancelled=false
  if(!active)return
  setLoading(true);setData(null);setError('')
  void api.get<Page<T>>(path+'?'+query).then(result=>{
   if(cancelled||generation.current!==version)return
   if(!result.data||!Array.isArray(result.data.list))throw new Error('列表读取不完整，请刷新重试。')
   setData(result.data)
  }).catch(reason=>{if(!cancelled&&generation.current===version)setError(message(reason))}).finally(()=>{if(!cancelled&&generation.current===version)setLoading(false)})
  return()=>{cancelled=true}
 },[path,query,active,epoch])
 return {data,loading,error,refresh:()=>setEpoch(old=>old+1)}
}
function restoreIssue(key:string,product:Product):Issue|null{
 const text=sessionStorage.getItem(key)
 if(!text)return null
 const value=JSON.parse(text) as Issue
 if(!value||value.product!==product||typeof value.requestId!=='string'||typeof value.subjectId!=='string'||typeof value.reason!=='string'
  ||!Number.isFinite(Date.parse(value.startsAt))||!Number.isFinite(Date.parse(value.expiresAt))||!Array.isArray(value.tools)||!value.tools.length
  ||value.tools.some(tool=>!tool||typeof tool.key!=='string'||!(tool.limit===null||Number.isSafeInteger(tool.limit)&&tool.limit>0&&tool.limit<=2147483647)))throw new Error('待核对签发记录不完整，请保留本标签页并联系管理员核对。')
 return value
}
function sameIssueIdentity(row:License,pending:Issue){
 return row.id===pending.requestId&&row.product===pending.product&&row.subjectId===pending.subjectId
  &&Date.parse(row.startsAt)===Date.parse(pending.startsAt)&&Date.parse(row.expiresAt)===Date.parse(pending.expiresAt)
}
function sameIssue(row:License,pending:Issue){
 return sameIssueIdentity(row,pending)&&row.reason===pending.reason
  &&row.tools.length===pending.tools.length&&pending.tools.every(tool=>row.tools.some(value=>value.key===tool.key&&value.limit===tool.limit))
}
export default function AdminToolLicenses({actorId,active=true,focus}:{actorId:string;active?:boolean;focus?:ToolLicenseFocus}){
 const [product,setProduct]=useState<Product>(focus?.product??'SCHOOL'),[locked,setLocked]=useState(false),[dirty,setDirty]=useState(false)
 return <div className="tool-licenses">
  <div className="sys-section-heading"><div><h2>工具授权</h2><p>按学校或业务账号管理许可范围、有效期及可选使用额度，保留各入口原有资格和工具版本规则。</p></div></div>
  <label className="system-field">产品入口<select disabled={locked} value={product} onChange={event=>{
   const next=event.target.value as Product
   if(dirty&&!window.confirm('切换入口将清除当前未提交的选择，确认切换？'))return
   setDirty(false);setProduct(next)
  }}>{Object.entries(products).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <ProductLicenses key={actorId+':'+product} actorId={actorId} product={product} active={active} initialToolKey={focus?.toolKey}
    initialSubjectId={focus?.product===product?focus.subjectId:undefined} onLocked={setLocked} onDirty={setDirty}/>
 </div>
}
function ProductLicenses({actorId,product,active,initialToolKey,initialSubjectId,onLocked,onDirty}:{actorId:string;product:Product;active:boolean;initialToolKey?:string;initialSubjectId?:string;onLocked:(value:boolean)=>void;onDirty:(value:boolean)=>void}){
 const storageKey='admin-tool-license-issue:'+actorId+':'+product
 const batchStorageKey='admin-tool-license-batch:'+actorId+':'+product
 const [batchSubjects,setBatchSubjects]=useState<Subject[]>([])
 const [batchMode,setBatchMode]=useState(false)
 const [batchPreview,setBatchPreview]=useState<{input:BatchIntent;result:BatchPreview}|null>(null)
 const [batchReceipt,setBatchReceipt]=useState<BatchReceipt|null>(null)
 const [restoredBatch]=useState(()=>{
  try{return {input:readPendingBatch(batchStorageKey,product),error:''}}
  catch(cause){return {input:null,error:message(cause)}}
 })
 const [pendingBatch,setPendingBatch]=useState<BatchCommit|null>(restoredBatch.input)
 const [showTags,setShowTags]=useState(false),[toolTag,setToolTag]=useState('')
 const [tagOptions,setTagOptions]=useState<string[]>([]),[tagError,setTagError]=useState(''),[tagRevision,setTagRevision]=useState(0)
 const restored=useRef<{issue:Issue|null;error:string}|null>(null)
 if(!restored.current){try{restored.current={issue:restoreIssue(storageKey,product),error:''}}catch(reason){restored.current={issue:null,error:message(reason)}}}
 const [pending,setPending]=useState<Issue|null>(restored.current.issue),[storageError,setStorageError]=useState(restored.current.error)
 const [subject,setSubject]=useState<Subject|null>(null),[subjectInput,setSubjectInput]=useState(''),[subjectQuery,setSubjectQuery]=useState(''),[subjectPage,setSubjectPage]=useState(1)
 const [toolInput,setToolInput]=useState(''),[toolQuery,setToolQuery]=useState(''),[toolPage,setToolPage]=useState(1),[selected,setSelected]=useState<SelectedTool[]>([])
 const [focusedKey,setFocusedKey]=useState(initialToolKey)
 const [startsAt,setStartsAt]=useState(localTime(new Date())),[expiresAt,setExpiresAt]=useState(''),[reason,setReason]=useState('')
 const [editing,setEditing]=useState<License|null>(null),[renewing,setRenewing]=useState<License|null>(null)
 const [listSubject,setListSubject]=useState(initialSubjectId??''),[listPage,setListPage]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [listStatus,setListStatus]=useState(''),[listFamily,setListFamily]=useState('')
 const [unknownChange,setUnknownChange]=useState<{id:string;kind:'调整'|'终止'}|null>(null),[receipt,setReceipt]=useState<License|null>(null)
 const inFlight=useRef(false),alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const subjects=usePage<Subject>(base+'/subjects',new URLSearchParams({product,q:subjectQuery,page:String(subjectPage)}).toString(),active)
 const schoolDetails=usePage<Subject>(base+'/subjects/'+encodeURIComponent(initialSubjectId??''),new URLSearchParams({product}).toString(),
  active&&Boolean(initialSubjectId)&&['SCHOOL','TEACHER'].includes(product))
 const tools=usePage<Tool>(toolTag?catalog:base+'/tools',new URLSearchParams({
  product,q:toolQuery,page:String(toolPage),...(focusedKey?{key:focusedKey}:{}),...(toolTag?{tag:toolTag}:{}),
 }).toString(),active)
 useEffect(()=>{
  if(!active||!showTags)return
  let cancelled=false
  void api.get<{availableTags:string[]}>(catalog+'/labels?'+new URLSearchParams({product})).then(result=>{
   if(!Array.isArray(result.data?.availableTags))throw new Error('标签列表读取不完整。')
   if(!cancelled){
    const labels=result.data.availableTags
    setTagOptions(labels);setTagError('');setToolTag(old=>labels.includes(old)?old:'')
   }
  }).catch(cause=>{if(!cancelled)setTagError(message(cause))})
  return()=>{cancelled=true}
 },[active,product,showTags,tagRevision])
 const licenses=usePage<License>(base,new URLSearchParams({product,page:String(listPage),...(listSubject?{subjectId:listSubject}:{}),
  ...(focusedKey?{toolKey:focusedKey}:{}),...(listStatus?{status:listStatus}:{}),...(listFamily?{family:listFamily}:{})}).toString(),active)
 const locked=busy||Boolean(pending||pendingBatch||batchPreview||unknownChange||storageError||restoredBatch.error)
 const objectLabel=product==='SCHOOL'||product==='TEACHER'?'学校':product==='TRAINING'?'培训师账号':'研究者账号'
 useEffect(()=>{onLocked(locked);return()=>onLocked(false)},[locked,onLocked])
 useEffect(()=>{onDirty(Boolean(subject||batchSubjects.length||selected.length||reason||editing||renewing||pending||pendingBatch));return()=>onDirty(false)},[subject,batchSubjects,selected,reason,editing,renewing,pending,pendingBatch,onDirty])
 const clearForm=()=>{
  setSubject(null);setBatchSubjects([]);setBatchPreview(null);setSelected([]);setReason('')
  setStartsAt(localTime(new Date()));setExpiresAt('');setEditing(null);setRenewing(null)
 }
 const changeBatchMode=()=>{
  if(batchMode&&batchSubjects.length>1&&!window.confirm('切换为单笔授权将保留第一个已选对象，确认切换？'))return
  if(batchMode){
   const first=batchSubjects[0]??null
   setSubject(first);setBatchSubjects([]);setListSubject(first?.id??'')
  }else{
   setBatchSubjects(subject?[subject]:[]);setSubject(null);setListSubject('')
  }
  setListPage(1);setBatchMode(!batchMode);setError('');setNotice('')
 }
 const finishIssue=(row:License,notice=row.status==='TERMINATED'?'已读取本次请求的许可；当前状态为已终止。':'工具许可已保存，请核对下方回执及运行接入状态。')=>{
  sessionStorage.removeItem(storageKey);setPending(null);setReceipt(row);setNotice(notice);setError('');clearForm();licenses.refresh()
 }
 const mutate=async(work:()=>Promise<void>)=>{
  if(inFlight.current)return
  inFlight.current=true;setBusy(true);setError('');setNotice('')
  try{await work()}catch(reason){if(alive.current)setError(message(reason))}finally{inFlight.current=false;if(alive.current)setBusy(false)}
 }
 const readRow=async(id:string)=>{
  const result=await api.get<License>(base+'/'+encodeURIComponent(id))
  if(!result.data||result.data.id!==id||result.data.product!==product)throw new Error('授权回读身份不一致，请停止操作并核对。')
  return result.data
 }
 const sendIssue=async(intent:Issue)=>{
  try{
   const result=await api.post<License>(base,intent)
   if(!result.data||!sameIssue(result.data,intent))throw new Error('签发回执不完整，原请求已保留，请读取结果核对。')
   finishIssue(result.data)
  }catch(reason){
   if(!uncertain(reason)){
    sessionStorage.removeItem(storageKey);setPending(null)
    throw new Error(message(reason)+'；本次签发未获确认，请核对条件后再提交。')
   }
   throw new Error(message(reason)+'；结果暂不确定，原请求已锁定。请读取结果或重试同一签发，勿重复新建。')
  }
 }
 const selectedInput=()=>{
  if(!selected.length)throw new Error('请至少选择一个工具。')
  return selected.map(tool=>{
   const raw=tool.limitInput.trim(),limit=raw===''?null:Number(raw)
   if(limit!==null&&(!/^\d+$/.test(raw)||!Number.isSafeInteger(limit)||limit<=0||limit>2147483647))throw new Error(tool.name+' 的额度须为 1 至 2147483647 的整数，留空表示不限次数。')
   if(editing&&limit!==null&&limit<tool.used)throw new Error(tool.name+' 的额度不能低于已用 '+tool.used+' 次。')
   return {key:tool.key,limit}
  })
 }
 const sendBatch=async(input:BatchCommit)=>{
  try{
   const result=await api.post<BatchReceipt>(base+'/batches',input)
   if(!isBatchReceipt(result.data,input))throw new Error('批量签发回执不完整。')
   sessionStorage.removeItem(batchStorageKey)
   setPendingBatch(null);setBatchReceipt(result.data);setReceipt(null);clearForm()
   setNotice(`已签发 ${result.data.licenses.length} 份工具许可。`);setListSubject('');setListPage(1);licenses.refresh()
  }catch(cause){
   const status=(cause as {status?:number})?.status
   if(status===400||status===409){sessionStorage.removeItem(batchStorageKey);setPendingBatch(null);setBatchPreview(null);throw cause}
   throw new Error(message(cause)+' 原批次已保留，可完成操作验证后重试同一批次。')
  }
 }
 const confirmBatch=()=>void mutate(async()=>{
  if(pendingBatch){await sendBatch(pendingBatch);return}
  if(!batchPreview||batchPreview.result.conflicts.length)return
  const input={...batchPreview.input,previewDigest:batchPreview.result.previewDigest}
  sessionStorage.setItem(batchStorageKey,JSON.stringify(input))
  setPendingBatch(input);setBatchPreview(null)
  await sendBatch(input)
 })
 const save=()=>void mutate(async()=>{
  if(storageError||unknownChange)return
  if(pending){await sendIssue(pending);return}
  if(!reason.trim())throw new Error('请填写本次授权原因。')
  const chosen=selectedInput()
  if(editing){
   if(!window.confirm(`确认调整 ${editing.subjectLabel} 的 ${products[product]} 工具清单与额度？已用次数保留，有效期不变。\n${selected.map(tool=>tool.name).join('、')}\n原因：${reason.trim()}`))return
   try{
    const result=await api.put<License>(base+'/'+encodeURIComponent(editing.id),{expectedRevision:editing.revision,reason:reason.trim(),tools:chosen})
    if(!result.data||result.data.id!==editing.id||result.data.product!==product)throw new Error('调整回执不完整，请回读核对。')
    setReceipt(result.data);setNotice('工具范围和额度已调整，已用次数保留。');clearForm();licenses.refresh()
   }catch(reason){if(uncertain(reason))setUnknownChange({id:editing.id,kind:'调整'});throw reason}
   return
  }
  if(batchMode&&batchSubjects.length<2)throw new Error('请至少选择两个授权对象。')
  if(!batchMode&&!subject)throw new Error('请从检索结果选择'+objectLabel+'。')
  const from=new Date(startsAt),until=new Date(expiresAt)
  if(!Number.isFinite(from.getTime())||!Number.isFinite(until.getTime())||until<=from)throw new Error('请填写有效起止时间，到期时间须晚于生效时间。')
  if(until.getTime()<=Date.now())throw new Error('到期时间必须晚于当前时间。')
  if(renewing&&renewing.status!=='TERMINATED'&&from.getTime()<Date.parse(renewing.expiresAt))throw new Error('续期开始时间不能早于原期次到期时间。')
  const request={requestId:crypto.randomUUID(),product,startsAt:from.toISOString(),expiresAt:until.toISOString(),reason:reason.trim(),tools:chosen}
  if(batchMode){
   if(batchSubjects.length*chosen.length>2000)throw new Error('单批最多包含 2000 项对象与工具的分配，请分批签发。')
   const input={...request,subjectIds:batchSubjects.map(item=>item.id)}
   const {data}=await api.post<BatchPreview>(base+'/batches/preview',input)
   if(!matchesBatchPreview(data,input))throw new Error('批量签发预览与选择不一致，请重新预览。')
   setBatchReceipt(null);setBatchPreview({input,result:data})
   return
  }
  if(!subject)return
  const intent:Issue={...request,subjectId:subject.id}
  if(!window.confirm(`确认向 ${subject.label} 签发 ${products[product]} 工具许可？\n${displayTime(intent.startsAt)} 至 ${displayTime(intent.expiresAt)}\n${selected.map(tool=>tool.name+'（'+(tool.limitInput.trim()===''?'不限次数':tool.limitInput+'次')+'）').join('、')}\n原因：${intent.reason}`))return
  try{sessionStorage.setItem(storageKey,JSON.stringify(intent))}catch{setStorageError('无法保存待核对请求，已阻止签发。请保留当前页面并检查浏览器存储。');return}
  setPending(intent);await sendIssue(intent)
 })
 const loadForm=(row:License,kind:'edit'|'renew')=>{
  if(locked)return
  if((subject||batchSubjects.length||selected.length||reason)&&!window.confirm('此操作将替换当前未提交的选择，确认继续？'))return
  setBatchMode(false);setBatchSubjects([]);setBatchReceipt(null);setError('');setNotice('');setReceipt(null)
  setSubject({id:row.subjectId,label:row.subjectLabel});setListSubject(row.subjectId);setListPage(1)
  setSelected(row.tools.map(tool=>({...tool,limitInput:tool.limit===null?'':String(tool.limit),used:kind==='edit'?tool.used:0})));setReason('')
  if(kind==='edit'){setEditing(row);setRenewing(null);setStartsAt(localTime(new Date(row.startsAt)));setExpiresAt(localTime(new Date(row.expiresAt)))}
  else{
   const from=new Date(Math.max(Math.ceil(Date.now()/60000)*60000,row.status==='TERMINATED'?0:Date.parse(row.expiresAt)))
   const seconds=from.toISOString().slice(16,23)
   const local=localTime(from)+(seconds===':00.000'?'':seconds);setStartsAt(local);setExpiresAt(monthsAfter(local,12));setEditing(null);setRenewing(row)
   setNotice('已带入原工具清单。将新建独立期次，原记录保留；请核对日期与新一期额度。')
  }
 }
 const terminate=(row:License)=>void mutate(async()=>{
  if(!reason.trim())throw new Error('请填写本次授权原因，再终止指定记录。')
  const result=await api.get<TerminationImpact>(base+'/'+encodeURIComponent(row.id)+'/termination-impact')
  const impact=result.data
  if(!impact||impact.id!==row.id||impact.product!==product||impact.revision!==row.revision
    ||!['SCHEDULED','ACTIVE'].includes(impact.status))throw new Error('许可状态已变化，请刷新后重新确认影响范围。')
  const reservations=impact.outstandingReservations?`其中 ${impact.outstandingReservations} 项仍有待结算预留。\n`:''
  if(!window.confirm(`确认提前终止 ${impact.subjectLabel} 的 ${products[product]} 工具许可？\n本期工具：${impact.tools.map(tool=>tool.name).join('、')}\n已记录计量的发布共 ${impact.meteredPublications} 项。${reservations}终止后该期次停止新的受许可发布，已经发布的活动按原任务规则运行。\n原因：${reason.trim()}`))return
  try{
   const result=await api.post<License>(base+'/'+encodeURIComponent(row.id)+'/terminate',{expectedRevision:row.revision,reason:reason.trim()})
   if(!result.data||result.data.id!==row.id||result.data.product!==product)throw new Error('终止回执不完整，请回读核对。')
   setReceipt(result.data);setNotice('工具许可已终止，历史记录保留。');licenses.refresh()
  }catch(reason){if(uncertain(reason))setUnknownChange({id:row.id,kind:'终止'});throw reason}
 })
 const reconcile=()=>void mutate(async()=>{
  const id=pending?.requestId??unknownChange?.id
  if(!id)return
  const row=await readRow(id)
  if(pending){
   if(!sameIssueIdentity(row,pending))throw new Error('当前记录与原签发身份不一致，请保留请求并联系管理员核对。')
   if(!sameIssue(row,pending)){
    setReceipt(row)
    if(!window.confirm(`已读取原请求的许可，当前修订 ${row.revision} 的清单或原因已变化。确认按当前状态结束待核对？不会重复签发，也不认定此前请求由谁完成。`)){setNotice('已展示当前回读记录，原签发请求继续保留待核对。');return}
    finishIssue(row,'已按当前回读状态结束待核对，未重复签发。')
   }else finishIssue(row)
  }
  else{
   setUnknownChange(null);setReceipt(row);clearForm();setNotice('已读取当前授权状态；不认定此前请求由谁完成。请按回读结果重新选择操作。');licenses.refresh()
  }
 })
 const toggleTool=(tool:Tool)=>setSelected(old=>old.some(item=>item.key===tool.key)?old.filter(item=>item.key!==tool.key):[...old,{...tool,limitInput:'',used:editing?.tools.find(item=>item.key===tool.key)?.used??0}])
 const addTools=(list:readonly Tool[])=>setSelected(old=>{
  const existing=new Set(old.map(item=>item.key))
  return [...old,...list.filter(item=>!existing.has(item.key)).map(item=>({...item,limitInput:'',used:editing?.tools.find(tool=>tool.key===item.key)?.used??0}))]
 })
 const selectAll=()=>void mutate(async()=>{
  const result=await api.get<{list:Tool[]}>(toolTag
   ?catalog+'/matches?'+new URLSearchParams({product,tag:toolTag})
   :base+'/current-tools?'+new URLSearchParams({product}))
  if(!Array.isArray(result.data?.list))throw new Error('可授权工具清单读取失败，请刷新后重试。')
  if(!result.data.list.length){setNotice('当前没有匹配的可授权工具。');return}
  addTools(result.data.list)
  setNotice(`已加入当前 ${result.data.list.length} 个可授权工具。签发前请核对清单与额度。`)
 })
 const oldTools=new Map(renewing?.tools.map(tool=>[tool.key,tool]))
 const selectedKeys=new Set(selected.map(tool=>tool.key))
 const renewalChanges=renewing?{
  added:selected.filter(tool=>!oldTools.has(tool.key)),
  removed:renewing.tools.filter(tool=>!selectedKeys.has(tool.key)),
  changed:selected.filter(tool=>oldTools.has(tool.key)&&tool.limitInput.trim()!==(oldTools.get(tool.key)?.limit?.toString()??'')),
 }:null
 const running=licenses.data?.enforcedProducts?.includes(product)??false
 const runningFamilies=licenses.data?.pilotToolFamilies?.[product]?.map(key=>families[key]??key).join('、')
 const clearFocus=()=>{setFocusedKey(undefined);setToolPage(1);setListPage(1)}
 const focusedSchool=schoolDetails.data?.list[0]
 const selectedSubjects=batchMode?batchSubjects:subject?[subject]:[]
 const chooseSubject=(value:Subject)=>{
  if(batchMode){
   if(batchSubjects.some(row=>row.id===value.id)){setBatchSubjects(old=>old.filter(row=>row.id!==value.id));return}
   if(batchSubjects.length>=50){setError('单批最多选择 50 个授权对象。');return}
   setBatchSubjects(old=>[...old,value]);setError('')
   return
  }
  setSubject(value);setListSubject(value.id);setListPage(1)
 }
 return <>
  {active&&<ToolCatalogTagsPanel product={product} onChange={()=>{setTagRevision(value=>value+1);tools.refresh()}}/>}
  <p className="sys-message" role="status">{running?`当前入口已启用工具许可发布校验试点${runningFamilies?'，覆盖'+runningFamilies:''}。具体工具仍须满足原版本和入口规则。`:'当前入口尚未启用工具许可发布校验试点。实际发布仍按原入口权限执行。'}</p>
  {focusedKey&&<div className="sys-message"><p>当前查看此工具的许可{tools.data?.list[0]?.name?' · '+tools.data.list[0].name:''}</p><button type="button" disabled={locked} onClick={clearFocus}>查看全部工具许可</button></div>}
  {schoolDetails.loading&&<p role="status">正在读取学校详情…</p>}
  {schoolDetails.error&&<p role="alert">{schoolDetails.error}</p>}
  {focusedSchool&&<section className="sys-message" aria-label="学校许可详情"><strong>{focusedSchool.label}</strong>
   {focusedSchool.description&&<p>{focusedSchool.description}</p>}
   <button type="button" disabled={locked||Boolean(editing)||Boolean(renewing)} onClick={()=>chooseSubject(focusedSchool)}>为本校编制许可</button>
  </section>}
  {(storageError||restoredBatch.error)&&<p className="sys-message sys-error" role="alert">{storageError||restoredBatch.error}</p>}{error&&<p className="sys-message sys-error" role="alert">{error}</p>}{notice&&<p className="sys-message" role="status">{notice}</p>}
  {(pending||unknownChange)&&<section className="sys-message" aria-label="待核对工具授权"><p>{pending?'签发结果待核对，原对象、范围及请求编号已锁定。':'变更结果待核对；请先读取当前记录，不自动重复调整或终止。'}</p><button type="button" disabled={busy} onClick={reconcile}>读取授权结果</button>{pending&&<button type="button" disabled={busy} onClick={save}>重试同一签发</button>}<details><summary>请求标识</summary><code>{pending?.requestId??unknownChange?.id}</code></details></section>}
  {pendingBatch&&<section className="sys-message" aria-label="待核对批量签发">
   <p>批量签发结果待核对，原对象、范围及请求编号已保留。</p>
   <button type="button" disabled={busy} onClick={confirmBatch}>重试同一批次并核对结果</button>
  </section>}
  {batchPreview&&<BatchConfirmation preview={batchPreview.result} selectedSubjects={batchSubjects} busy={busy}
   onCancel={()=>setBatchPreview(null)} onConfirm={confirmBatch} formatTime={displayTime}/>}
  <section className="tool-license-editor" aria-label="编制工具许可">
   <h3>{editing?'调整工具范围与额度':renewing?renewing.status==='TERMINATED'?'重新签发工具许可':'续期工具许可':'新建工具许可'}</h3>
   {!editing&&!renewing&&<label className="tool-batch-toggle">
    <input type="checkbox" checked={batchMode} disabled={locked} onChange={changeBatchMode}/>
    <span>批量签发给多个{objectLabel}</span>
   </label>}
   {editing&&<p>正在调整 {editing.subjectLabel} 的修订 {editing.revision}，有效期不可在此修改；延长期限请另建续期。</p>}
   <div className="tool-license-grid">
    <section aria-label="查找授权对象"><h4>1 · 选择{objectLabel}</h4>
     <form className="sys-search" onSubmit={event=>{event.preventDefault();setSubjectPage(1);setSubjectQuery(subjectInput.trim());subjects.refresh()}}><label><span className="sr-only">搜索{objectLabel}</span><input type="search" value={subjectInput} maxLength={120} disabled={locked||Boolean(editing)||Boolean(renewing)} placeholder={'按名称搜索'+objectLabel} onChange={event=>setSubjectInput(event.target.value)}/></label><button disabled={locked||Boolean(editing)||Boolean(renewing)}>搜索对象</button></form>
     {subject&&<p className="tool-license-selection">已选：<strong>{subject.label}</strong></p>}
     {batchMode&&<section className="tool-license-selection" aria-label="批量已选对象">
      <strong>已选 {batchSubjects.length} 个对象</strong>
      {!!batchSubjects.length&&<ul>{batchSubjects.map(row=><li key={row.id}>{row.label}
       <button type="button" disabled={locked} onClick={()=>chooseSubject(row)}>移除 {row.label}</button></li>)}</ul>}
     </section>}
     {subjects.loading&&<p role="status">正在读取授权对象…</p>}{subjects.error&&<p role="alert">{subjects.error}</p>}
     {!subjects.loading&&subjects.data&&!subjects.data.list.length&&<p>没有符合当前入口条件的{objectLabel}。</p>}
     <ul className="tool-license-options">{subjects.data?.list.map(row=><li key={row.id}><div><strong>{row.label}</strong>{row.description&&<small>{row.description}</small>}
      {['SCHOOL','TEACHER'].includes(product)&&<Link to={'/admin/permissions?'+new URLSearchParams({view:'tools',product,subjectId:row.id})}>学校许可详情</Link>}</div>
      <button type="button" aria-pressed={selectedSubjects.some(item=>item.id===row.id)} disabled={locked||Boolean(editing)||Boolean(renewing)} onClick={()=>chooseSubject(row)}>{selectedSubjects.some(item=>item.id===row.id)?'已选':'选择'} {row.label}</button></li>)}</ul>
     <nav className="tool-license-paging" aria-label="授权对象分页"><button type="button" disabled={locked||subjects.loading||subjectPage===1||Boolean(editing)||Boolean(renewing)} onClick={()=>setSubjectPage(page=>page-1)}>上一页对象</button><span>第 {subjectPage} 页</span><button type="button" disabled={locked||subjects.loading||!subjects.data?.hasMore||Boolean(editing)||Boolean(renewing)} onClick={()=>setSubjectPage(page=>page+1)}>下一页对象</button></nav>
    </section>
    <section aria-label="查找许可工具"><h4>2 · 选择工具</h4>
     <form className="sys-search" onSubmit={event=>{event.preventDefault();clearFocus();setToolQuery(toolInput.trim());tools.refresh()}}><label><span className="sr-only">搜索许可工具</span><input type="search" maxLength={120} disabled={locked} value={toolInput} placeholder="按名称搜索工具" onChange={event=>setToolInput(event.target.value)}/></label><button disabled={locked}>搜索工具</button></form>
     <details open={showTags} onToggle={event=>{
      const open=event.currentTarget.open
      setShowTags(open)
      if(!open&&!locked){setToolTag('');setToolPage(1)}
     }}>
      <summary>按标签筛选工具</summary>
      <label className="system-field">工具标签
       <select disabled={locked} value={toolTag} onChange={event=>{clearFocus();setToolTag(event.target.value)}}>
        <option value="">全部标签</option>{tagOptions.map(tag=><option key={tag} value={tag}>{tag}</option>)}
       </select>
      </label>
      {tagError&&<p role="alert">{tagError}</p>}
     </details>
     {tools.loading&&<p role="status">正在读取工具目录…</p>}{tools.error&&<p role="alert">{tools.error}</p>}
     {!tools.loading&&tools.data&&!tools.data.list.length&&<p>{focusedKey?'此工具当前无法在该入口签发新许可。':'没有符合条件的可授权工具。'}</p>}
     <ul className="tool-license-options">{tools.data?.list.map(tool=><li key={tool.key}><label className="tool-license-check"><input type="checkbox" checked={selected.some(item=>item.key===tool.key)} disabled={locked} onChange={()=>toggleTool(tool)}/><span><strong>{tool.name}</strong><small>{families[tool.family]??tool.family}</small></span></label></li>)}</ul>
     <nav className="tool-license-paging" aria-label="工具目录分页"><button type="button" disabled={locked||tools.loading||toolPage===1} onClick={()=>setToolPage(page=>page-1)}>上一页工具</button><span>第 {toolPage} 页</span><button type="button" disabled={locked||tools.loading||!tools.data?.hasMore} onClick={()=>setToolPage(page=>page+1)}>下一页工具</button></nav>
     {toolTag&&<p>当前标签：{toolTag}</p>}
     <div className="system-actions"><button type="button" disabled={locked||!tools.data?.list.length} onClick={()=>addTools(tools.data?.list??[])}>选择当前页全部工具</button>
      <button type="button" disabled={locked} onClick={selectAll}>{toolTag?'加入该标签下全部可授权工具':'加入本入口全部可授权工具'}</button></div>
    </section>
   </div>
   <h4>3 · 确认范围与期限</h4><p>已选 {selected.length} 个工具。额度留空表示不限次数。{product==='SCHOOL'||product==='TEACHER'?'发布活动时按作答人数上限预留额度；活动截止不得晚于商业许可到期，未用余额在活动到期后退回。':'额度按成功发布计次。'}受测作答不另查商业许可。发布校验试点未启用时，此处额度仅为许可配置。</p>
   {renewalChanges&&<section className="sys-message" aria-label="续期范围对照"><strong>续期范围对照</strong>
    {!renewalChanges.added.length&&!renewalChanges.removed.length&&!renewalChanges.changed.length&&<p>沿用原工具及额度。新一期单独计量。</p>}
    {!!renewalChanges.added.length&&<p>新增 {renewalChanges.added.map(tool=>tool.name).join('、')}</p>}
    {!!renewalChanges.removed.length&&<p>下一期移除 {renewalChanges.removed.map(tool=>tool.name).join('、')}</p>}
    {!!renewalChanges.changed.length&&<p>调整下一期额度 {renewalChanges.changed.map(tool=>tool.name).join('、')}</p>}
   </section>}
   <ul className="tool-license-selected">{selected.map(tool=><li key={tool.key}><div><strong>{tool.name}</strong><small>{families[tool.family]??tool.family}{editing?' · 已用 '+tool.used+' 次':''}</small></div><label>额度 · {tool.name}<input inputMode="numeric" type="number" step="1" min={editing?Math.max(1,tool.used):1} max={2147483647} placeholder="不限次数" disabled={locked} value={tool.limitInput} onChange={event=>setSelected(old=>old.map(item=>item.key===tool.key?{...item,limitInput:event.target.value}:item))}/></label><button type="button" disabled={locked} onClick={()=>setSelected(old=>old.filter(item=>item.key!==tool.key))}>移除 {tool.name}</button></li>)}</ul>
   <div className="tool-license-grid"><label className="system-field">生效时间（本地时间）<input type="datetime-local" step="any" disabled={locked||Boolean(editing)} value={startsAt} onChange={event=>setStartsAt(event.target.value)}/></label><label className="system-field">到期时间（本地时间）<input type="datetime-local" step="any" disabled={locked||Boolean(editing)} value={expiresAt} onChange={event=>setExpiresAt(event.target.value)}/></label></div>
   <div className="system-actions"><button type="button" disabled={locked||Boolean(editing)||!startsAt} onClick={()=>setExpiresAt(monthsAfter(startsAt,6))}>半年</button><button type="button" disabled={locked||Boolean(editing)||!startsAt} onClick={()=>setExpiresAt(monthsAfter(startsAt,12))}>一年</button><small>快捷期限从生效时间计算，填写后仍可自行修改到期时刻。</small></div>
   <label className="system-field">本次授权原因<textarea rows={3} maxLength={500} value={reason} disabled={locked} onChange={event=>setReason(event.target.value)}/></label>
   <div className="system-actions"><button type="button" disabled={locked} onClick={save}>{editing?'保存工具范围与额度':batchMode?'预览批量签发':'确认签发工具许可'}</button><button type="button" disabled={locked} onClick={()=>{if(window.confirm('放弃当前未提交的工具许可选择？'))clearForm()}}>清空当前选择</button></div>
  </section>
  {batchReceipt&&<section className="sys-message" aria-label="批量签发回执">
   <h3>已签发 {batchReceipt.licenses.length} 份许可</h3>
   <ul>{batchReceipt.licenses.map(row=><li key={row.id}>{row.subjectLabel} · {row.tools.length} 项工具</li>)}</ul>
  </section>}
  {receipt&&<section className="sys-message" aria-label="工具许可回执"><h3>{receipt.subjectLabel} · {states[receipt.status]}</h3><p>{displayTime(receipt.startsAt)} 至 {displayTime(receipt.expiresAt)} · 修订 {receipt.revision}</p><p>{receipt.tools.map(tool=>tool.name).join('、')}</p><details><summary>许可标识</summary><code>{receipt.id}</code></details></section>}
  <section aria-label="工具许可列表" className="tool-license-list"><div className="sys-section-heading"><h3>已签发工具许可</h3><button type="button" disabled={busy||licenses.loading} onClick={licenses.refresh}>刷新许可列表</button></div>
   <div className="tool-license-grid">
    <label className="system-field">许可状态<select value={listStatus} onChange={event=>{setListStatus(event.target.value);setListPage(1)}}>
     <option value="">全部状态</option>{Object.entries(recordStates).map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select></label>
    <label className="system-field">许可工具类型<select value={listFamily} onChange={event=>{setListFamily(event.target.value);setListPage(1)}}>
     <option value="">全部类型</option>{Object.entries(families).filter(([key])=>key!=='COMPOSITION').map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select></label>
   </div>
   <p>{listSubject?'当前仅查看已选对象的许可。':'当前查看此入口全部对象。'}{listSubject&&<button type="button" disabled={locked} onClick={()=>{setListSubject('');setListPage(1)}}>查看全部对象</button>}</p>
   {licenses.loading&&<p role="status">正在读取许可记录…</p>}{licenses.error&&<p role="alert">{licenses.error}</p>}
   {!licenses.loading&&licenses.data&&!licenses.data.list.length&&<p>当前没有匹配的工具许可。</p>}
   <div className="sys-records">{licenses.data?.list.map(row=><article className="sys-record" key={row.id}><details><summary><span className="sys-record-heading"><strong>{row.subjectLabel}</strong><small>{products[row.product]} · {displayTime(row.startsAt)} 至 {displayTime(row.expiresAt)}</small></span><span className="sys-badge">{states[row.status]}{row.nextLicenseId!==undefined&&(row.nextLicenseId?' · 已有连续下一期':' · 到期后将中断')}</span></summary><div className="sys-record-body"><p>{!!row.missingTools?.length&&'下一期减少工具：'+row.missingTools.join('、')}</p><p>原因：{row.reason} · 修订 {row.revision}</p><ul>{row.tools.map(tool=><li key={tool.key}>{tool.name} · {families[tool.family]??tool.family} · {tool.limit===null?'不限次数':'总量 '+tool.limit+' 次'} · 已用 {tool.used} 次{tool.limit!==null?' · 剩余 '+Math.max(0,tool.limit-tool.used)+' 次':''}{row.status==='ACTIVE'&&tool.family==='SCALE'&&<a href={licenseAssignmentPath(row.product,row.subjectId,tool.key)}>转交 {products[row.product]} 管理员分配版本</a>}</li>)}</ul><div className="system-actions"><button type="button" disabled={locked||!['SCHEDULED','ACTIVE'].includes(row.status)} onClick={()=>loadForm(row,'edit')}>调整工具与额度</button><button type="button" disabled={locked} onClick={()=>loadForm(row,'renew')}>{row.status==='TERMINATED'?'重新签发':'续期'}</button><button type="button" disabled={locked||!['SCHEDULED','ACTIVE'].includes(row.status)} onClick={()=>terminate(row)}>提前终止</button></div><LicenseHistory key={row.revision} id={row.id}/><details><summary>许可标识</summary><code>{row.id}</code></details></div></details></article>)}</div>
   <nav className="tool-license-paging" aria-label="工具许可分页"><button type="button" disabled={locked||licenses.loading||listPage===1} onClick={()=>setListPage(page=>page-1)}>上一页许可</button><span>第 {listPage} 页</span><button type="button" disabled={locked||licenses.loading||!licenses.data?.hasMore} onClick={()=>setListPage(page=>page+1)}>下一页许可</button></nav>
  </section>
 </>
}
