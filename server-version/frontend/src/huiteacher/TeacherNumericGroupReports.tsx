import {useCallback,useEffect,useRef,useState} from 'react'
import {TaskGroupReport,type TaskGroupArtifact} from '../modules/reporting/TaskGroupReport'
type Api=<T>(path:string,method?:string,data?:unknown)=>Promise<T>
type Leaf={slotKey:string;unitType:'SCALE'|'COGNITIVE'|'SITUATIONAL';instrumentKey:string;instrumentVersion:string;compiledRuntimeHash:string}
type Choice={kind:'CLASSES'|'LABELS';id:string;name:string;dimensionId:string|null;dimensionName:string|null}
type Index={sources:Array<{trackId:string;title:string;minimumN:number;canGenerate?:boolean;tools:Array<{leaf:Leaf;metrics:Array<{key:string}>}>;groups:{options:Choice[];limitations:string[]}}>;specs:Array<{specId:string;title:string}>;versions:Array<{artifactId:string;generatedAt:string}>;nextCursor?:{generatedAt:string;artifactId:string}|null;canGenerate:boolean}
export function TeacherNumericGroupReports({api,endpoint}:{api:Api;endpoint:string}){
 const [open,setOpen]=useState(false),[configured,setConfigured]=useState(false)
 const [index,setIndex]=useState<Index|null>(null),[selected,setSelected]=useState(''),[spec,setSpec]=useState(''),[dimension,setDimension]=useState('ALL'),[ids,setIds]=useState<string[]>([])
 const [artifact,setArtifact]=useState<TaskGroupArtifact|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[directoryError,setDirectoryError]=useState('')
 const token=useRef(0)
 const load=useCallback((n:number)=>{setError('');setBusy(true)
  void api<Index>(endpoint).then(async data=>{
   if(n!==token.current)return;setIndex(data)
   if(data.versions[0]){const report=await api<TaskGroupArtifact>(endpoint+'/'+data.versions[0].artifactId);if(n===token.current)setArtifact(report)}
   else{const config=await api<Index>(endpoint+'?configure=true');if(n===token.current){setIndex(config);setConfigured(true)}}
  }).catch(e=>{if(n===token.current)setError(e instanceof Error?e.message:'报告目录暂不可读')}).finally(()=>{if(n===token.current)setBusy(false)})
 },[api,endpoint])
 useEffect(()=>{if(!open)return;const n=++token.current;setIndex(null);setConfigured(false);setArtifact(null);setSelected('');setSpec('');setDimension('ALL');setIds([]);setError('');load(n)
  return()=>{token.current++}
 },[load,open])
 if(!open)return <button type="button" onClick={()=>setOpen(true)}>查看数值群体报告</button>
 const tools=index?.sources.flatMap(source=>source.tools.map(tool=>({source,tool,key:source.trackId+':'+tool.leaf.slotKey+':'+tool.leaf.compiledRuntimeHash})))??[]
 const choice=tools.find(row=>row.key===selected)
 const dimensions=[...new Map(choice?.source.groups.options.filter(o=>o.kind==='LABELS').map(o=>[o.dimensionId!,o.dimensionName!])??[])]
 const options=choice?.source.groups.options.filter(o=>dimension==='CLASSES'?o.kind==='CLASSES':o.kind==='LABELS'&&o.dimensionId===dimension)??[]
 async function read(id:string){const n=++token.current;setBusy(true);setError('');try{const value=await api<TaskGroupArtifact>(endpoint+'/'+id);if(n===token.current)setArtifact(value)}catch(e){if(n===token.current)setError(e instanceof Error?e.message:'版本暂不可读')}finally{if(n===token.current)setBusy(false)}}
 async function configure(){const n=++token.current;setBusy(true);setError('');try{const value=await api<Index>(endpoint+'?configure=true');if(n===token.current){setIndex(old=>({...value,versions:old?.versions??value.versions,nextCursor:old?old.nextCursor:value.nextCursor}));setConfigured(true)}}catch(e){if(n===token.current)setError(e instanceof Error?e.message:'配置暂不可读')}finally{if(n===token.current)setBusy(false)}}
 async function older(){if(!index?.nextCursor)return;const n=++token.current;setBusy(true);setError('');try{const query=new URLSearchParams({beforeAt:index.nextCursor.generatedAt,beforeId:index.nextCursor.artifactId});const value=await api<Index>(endpoint+'?'+query);if(n===token.current)setIndex(old=>old?{...old,versions:[...new Map([...old.versions,...value.versions].map(v=>[v.artifactId,v])).values()],nextCursor:value.nextCursor}:value)}catch(e){if(n===token.current)setError(e instanceof Error?e.message:'更早版本暂不可读')}finally{if(n===token.current)setBusy(false)}}
 async function refreshDirectory(n:number){try{const value=await api<Index>(endpoint);if(n===token.current){setIndex(old=>old?{...old,versions:[...new Map([...value.versions,...old.versions].map(v=>[v.artifactId,v])).values()],canGenerate:value.canGenerate}:value);setDirectoryError('')}}catch{if(n===token.current)setDirectoryError('报告已保存；版本目录刷新失败，可重试读取。')}}
 async function generate(){if(!choice)return;const n=++token.current;setBusy(true);setError('');try{
  const value=await api<TaskGroupArtifact>(endpoint,'POST',{trackId:choice.source.trackId,leaf:choice.tool.leaf,specId:spec,selection:dimension==='ALL'?{kind:'ALL'}:{kind:dimension==='CLASSES'?'CLASSES':'LABELS',ids}})
  if(n!==token.current)return;setArtifact(value);setIndex(old=>old?{...old,versions:[{artifactId:value.artifactId,generatedAt:value.generatedAt},...old.versions.filter(v=>v.artifactId!==value.artifactId)]}:old);await refreshDirectory(n)
 }catch(e){if(n===token.current)setError(e instanceof Error?e.message:'生成条件不满足')}finally{if(n===token.current)setBusy(false)}}
 return <section aria-label="教师数值群体报告"><h3>数值工具群体报告</h3>{error&&<p role="alert">{error}</p>}{busy&&<p role="status">正在处理报告…</p>}{!index&&error&&<button type="button" disabled={busy} onClick={()=>load(++token.current)}>重试读取数值报告目录</button>}
  {directoryError&&<p role="status">{directoryError}<button type="button" onClick={()=>void refreshDirectory(token.current)} disabled={busy}>重试读取版本目录</button></p>}
  {index&&<><label>已生成数值报告<select disabled={busy} value={artifact?.artifactId??''} onChange={e=>void read(e.target.value)}><option value="">请选择版本</option>{index.versions.map(v=><option key={v.artifactId} value={v.artifactId}>{new Date(v.generatedAt).toLocaleString('zh-CN')} · {v.artifactId.slice(0,8)}</option>)}</select></label>
   {index.nextCursor&&<button type="button" disabled={busy} onClick={()=>void older()}>更早数值报告版本</button>}
   {!configured?<button type="button" disabled={busy} onClick={()=>void configure()}>配置数值群报更新版</button>:<>
   <label>已批准群体用途的工具<select disabled={busy} value={selected} onChange={e=>{setSelected(e.target.value);setDimension('ALL');setIds([])}}><option value="">请选择固定叶工具</option>{tools.map(t=><option key={t.key} value={t.key}>{t.source.title} · {t.tool.leaf.instrumentVersion}</option>)}</select></label>
   <label>已发布单次群体方案<select disabled={busy} value={spec} onChange={e=>setSpec(e.target.value)}><option value="">请选择方案</option>{index.specs.map(s=><option key={s.specId} value={s.specId}>{s.title}</option>)}</select></label>
   {choice&&<><label>数值报告人群<select disabled={busy} value={dimension} onChange={e=>{setDimension(e.target.value);setIds([])}}><option value="ALL">全部合格参与教师</option>{choice.source.groups.options.some(o=>o.kind==='CLASSES')&&<option value="CLASSES">任教班级</option>}{dimensions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
    {dimension!=='ALL'&&options.map(o=><label key={o.id}><input type="checkbox" disabled={busy} checked={ids.includes(o.id)} onChange={e=>setIds(old=>e.target.checked?[...old,o.id]:old.filter(id=>id!==o.id))}/>{o.name}</label>)}
    {choice.source.groups.limitations.map(text=><p key={text}>{text}</p>)}</>}
   <button type="button" disabled={busy||!index.canGenerate||!choice||choice.source.canGenerate===false||!spec||(dimension!=='ALL'&&!ids.length)} onClick={()=>void generate()}>生成数值群报更新版</button>
   {!index.canGenerate&&<p>当前任务状态或工具披露时机未满足；原版本仍可阅读。</p>}{!tools.length&&<p>本活动暂无已完成且明确批准群体用途的数值工具。</p>}</>}
   </>}
  {artifact&&<TaskGroupReport artifact={artifact}/>}</section>
}
