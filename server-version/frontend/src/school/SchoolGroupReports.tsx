import {useEffect,useRef,useState} from 'react'
import type {SchoolApi} from './SchoolRecovery'
import {SchoolGeneralGroupV2} from './SchoolGeneralGroupV2'
import {TaskGroupReport,type TaskGroupArtifact} from '../modules/reporting/TaskGroupReport'

type Source={runId:string;trackId:string;name:string;resource:{family:string;key:string;version:string}}
type Leaf={slotKey:string;unitType:'SCALE'|'COGNITIVE'|'SITUATIONAL';instrumentKey:string;instrumentVersion:string;compiledRuntimeHash:string}
type Catalog={specs:Array<{specId:string;title:string;version:number;metricIds:string[]}>;sources:Source[];
  artifacts:Array<{artifactId:string;generatedAt:string}>;truncated:boolean}
type Tools={tools:Array<{leaf:Leaf;metrics:Array<{key:string;unit?:string}>}>;
  groups:{options:Array<{kind:'CLASSES'|'LABELS';id:string;name:string;dimensionId:string|null;dimensionName:string|null}>;limitations:string[]}}
const reason=(error:unknown)=>error instanceof Error?error.message:'当前报告不可访问'
const leafKey=(leaf:Leaf)=>JSON.stringify(leaf)

/** Existing School entry, with explicit generation and artifact-only reopening. */
export function SchoolGroupReports({api,organizationId,compact=false}:{api:SchoolApi;organizationId:string;compact?:boolean}){
  const [catalog,setCatalog]=useState<Catalog|null>(null)
  const [sourceKey,setSourceKey]=useState('')
  const [tools,setTools]=useState<Tools|null>(null)
  const [toolKey,setToolKey]=useState('')
  const [specId,setSpecId]=useState('')
  const [dimension,setDimension]=useState('ALL')
  const [selected,setSelected]=useState<string[]>([])
  const [artifact,setArtifact]=useState<TaskGroupArtifact|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [reload,setReload]=useState(0)
  const request=useRef(0)
  const base='/reports/groups'
  const read=async(id:string,token:number)=>{
    const result=await api<TaskGroupArtifact>(`${base}/${encodeURIComponent(organizationId)}/${encodeURIComponent(id)}`)
    if(token===request.current)setArtifact(result)
  }
  useEffect(()=>{
    const token=++request.current
    setCatalog(null);setTools(null);setArtifact(null);setSourceKey('');setSpecId('');setToolKey('');setDimension('ALL');setSelected([]);setError('');setBusy(true)
    void api<Catalog>(`${base}/catalog?organizationId=${encodeURIComponent(organizationId)}`).then(async result=>{
      if(token!==request.current)return
      setCatalog(result)
      if(result.artifacts?.[0]){
        const saved=await api<TaskGroupArtifact>(`${base}/${encodeURIComponent(organizationId)}/${encodeURIComponent(result.artifacts[0].artifactId)}`)
        if(token===request.current)setArtifact(saved)
      }
    }).catch(e=>{if(token===request.current)setError(reason(e))}).finally(()=>{if(token===request.current)setBusy(false)})
    return ()=>{request.current++}
  },[api,organizationId,reload])
  const run=async(action:(token:number)=>Promise<void>)=>{
    const token=++request.current;setBusy(true);setError('')
    try{await action(token)}catch(e){if(token===request.current)setError(reason(e))}
    finally{if(token===request.current)setBusy(false)}
  }
  const source=catalog?.sources.find(row=>`${row.runId}:${row.trackId}`===sourceKey)
  const tool=tools?.tools.find(row=>leafKey(row.leaf)===toolKey)
  const options=tools?.groups.options.filter(row=>dimension==='CLASSES'?row.kind==='CLASSES':row.kind==='LABELS'&&row.dimensionId===dimension)??[]
  const dimensions=[...new Map(tools?.groups.options.filter(row=>row.kind==='LABELS').map(row=>[row.dimensionId!,row.dimensionName!])??[])]
  return <section className={compact?'hs-panel hs-report-panel':'hs-panel'} aria-label="学校群体报告工作台">
    <h2>学校群体报告</h2>
    <p>选择本任务的正式叶工具和人群，生成后保留为快照。再次打开读取已有版本，点击生成更新版才重新统计。</p>
    <p>仅供当前获授权的心理教师和学校管理者使用；活动及任务须已结束并满足原有释放等待期。</p>
    {error&&<p role="alert">{error}</p>}
    {!catalog&&!busy&&error&&<button type="button" onClick={()=>setReload(value=>value+1)}>重新读取报告目录</button>}
    {busy&&<p role="status">正在处理报告…</p>}
    {catalog&&<>
      <label className="hs-field"><span>测评来源</span><select disabled={busy} value={sourceKey} onChange={e=>{request.current++;setSourceKey(e.target.value);setTools(null);setToolKey('');setDimension('ALL');setSelected([])}}>
        <option value="">选择任务</option>{catalog.sources.map(row=><option key={`${row.runId}:${row.trackId}`} value={`${row.runId}:${row.trackId}`}>{row.name} · {row.resource.key}</option>)}
      </select></label>
      <button type="button" disabled={busy||!source} onClick={()=>void run(async token=>{
        const result=await api<Tools>(`${base}/tools?${new URLSearchParams({organizationId,runId:source!.runId,trackId:source!.trackId})}`)
        if(token===request.current){setTools(result);setToolKey('');setDimension('ALL');setSelected([])}
      })}>选择工具与人群</button>
      {tools&&<>
        <label className="hs-field"><span>叶工具与固定版本</span><select disabled={busy} value={toolKey} onChange={e=>setToolKey(e.target.value)}>
          <option value="">选择工具</option>{tools.tools.map(row=><option key={leafKey(row.leaf)} value={leafKey(row.leaf)}>{row.leaf.instrumentKey} · {row.leaf.unitType} · {row.leaf.instrumentVersion} · {row.leaf.slotKey}</option>)}
        </select></label>
        <label className="hs-field"><span>已发布统计方案</span><select disabled={busy} value={specId} onChange={e=>setSpecId(e.target.value)}>
          <option value="">选择方案</option>{catalog.specs.map(row=><option key={row.specId} value={row.specId}>{row.title} · v{row.version}</option>)}
        </select></label>
        <label className="hs-field"><span>报告人群</span><select disabled={busy} value={dimension} onChange={e=>{setDimension(e.target.value);setSelected([])}}>
          <option value="ALL">全部合格参与人群</option>
          {tools.groups.options.some(row=>row.kind==='CLASSES')&&<option value="CLASSES">班级（可多选）</option>}
          {dimensions.map(([id,name])=><option key={id} value={id}>{name}（人员标签，可多选）</option>)}
        </select></label>
        {dimension!=='ALL'&&<fieldset disabled={busy}><legend>选择同一维度中的成员组（任一匹配）</legend>{options.map(row=><label key={row.id} style={{display:'block'}}><input type="checkbox" checked={selected.includes(row.id)} onChange={e=>setSelected(current=>e.target.checked?[...current,row.id]:current.filter(id=>id!==row.id))}/>{row.name}</label>)}</fieldset>}
        {tools.groups.limitations.map(line=><p key={line}>{line}</p>)}
        <button type="button" disabled={busy||!tool||!specId||dimension!=='ALL'&&!selected.length} onClick={()=>void run(async token=>{
          const result=await api<TaskGroupArtifact>(base,'POST',{organizationId,runId:source!.runId,trackId:source!.trackId,specId,leaf:tool!.leaf,
            selection:dimension==='ALL'?{kind:'ALL'}:{kind:dimension==='CLASSES'?'CLASSES':'LABELS',ids:selected}})
          if(token===request.current){setArtifact(result);setCatalog(current=>current?{...current,artifacts:[{artifactId:result.artifactId,generatedAt:result.generatedAt},...(current.artifacts??[]).filter(row=>row.artifactId!==result.artifactId)]}:current)}
        })}>生成更新版报告</button>
      </>}
      {catalog.truncated&&<p>目录仅显示近期有限来源。</p>}
      {!catalog.specs.length&&<p>尚无符合学校人数下限的已发布统计方案。</p>}
      {(catalog.artifacts??[]).length>0&&<label className="hs-field"><span>已生成版本</span><select disabled={busy} value={artifact?.artifactId??''} onChange={e=>{if(e.target.value)void run(token=>read(e.target.value,token))}}>
        <option value="">选择报告</option>{catalog.artifacts.map(row=><option key={row.artifactId} value={row.artifactId}>{new Date(row.generatedAt).toLocaleString('zh-CN')} · {row.artifactId.slice(0,8)}</option>)}
      </select></label>}
    </>}
    {artifact&&<TaskGroupReport key={artifact.artifactId} artifact={artifact}/>}
    {import.meta.env.VITE_REPORT_PRIVACY_SCHOOL_V2_ENABLED==='true'&&<SchoolGeneralGroupV2 api={api} organizationId={organizationId}/>}
  </section>
}
