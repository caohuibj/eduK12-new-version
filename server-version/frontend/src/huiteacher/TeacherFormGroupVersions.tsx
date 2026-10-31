import {useEffect,useRef,useState} from 'react'
import type {TeacherFormGroupProjection} from './TeacherFormGroupReport'
type Api=<T>(path:string,method?:string,data?:unknown)=>Promise<T>
type Index={versioned:boolean;truncated:boolean;nextCursor?:{releasedAt:string;versionId:string}|null;versions:Array<{versionId:string;releasedAt:string;populationLabel:string}>;groups:{options:Array<{kind:'CLASSES'|'LABELS';id:string;name:string;dimensionId:string|null;dimensionName:string|null}>;limitations:string[]}}

/** Product adapter only: the existing native Form service owns all statistics. */
export function TeacherFormGroupVersions({api,endpoint,onReport}:{api:Api;endpoint:string;onReport:(report:TeacherFormGroupProjection|null)=>void}){
 const [index,setIndex]=useState<Index|null>(null),[dimension,setDimension]=useState('ALL'),[ids,setIds]=useState<string[]>([])
 const [version,setVersion]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [directoryError,setDirectoryError]=useState('')
 const request=useRef(0),deliver=useRef(onReport);deliver.current=onReport
 useEffect(()=>{
  const token=++request.current;setIndex(null);setVersion('');setDimension('ALL');setIds([]);setError('');setDirectoryError('');setBusy(true);deliver.current(null)
  void api<Index>(endpoint+'/versions').then(async result=>{
   if(token!==request.current)return
   setIndex(result)
   if(result.versions[0]){
    const id=result.versions[0].versionId
    const report=await api<TeacherFormGroupProjection>(endpoint+'/versions/'+id)
    if(token===request.current){setVersion(id);deliver.current(report)}
   }
  }).catch(e=>{if(token===request.current)setError(e instanceof Error?e.message:'报告目录暂不可读取')})
   .finally(()=>{if(token===request.current)setBusy(false)})
  return()=>{request.current++}
 },[api,endpoint])
 async function read(id:string){
  const token=++request.current;setBusy(true);setError('')
  try{const report=await api<TeacherFormGroupProjection>(endpoint+'/versions/'+id);if(token===request.current){setVersion(id);deliver.current(report)}}
  catch(e){if(token===request.current)setError(e instanceof Error?e.message:'该版本暂不可读取')}
  finally{if(token===request.current)setBusy(false)}
 }
 async function generate(){
  const token=++request.current;setBusy(true);setError('');setDirectoryError('')
  const selection=dimension==='ALL'?{kind:'ALL'}:{kind:dimension==='CLASSES'?'CLASSES':'LABELS',ids}
  try{
   const report=await api<TeacherFormGroupProjection>(endpoint+'/versions','POST',{selection})
   if(token!==request.current)return
   setVersion(report.versionId!);deliver.current(report)
   setIndex(previous=>previous?{...previous,versions:[{versionId:report.versionId!,releasedAt:report.releasedAt!,populationLabel:report.populationLabel??'全部合格参与教师'},...previous.versions.filter(row=>row.versionId!==report.versionId)]}:previous)
   await refreshDirectory(token)
  }catch(e){if(token===request.current)setError(e instanceof Error?e.message:'报告生成条件暂不满足')}
  finally{if(token===request.current)setBusy(false)}
 }
 async function refreshDirectory(token:number){
  setDirectoryError('')
  try{const result=await api<Index>(endpoint+'/versions');if(token===request.current)setIndex(previous=>previous?{...result,versions:[...new Map([...result.versions,...previous.versions].map(row=>[row.versionId,row])).values()],nextCursor:previous.nextCursor}:result)}
  catch(e){if(token===request.current)setDirectoryError(e instanceof Error?e.message:'版本目录暂不可读取')}
 }
 async function retryDirectory(){
  const token=++request.current;setBusy(true)
  try{await refreshDirectory(token)}finally{if(token===request.current)setBusy(false)}
 }
 async function older(){
  if(!index?.nextCursor)return
  const token=++request.current;setBusy(true);setError('')
  try{
   const query=new URLSearchParams({beforeAt:index.nextCursor.releasedAt,beforeId:index.nextCursor.versionId})
   const result=await api<Index>(endpoint+'/versions?'+query)
   if(token===request.current)setIndex(previous=>previous?{...previous,versions:[...new Map([...previous.versions,...result.versions].map(row=>[row.versionId,row])).values()],nextCursor:result.nextCursor,truncated:result.truncated}:result)
  }catch(e){if(token===request.current)setError(e instanceof Error?e.message:'更早版本暂不可读取')}
  finally{if(token===request.current)setBusy(false)}
 }
 const dimensions=[...new Map(index?.groups.options.filter(row=>row.kind==='LABELS').map(row=>[row.dimensionId!,row.dimensionName!])??[])]
 const options=index?.groups.options.filter(row=>dimension==='CLASSES'?row.kind==='CLASSES':row.kind==='LABELS'&&row.dimensionId===dimension)??[]
 return <section aria-label="教师群体报告版本与人群">
  {error&&<p role="alert">{error}</p>}{busy&&<p role="status">正在处理群体报告…</p>}
  {directoryError&&<p role="alert">报告已生成，版本目录刷新失败：{directoryError} <button type="button" disabled={busy} onClick={()=>void retryDirectory()}>重试读取版本目录</button></p>}
  {index&&<>
   {index.versions.length>0&&<label className="ht-field"><span>已生成版本</span><select disabled={busy} value={version} onChange={e=>void read(e.target.value)}>
    {index.versions.map(row=><option key={row.versionId} value={row.versionId}>{new Date(row.releasedAt).toLocaleString('zh-CN')} · {row.populationLabel}</option>)}
   </select></label>}
   {index.nextCursor&&<button type="button" disabled={busy} onClick={()=>void older()}>更早 Form 报告版本</button>}
   {index.versioned&&<><label className="ht-field"><span>报告人群</span><select disabled={busy} value={dimension} onChange={e=>{setDimension(e.target.value);setIds([])}}>
    <option value="ALL">全部合格参与教师</option>
    {index.groups.options.some(row=>row.kind==='CLASSES')&&<option value="CLASSES">任教班级</option>}
    {dimensions.map(([id,name])=><option key={id} value={id}>{name}</option>)}
   </select></label>
   {dimension!=='ALL'&&<fieldset disabled={busy}><legend>同一维度可多选，满足任一项即纳入</legend>{options.map(row=><label key={row.id} className="ht-tag"><input type="checkbox" checked={ids.includes(row.id)} onChange={e=>setIds(previous=>e.target.checked?[...previous,row.id]:previous.filter(id=>id!==row.id))}/>{row.name}</label>)}</fieldset>}
   <button type="button" disabled={busy||dimension!=='ALL'&&!ids.length} onClick={()=>void generate()}>生成更新版报告</button>
   <p>只在点击生成时重新统计；打开与切换版本读取已保存的快照。</p></>}
   {index.groups.limitations.map(text=><p key={text} className="ht-muted">{text}</p>)}
  </>}
 </section>
}
