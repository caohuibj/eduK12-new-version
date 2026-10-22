import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {submissionStatusLabel,type SubmissionMetadata,type GovernanceMediaManifest} from '../../api/scaleLibraryGovernance'
import {EducationApplicabilityFields,EducationApplicabilitySummary,useEducationApplicabilityDraft} from '../scale-governance/EducationApplicabilityFields'
import {SubmissionMetadataFields,emptySubmissionMetadata} from '../scale-governance/SubmissionMetadataFields'
import {AssessmentImagePreview,type ImageAuthoringAdapter} from '../../modules/assessment-media/AssessmentImageField'
import {createPrivateScaleSharingClient,type PrivateSharingPrepared,type PrivateSharingRow,type PrivateSharingDetail,type PrivateSharingBody} from './educationPrivateScaleSharingClient'
import {privateToolError,type PrivateToolApi,type PrivateToolVersion,type PrivateDraftState} from './privateToolClient'
type Props={api:PrivateToolApi;entry:'SCHOOL'|'TEACHER';organizationId:string;actorId:string;toolId:string;version:PrivateToolVersion;disabled?:boolean;onDraftStateChange?:(value:PrivateDraftState)=>void}
export function EducationPrivateScaleSharing(props:Props){return <SharingSession key={JSON.stringify([props.entry,props.organizationId,props.actorId,props.toolId,props.version.id,props.version.contentHash])} {...props}/>}
function SharingSession({api,entry,organizationId,actorId,toolId,version,disabled=false,onDraftStateChange}:Props){
 const client=useMemo(()=>createPrivateScaleSharingClient(api,organizationId,toolId,entry),[api,organizationId,toolId,entry])
 const scope=JSON.stringify([entry,organizationId,actorId,toolId,version.id,version.contentHash])
 const [prepared,setPrepared]=useState<PrivateSharingPrepared|null>(null),[metadata,setMetadata]=useState<SubmissionMetadata>(emptySubmissionMetadata)
 const [baseline,setBaseline]=useState(JSON.stringify(emptySubmissionMetadata)),[consent,setConsent]=useState('')
 const [rows,setRows]=useState<PrivateSharingRow[]>([]),[hasMore,setHasMore]=useState(false),[loaded,setLoaded]=useState(false)
 const [detail,setDetail]=useState<PrivateSharingDetail|null>(null),[reason,setReason]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [pending,setPending]=useState<PrivateSharingBody|null>(null)
 const [acknowledged,setAcknowledged]=useState<PrivateSharingRow|null>(null)
 const generation=useRef(0),listEpoch=useRef(0),locked=useRef(false),alive=useRef(true)
 const applicability=useEducationApplicabilityDraft(scope)
 const dirty=JSON.stringify(metadata)!==baseline||Boolean(consent||applicability.rows.length||reason.trim()||pending)
 useEffect(()=>{onDraftStateChange?.({dirty,writing:busy||Boolean(pending)})},[dirty,busy,pending,onDraftStateChange])
 useEffect(()=>()=>{onDraftStateChange?.({dirty:false,writing:false})},[onDraftStateChange])
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;locked.current=false}},[client])
 useEffect(()=>{if(!dirty&&!busy)return;const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[dirty,busy])
 const refresh=useCallback(async()=>{
  const token=generation.current,request=++listEpoch.current
  const data=await client.list()
  if(!alive.current||token!==generation.current||request!==listEpoch.current)return
  setAcknowledged(old=>old?(data.list.find(row=>row.id===old.id)??old):null);setRows(data.list);setHasMore(data.hasMore);setLoaded(true)
 },[client])
 useEffect(()=>{const token=generation.current;void refresh().catch(cause=>{if(alive.current&&token===generation.current)setError(privateToolError(cause))})},[refresh])
 const work=async(action:(current:()=>boolean)=>Promise<void>)=>{
  if(disabled||locked.current)return
  locked.current=true;setBusy(true);setError('');setNotice('')
  const token=generation.current,current=()=>alive.current&&token===generation.current
  try{await action(current)}catch(cause){if(current())setError(privateToolError(cause))}
  finally{if(current()){locked.current=false;setBusy(false)}}
 }
 const prepare=()=>void work(async current=>{
  if(pending)return
  setConsent('');setPrepared(null)
  const value=await client.prepare(version.id,version.contentHash)
  if(!current())return
  setPrepared(value)
  if(JSON.stringify(metadata)===baseline){setMetadata({...emptySubmissionMetadata,...value.defaults});setBaseline(JSON.stringify({...emptySubmissionMetadata,...value.defaults}))}
  setNotice('已准备当前私有固定版本；尚未提交申请，也未向其他使用者授权。')
 })
 const duplicate=[...rows,...(acknowledged?[acknowledged]:[])].some(row=>row.versionId===version.id&&['SUBMITTED','APPROVED'].includes(row.status))
 const manifest=prepared?.mediaManifest
 const consentIdentity=manifest?JSON.stringify([scope,prepared?.releaseId,prepared?.contentHash,manifest.manifestHash]):''
 const mediaReady=Boolean(manifest&&(!manifest.items.length||consent===consentIdentity))
 const canSubmit=Boolean(prepared&&loaded&&!duplicate&&mediaReady&&applicability.valid&&Object.values(metadata).every(value=>value.trim()))
 const submit=(retry=false)=>void work(async current=>{
  if(!retry&&!canSubmit)return
  const body=retry?pending:prepared?{contentHash:version.contentHash,releaseId:prepared.releaseId,requestId:crypto.randomUUID(),metadata:{...metadata},dependencyReleaseIds:[] as [],
   ...(manifest?.items.length?{mediaConsent:{manifestHash:manifest.manifestHash,shareWithAuthorizedUsers:true as const}}:{}),...(applicability.value?{educationApplicability:applicability.value}:{})}:null
  if(!body)return
  setPending(body)
  try{
   const row=await client.submit(version.id,body)
   if(!current())return
   setAcknowledged(row);setRows(old=>[row,...old.filter(item=>item.id!==row.id)]);setPending(null);setConsent('');applicability.clear();setBaseline(JSON.stringify(metadata));setNotice('入库申请已提交，等待管理员审核。批准后仍须另行授权，不会自动发布活动或开放报告。')
   try{await refresh()}catch{if(current())setError('申请已提交，但列表刷新失败。请重新读取申请记录，不要重复提交。')}
  }catch(cause){
   if(!current())return
   const status=(cause as {status?:number}).status
   if(status&&status>=400&&status<500){setPending(null);setPrepared(null);setConsent('');setError('服务端拒绝本次申请，请核对说明并重新准备版本；附件同意已清除。 '+privateToolError(cause))}
   else setError('提交结果尚未确认。请读取申请记录核对，或使用原申请编号与原内容重试；不会自动生成新申请。 '+privateToolError(cause))
  }
 })
 const readDetail=(row:PrivateSharingRow)=>void work(async current=>{
  setDetail(null)
  const data=await client.detail(row.id)
  if(current()){setAcknowledged(old=>old?.id===data.id?data:old);setDetail(data);setReason('')}
 })
 const withdraw=()=>void work(async current=>{
  if(!detail||detail.status!=='SUBMITTED'||!reason.trim()||pending)return
  const result=await client.withdraw(detail.id,detail.version,reason.trim())
  if(current()){setAcknowledged(old=>old?.id===result.id?result:old);setRows(old=>old.map(row=>row.id===result.id?result:row));setDetail(null);setReason('');setNotice('申请已撤回；私有工具和既有活动权限不变。')}
 })
 const images=(value:GovernanceMediaManifest,context:{versionId:string;releaseId:string}|{submissionId:string})=><SharingImages key={JSON.stringify(context)+value.manifestHash} manifest={value} context={context} scope={scope} client={client} busy={busy}/>
 const prefix=entry==='SCHOOL'?'hs':'ht'
 return <section className={entry==='SCHOOL'?'hs-task-detail':'ht-task'} aria-label="私有量表入库申请">
  <h4>固定量表入库申请 · {version.title} · 修订 {version.sourceRevision}</h4>
  <p>申请不等于批准，批准不等于其他人已获授权。原作者信息保留为历史来源，不限制批准后的授权；此操作不会发布活动或增加报告读取权。</p>
  <button type="button" disabled={busy||disabled||Boolean(pending)} onClick={prepare}>准备此固定版本的入库申请</button>
  <button type="button" disabled={busy||disabled} onClick={()=>void work(async()=>{await refresh()})}>重新读取申请记录</button>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {pending&&<button type="button" disabled={busy||disabled} onClick={()=>submit(true)}>按原申请编号及内容重试</button>}
  {prepared&&<>
   <p>私有版本摘要：{prepared.privateContentHash} · 入库内容版本：{prepared.releaseId} · 内容摘要：{prepared.contentHash}</p>
   <SubmissionMetadataFields value={metadata} onChange={setMetadata} disabled={busy||disabled||Boolean(pending)} entry={entry}/>
   <EducationApplicabilityFields product={entry} rows={applicability.rows} onChange={applicability.setRows} valid={applicability.valid} disabled={busy||disabled||Boolean(pending)}/>
   {images(prepared.mediaManifest,{versionId:version.id,releaseId:prepared.releaseId})}
   {manifest&&manifest.items.length>0&&<label className={`${prefix}-field`}><input type="checkbox" disabled={busy||disabled||Boolean(pending)} checked={consent===consentIdentity} onChange={event=>setConsent(event.target.checked?consentIdentity:'')}/>我同意上述附件随此精确量表版本申请进入受控共用媒体库，仅随获批量表供获授权任务使用，不单独公开复用。</label>}
   {duplicate&&<p>此版本已有待审或获批申请，请查看现有记录。</p>}
   <button type="button" disabled={busy||disabled||Boolean(pending)||!canSubmit} onClick={()=>submit()}>提交此版本入库申请</button>
  </>}
  <h5>申请记录</h5>{hasMore&&<p>当前仅显示最近 100 条申请，不代表全部历史；暂不提供继续翻页。</p>}
  {loaded&&!rows.length&&<p>{acknowledged?'本次列表未返回申请记录，请稍后刷新。':'当前量表没有申请记录。'}</p>}
  {rows.map(row=><article key={row.id}><p>{row.metadata.title} · {submissionStatusLabel[row.status]} · 固定版本 {row.versionId}</p><button type="button" disabled={busy||disabled} onClick={()=>readDetail(row)}>查看申请 {row.id}</button></article>)}
  {detail&&<section aria-label="申请冻结详情"><h5>{detail.metadata.title} · {submissionStatusLabel[detail.status]}</h5><SubmissionMetadataFields value={detail.metadata} onChange={()=>undefined} disabled entry={entry}/>
   <EducationApplicabilitySummary value={detail.educationApplicability} hash={detail.educationApplicabilityHash}/>{images(detail.mediaManifest,{submissionId:detail.id})}
   <details><summary>精确版本冻结记录</summary><pre>{JSON.stringify(detail.snapshot,null,2)}</pre></details>{detail.reason&&<p>{detail.reason}</p>}
   {detail.status==='SUBMITTED'&&<><label className={`${prefix}-field`}><span>撤回说明</span><input disabled={busy||Boolean(pending)} maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)}/></label><button type="button" disabled={busy||disabled||Boolean(pending)||!reason.trim()} onClick={withdraw}>撤回此申请</button></>}
  </section>}
 </section>
}

function SharingImages({manifest,context,scope,client,busy}:{manifest:GovernanceMediaManifest;context:{versionId:string;releaseId:string}|{submissionId:string};scope:string;client:ReturnType<typeof createPrivateScaleSharingClient>;busy:boolean}){
 const [expanded,setExpanded]=useState(false),[error,setError]=useState('')
 const contextKey=JSON.stringify(context)
 const adapter=useMemo<ImageAuthoringAdapter>(()=>({scopeKey:scope+':'+contextKey+':'+manifest.manifestHash,
  upload:async()=>{throw Error('申请清单不支持上传图片')},
  loadPreview:async asset=>{
   try{return await client.preview(JSON.parse(contextKey),asset.assetId,asset.mimeType)}
   catch(cause){setError('附件预览未能加载，可关闭后重新读取；原附件引用未改变。');throw cause}
  },
 }),[scope,contextKey,manifest.manifestHash,client])
 return <section aria-label="入库附件清单"><h5>随本版本申请的附件</h5>{!manifest.items.length&&<p>此版本没有托管附件。</p>}
  {manifest.items.map(item=><div key={item.assetId+item.contentHash}><p>{item.assetId} · {item.mimeType} · {item.sizeBytes} 字节 · 用途：{item.usages.join('、')}</p>
   {expanded&&<AssessmentImagePreview adapter={adapter} image={{asset:{assetId:item.assetId,contentHash:item.contentHash,mimeType:item.mimeType as 'image/png'|'image/jpeg'|'image/webp'},altText:'入库附件 '+item.assetId}}/>}</div>)}
  {manifest.items.length>0&&<button type="button" disabled={busy} onClick={()=>{setExpanded(value=>!value);setError('')}}>{expanded?'关闭附件预览':'读取获授权的附件预览'}</button>}{error&&<p role="alert">{error}</p>}
 </section>
}
