import {useCallback,useEffect,useRef,useState} from 'react'
import {privateToolBase,privateToolError,type PrivateToolApi,type PrivateToolSummary,type PrivateToolVersion} from './privateToolClient'
import type {CompositionSummary} from './educationCompositionClient'
import {compositionAdministrationLabel} from './educationCompositionAdministration'
import '../../survey/survey-composition-studio.css'
import './education-composition.css'
const merge=<T extends {id:string}>(old:T[],rows:T[])=>Array.from(new Map([...old,...rows].map(row=>[row.id,row])).values())
/** Bounded summaries only; no source definitions, compilation or runtime preparation. */
export type PrivateVersionChoice=PrivateToolVersion&{toolId:string;kind:'SCALE'|'FORM'|'COMPOSITION'}
export function EducationPrivateVersionChooser({api,organizationId,disabled,onSelect,kind,selectLabel='加入问卷'}:{api:PrivateToolApi;organizationId:string;disabled:boolean;
 onSelect:(value:PrivateVersionChoice)=>void;kind?:'COMPOSITION';selectLabel?:string}){
 const [tools,setTools]=useState<Array<PrivateToolSummary|CompositionSummary>>([]),[cursor,setCursor]=useState<string|null>(null),[query,setQuery]=useState('')
 const [selected,setSelected]=useState<PrivateToolSummary|CompositionSummary|null>(null),[versions,setVersions]=useState<PrivateToolVersion[]>([]),[versionCursor,setVersionCursor]=useState<string|null>(null)
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),epoch=useRef(0),alive=useRef(true)
 const base=privateToolBase(organizationId)
 const load=useCallback(async(next?:string)=>{
  const token=++epoch.current;setLoading(true);setError('')
  const query=new URLSearchParams();if(kind)query.set('kind',kind);if(next)query.set('cursor',next)
  try{const data=await api<{list:Array<PrivateToolSummary|CompositionSummary>;nextCursor:string|null}>(base+(query.size?'?'+query.toString():''))
   if(alive.current&&token===epoch.current){setTools(old=>merge(next?old:[],data.list.filter(row=>kind?row.kind===kind:row.kind==='SCALE'||row.kind==='FORM')));setCursor(data.nextCursor)}}
  catch(reason){if(alive.current&&token===epoch.current)setError(privateToolError(reason))}
  finally{if(alive.current&&token===epoch.current)setLoading(false)}
 },[api,base,kind])
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;epoch.current++}},[load])
 const choose=async(tool:PrivateToolSummary|CompositionSummary,next?:string)=>{
  if(disabled)return
  const token=++epoch.current;setSelected(tool);setLoading(true);setError('');if(!next){setVersions([]);setVersionCursor(null)}
  try{const page=await api<{list:PrivateToolVersion[];nextCursor:string|null}>(`${base}/${tool.id}/versions`+(next?'?cursor='+encodeURIComponent(next):''))
   if(alive.current&&token===epoch.current){setVersions(old=>merge(next?old:[],page.list));setVersionCursor(page.nextCursor)}}
  catch(reason){if(alive.current&&token===epoch.current)setError(privateToolError(reason))}
  finally{if(alive.current&&token===epoch.current)setLoading(false)}
 }
 return <section className="survey-composition-catalog" aria-label={kind?'选择固定问卷':'选择固定工具'}><header className="survey-composition-step"><span>01</span><div><h2>{kind?'选择固定问卷':'选择固定工具'}</h2><p>{kind?'选择本人已固定的普通问卷。它将作为一份完整问卷投放。':'先选择本人量表或表单，再明确选用一个固定版本。'}</p></div></header>
  <label>检索已加载工具<input value={query} onChange={event=>setQuery(event.target.value)} maxLength={200}/></label>
  {error&&<p role="alert">{error}</p>}{loading&&<p role="status">正在读取工具…</p>}
  <div className="survey-composition-candidates">{tools.filter(tool=>tool.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(tool=><article key={tool.id}>
   <div><h3>{tool.title}</h3><p>{tool.kind==='SCALE'?'量表':tool.kind==='FORM'?'表单':'普通问卷'}</p></div><button type="button" disabled={disabled||loading} onClick={()=>void choose(tool)}>选择固定版本 · {tool.title}</button>
  </article>)}</div>
  <div><button type="button" disabled={loading||disabled} onClick={()=>void load()}>刷新工具</button>{cursor&&<button type="button" disabled={loading||disabled} onClick={()=>void load(cursor)}>加载更多工具</button>}</div>
  {selected&&<section aria-label="选择工具版本"><h3>{selected.title} · 固定版本</h3>{!loading&&!versions.length&&<p>{kind?'尚无固定版本，请先在普通问卷编制页固定内容。':'尚无固定版本，请先返回量表或表单编制页固定内容。'}</p>}
   {versions.map(version=><p key={version.id}>{version.title} · 修订 {version.sourceRevision}{selected.kind==='COMPOSITION'?' · '+compositionAdministrationLabel(version.administration):''} <button type="button" disabled={disabled||loading}
    onClick={()=>onSelect({...version,toolId:selected.id,kind:selected.kind})}>{selectLabel} · 修订 {version.sourceRevision}</button></p>)}
   {versionCursor&&<button type="button" disabled={loading||disabled} onClick={()=>void choose(selected,versionCursor)}>加载更多工具版本</button>}
  </section>}
 </section>
}
