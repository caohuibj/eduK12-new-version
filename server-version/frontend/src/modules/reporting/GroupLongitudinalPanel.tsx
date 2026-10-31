import {groupHistoryQuery,mergeGroupHistory,type GroupHistoryCursor} from './group-history'
import {useEffect,useRef,useState} from 'react'
import {GroupLongitudinalReport,type GroupLongitudinalArtifact} from './GroupLongitudinalReport'

type Pointer={artifactId:string;generatedAt:string}
type Catalog={status:'CONFIGURED'|'NOT_CONFIGURED';planId?:string;tools:Array<{key:string;label:string;kind:string}>;waves:Array<{id:string;ordinal:number;title:string}>;artifacts:Pointer[];nextCursor?:GroupHistoryCursor|null}
type Request=<T>(path:string,method?:string,body?:unknown)=>Promise<T>
export function GroupLongitudinalPanel({base,request}:{base:string;request:Request}){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[sourceKey,setSourceKey]=useState(''),[throughWaveId,setThroughWaveId]=useState('')
 const [artifact,setArtifact]=useState<GroupLongitudinalArtifact|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const epoch=useRef(0)
 useEffect(()=>{epoch.current++;setCatalog(null);setSourceKey('');setThroughWaveId('');setArtifact(null);setBusy(false);setError('');return()=>{epoch.current++}},[base])
 async function run(action:(current:()=>boolean)=>Promise<void>,keepArtifact=false){
  const id=++epoch.current,current=()=>id===epoch.current;setBusy(true);setError('');if(!keepArtifact)setArtifact(null)
  try{await action(current)}catch(cause){if(current())setError(cause instanceof Error?cause.message:'纵向群体报告操作失败')}
  finally{if(current())setBusy(false)}
 }
 const show=(value:GroupLongitudinalArtifact)=>{setArtifact(value);setSourceKey(value.projection.sourceKey)}
 return <section className="my-5 space-y-3 rounded-xl border p-4" aria-label="纵向群体报告管理">
  <h3>纵向群体报告</h3><p>仅使用首次正式发布时冻结的追踪计划。新结果需显式生成更新版，历史版保持原快照。</p>
  <button type="button" className="btn-secondary" disabled={busy} onClick={()=>void run(async current=>{
   const index=await request<Catalog>(base)
   if(!current())return
   setCatalog(index);setSourceKey(index.tools[0]?.key??'');setThroughWaveId(index.waves[index.waves.length-1]?.id??'')
   if(index.artifacts[0]){const value=await request<GroupLongitudinalArtifact>(base+'/'+encodeURIComponent(index.artifacts[0].artifactId));if(current())show(value)}
  })}>打开纵向群体报告</button>
  {error&&<p role="alert">{error}</p>}{busy&&<p role="status">正在读取或生成纵向群体报告…</p>}
  {catalog?.status==='NOT_CONFIGURED'&&<p>此来源没有已正式发布的 longitudinal 计划，继续使用原单次群体报告。</p>}
  {catalog?.status==='CONFIGURED'&&<>
   <label>冻结子工具<select aria-label="纵向群体子工具" disabled={busy} value={sourceKey} onChange={e=>{setSourceKey(e.target.value);setArtifact(null)}}>
    {catalog.tools.map(tool=><option key={tool.key} value={tool.key}>{tool.label} · {tool.kind}</option>)}</select></label>
   <label>截至波次<select aria-label="纵向群体截至波次" disabled={busy} value={throughWaveId} onChange={e=>{setThroughWaveId(e.target.value);setArtifact(null)}}>
    {catalog.waves.map(w=><option key={w.id} value={w.id}>T{w.ordinal} · {w.title}</option>)}</select></label>
   {catalog.waves.length<2&&<p>至少需要两个已发布波次；各指标缺失独立保留。</p>}
   <button type="button" className="btn-primary" disabled={busy||!sourceKey||catalog.waves.findIndex(w=>w.id===throughWaveId)<1} onClick={()=>void run(async current=>{
    const value=await request<GroupLongitudinalArtifact>(base,'POST',{planId:catalog.planId,sourceKey,throughWaveId})
    if(current()){show(value);setCatalog(old=>old?{...old,artifacts:mergeGroupHistory([{artifactId:value.artifactId,generatedAt:value.generatedAt}],old.artifacts)}:old)}
   })}>生成更新版纵向报告</button>
   {catalog.artifacts.length>0&&<label>历史版本<select aria-label="纵向群体历史版本" disabled={busy} value={artifact?.artifactId??''} onChange={e=>{const id=e.target.value;if(id)void run(async current=>{const value=await request<GroupLongitudinalArtifact>(base+'/'+encodeURIComponent(id));if(current())show(value)})}}>
    <option value="">选择已生成版本</option>{catalog.artifacts.map(p=><option key={p.artifactId} value={p.artifactId}>{new Date(p.generatedAt).toLocaleString('zh-CN')} · {p.artifactId.slice(0,8)}</option>)}</select></label>}
   {catalog.nextCursor&&<button type="button" disabled={busy} onClick={()=>void run(async current=>{
    const next=await request<Pick<Catalog,'artifacts'|'nextCursor'>>(base+groupHistoryQuery(catalog.nextCursor!))
    if(current())setCatalog(previous=>previous?{...previous,nextCursor:next.nextCursor,artifacts:mergeGroupHistory(previous.artifacts,next.artifacts)}:previous)
   },true)}>加载更早的纵向版本</button>}
  </>}
  {artifact&&<GroupLongitudinalReport key={artifact.artifactId} artifact={artifact}/>}
 </section>
}
