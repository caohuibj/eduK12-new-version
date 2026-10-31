import {useCallback,useEffect,useRef,useState} from 'react'
import {GroupLongitudinalPanel} from '../modules/reporting/GroupLongitudinalPanel'

type Api=<T>(path:string,method?:string,body?:unknown)=>Promise<T>
type Choice={kind:'CLASSES'|'LABELS';id:string;name:string;dimensionId:string|null;dimensionName:string|null}
type Configuration={status:'CONFIGURED'|'NOT_CONFIGURED';specs?:Array<{specId:string;title:string}>;groups?:{options:Choice[];limitations:string[]}}

/** The history/reader is shared; configuration is loaded only for a new report. */
export function TeacherGroupLongitudinal({api,endpoint}:{api:Api;endpoint:string}){
 const [open,setOpen]=useState(false),[configuration,setConfiguration]=useState<Configuration|null>(null)
 const [specId,setSpecId]=useState(''),[dimension,setDimension]=useState('ALL'),[ids,setIds]=useState<string[]>([])
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),epoch=useRef(0)
 useEffect(()=>{epoch.current++;setOpen(false);setConfiguration(null);setSpecId('');setDimension('ALL');setIds([]);setBusy(false);setError('');return()=>{epoch.current++}},[api,endpoint])
 const selected=JSON.stringify(dimension==='ALL'?{kind:'ALL'}:{kind:dimension==='CLASSES'?'CLASSES':'LABELS',ids:[...ids].sort()})
 const request=useCallback(<T,>(path:string,method='GET',body?:unknown)=>{
  if(method==='POST'&&!specId)return Promise.reject(new Error('请先选择已有的已发布群体报告方案'))
  if(method==='POST'&&dimension!=='ALL'&&!ids.length)return Promise.reject(new Error('请选择报告人群'))
  return api<T>(path,method,method==='POST'?{...(body as Record<string,unknown>),specId,selection:JSON.parse(selected)}:body)
 },[api,specId,selected,dimension,ids.length])
 if(!open)return <button type="button" onClick={()=>setOpen(true)}>查看群体纵向报告</button>
 const choices=configuration?.groups?.options??[],dimensions=[...new Map(choices.filter(c=>c.kind==='LABELS').map(c=>[c.dimensionId!,c.dimensionName!]))]
 const options=choices.filter(c=>dimension==='CLASSES'?c.kind==='CLASSES':c.kind==='LABELS'&&c.dimensionId===dimension)
 async function configure(){
  const token=++epoch.current;setBusy(true);setError('')
  try{const value=await api<Configuration>(endpoint+'?configure=true');if(token===epoch.current)setConfiguration(value)}
  catch(cause){if(token===epoch.current)setError(cause instanceof Error?cause.message:'群报配置暂不可读')}
  finally{if(token===epoch.current)setBusy(false)}
 }
 return <section aria-label="教师群体纵向报告"><h3>教师群体纵向报告</h3>
  <p>只使用正式冻结的追踪计划。各轮分别统计当时人群，不把均值差解释为同一人的平均改变。</p>
  <button type="button" disabled={busy} onClick={()=>void configure()}>配置纵向群报方案与人群</button>
  {error&&<p role="alert">{error}</p>}{busy&&<p role="status">正在读取群报配置…</p>}
  {configuration?.status==='NOT_CONFIGURED'&&<p>此任务没有正式冻结的 longitudinal 计划。</p>}
  {configuration?.status==='CONFIGURED'&&<>
   <label>纵向群报方案<select aria-label="纵向群报方案" disabled={busy} value={specId} onChange={e=>setSpecId(e.target.value)}><option value="">选择已发布方案</option>{configuration.specs?.map(s=><option key={s.specId} value={s.specId}>{s.title}</option>)}</select></label>
   <label>纵向报告人群<select aria-label="纵向报告人群" disabled={busy} value={dimension} onChange={e=>{setDimension(e.target.value);setIds([])}}><option value="ALL">全部合格参与教师</option>{choices.some(c=>c.kind==='CLASSES')&&<option value="CLASSES">任教班级</option>}{dimensions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
   {dimension!=='ALL'&&options.map(c=><label key={c.id}><input type="checkbox" checked={ids.includes(c.id)} disabled={busy} onChange={e=>setIds(old=>e.target.checked?[...old,c.id]:old.filter(id=>id!==c.id))}/>{c.name}</label>)}
   {configuration.groups?.limitations.map(text=><p key={text}>{text}</p>)}
  </>}
  <GroupLongitudinalPanel key={endpoint} base={endpoint} request={request}/>
 </section>
}
