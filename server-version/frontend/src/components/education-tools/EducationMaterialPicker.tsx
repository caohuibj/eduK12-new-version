import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {AssessmentMaterialPicker,type MaterialLibraryProvider} from '../../modules/assessment-media/AssessmentMaterialPicker'
import {AssessmentMaterialDisplay} from '../../modules/assessment-media/AssessmentMaterialDisplay'
import type {AssessmentMaterial,PublicMaterial} from '../../modules/assessment-media/material'
import {privateToolBase,type PrivateToolApi} from './privateToolClient'
type Scope={api:PrivateToolApi;entry:'SCHOOL'|'TEACHER';actorId:string;organizationId:string;toolId:string}
const base=(organizationId:string,toolId:string)=>`${privateToolBase(organizationId)}/${encodeURIComponent(toolId)}`
export function EducationMaterialPreview({api,organizationId,toolId,item}:{api:PrivateToolApi;organizationId:string;toolId:string;item:PublicMaterial}){
 const load=useCallback(async(asset:PublicMaterial['asset'],signal:AbortSignal)=>{
  const blob=await api<Blob>(`${base(organizationId,toolId)}/assets/${encodeURIComponent(asset.assetId)}/content`,'GET',undefined,{responseType:'blob'})
  if(signal.aborted)throw Error('素材读取已取消')
  if(!(blob instanceof Blob))throw Error('素材响应无效')
  return new Response(blob,{headers:{'Content-Type':blob.type}})
 },[api,organizationId,toolId])
 return <AssessmentMaterialDisplay item={item} load={load} appearance="training"/>
}
export function EducationMaterialPicker(props:Scope&{value?:AssessmentMaterial[];onChange:(items:AssessmentMaterial[])=>void;disabled?:boolean;label?:string;onBusy?:(busy:boolean)=>void}){
 const key=JSON.stringify([props.entry,props.actorId,props.organizationId,props.toolId])
 return <EducationMaterialSession key={key} {...props}/>
}
function EducationMaterialSession({api,organizationId,toolId,value,onChange,disabled,label,onBusy}:Scope&{value?:AssessmentMaterial[];onChange:(items:AssessmentMaterial[])=>void;disabled?:boolean;label?:string;onBusy?:(busy:boolean)=>void}){
 const [uploading,setUploading]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const alive=useRef(true),pending=useRef(false),currentApi=useRef(api);currentApi.current=api
 const active=useRef<{notify?:typeof onBusy}|null>(null)
 useEffect(()=>{alive.current=true;setUploading(false);return()=>{
  alive.current=false;const request=active.current;active.current=null;pending.current=false;request?.notify?.(false)
 }},[api])
 const begin=()=>{const request={notify:onBusy};active.current=request;pending.current=true;setUploading(true);setError('');request.notify?.(true);return request}
 const finish=(request:{notify?:typeof onBusy})=>{if(active.current!==request)return;active.current=null;pending.current=false;request.notify?.(false);if(alive.current)setUploading(false)}
 const provider=useMemo<MaterialLibraryProvider>(()=>({appearance:'training',
  note:'目录按类型最多显示最近 900 项，仅加载文件信息；点击查看才读取原文件。可选本人在当前学校、当前入口上传的素材，添加后登记到当前工具。共享获批工具的附件仅随其固定版本提供，不可脱离复用。图片 ≤2 MiB，视频 ≤50 MiB，PDF ≤20 MiB。',
  load:query=>api(`${base(organizationId,toolId)}/materials?kind=${encodeURIComponent(query.kind)}&page=${query.page}`),
  loadContent:async(asset,signal)=>{const blob=await api<Blob>(`${base(organizationId,toolId)}/assets/${encodeURIComponent(asset.assetId)}/content`,'GET',undefined,{responseType:'blob'});if(signal.aborted||!alive.current||currentApi.current!==api)throw Error('素材读取已取消');if(!(blob instanceof Blob))throw Error('素材响应无效');return new Response(blob,{headers:{'Content-Type':blob.type}})},
 }),[api,organizationId,toolId,revision])
 const change=async(items:AssessmentMaterial[])=>{
  if(pending.current||disabled)return
  const added=items.filter(item=>!value?.some(prior=>prior.asset.assetId===item.asset.assetId))
  if(!added.length){onChange(items);return}
  const request=begin()
  try{for(const item of added)await api(`${base(organizationId,toolId)}/materials/register`,'POST',item.asset)
   if(active.current===request&&alive.current&&currentApi.current===api)onChange(items)
  }catch(cause){if(active.current===request&&alive.current&&currentApi.current===api)setError(cause instanceof Error?cause.message:'素材登记失败')}
  finally{finish(request)}
 }
 const upload=async(file:File)=>{
  if(pending.current||disabled)return
  const limits:Record<string,number>={'image/png':2,'image/jpeg':2,'image/webp':2,'video/mp4':50,'video/webm':50,'application/pdf':20}
  if(!limits[file.type]||!file.size||file.size>limits[file.type]*1024*1024){setError('请选择符合格式和大小限制的图片、视频或 PDF');return}
  const request=begin()
  try{const body=new FormData();body.append('material',file);await api(`${base(organizationId,toolId)}/materials`,'POST',body);if(active.current===request&&alive.current&&currentApi.current===api)setRevision(v=>v+1)}
  catch(cause){if(active.current===request&&alive.current&&currentApi.current===api)setError(cause instanceof Error?cause.message:'上传失败')}
  finally{finish(request)}
 }
 return <div><label>上传当前工具素材<input aria-label="上传当前工具素材" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,application/pdf" disabled={disabled||uploading} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file)}}/></label>
  {uploading&&<p role="status">正在上传素材…</p>}{error&&<p role="alert">{error}</p>}
  <AssessmentMaterialPicker value={value} onChange={items=>void change(items)} label={label} disabled={disabled||uploading} provider={provider}/>
 </div>
}
