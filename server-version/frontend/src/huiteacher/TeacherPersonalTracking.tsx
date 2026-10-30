import {useEffect,useRef,useState} from 'react'
import {PersonalChangesReport,type PersonalChangesResponse} from '../modules/reporting/PersonalChangesReport'
type Api=<T>(path:string,method?:string,data?:unknown)=>Promise<T>
type Choice={trackId:string;itemId:string;scoreKey:string;label:string;unit:string}
type Selection={mode:'SINGLE'|'LONGITUDINAL';metrics:Array<Pick<Choice,'trackId'|'itemId'|'scoreKey'>>}
export function TeacherTrackingPublish({api,path,publish,disabled}:{api:Api;path:string;publish:(tracking?:Selection)=>void;disabled:boolean}){
 const [options,setOptions]=useState<{baselineId:string|null;ordinal:number|null;choices:Choice[]}|null>(null)
 const [error,setError]=useState(''),[longitudinal,setLongitudinal]=useState(false),[selected,setSelected]=useState<Choice[]>([])
 useEffect(()=>{let active=true;void api<NonNullable<typeof options>>(path+'/tracking').then(value=>{if(active)setOptions(value)}).catch(e=>{if(active)setError(e instanceof Error?e.message:'追踪配置读取失败')});return()=>{active=false}},[api,path])
 if(error)return <p role="alert">{error}</p>
 if(!options)return <p>正在读取追踪配置…</p>
 return <div>
  {options.baselineId?<p>纵向 T{options.ordinal}：追踪指标与固定测量来源继承自首次发布。</p>:<>
   <label>测量模式 <select aria-label="教师测量模式" value={longitudinal?'LONGITUDINAL':'SINGLE'} onChange={e=>{setLongitudinal(e.target.value==='LONGITUDINAL');setSelected([])}}><option value="SINGLE">单次测量</option><option value="LONGITUDINAL" disabled={!options.choices.length}>Longitudinal 纵向追踪</option></select></label>
   {longitudinal&&<fieldset><legend>追踪的子工具指标（同一任务）</legend>{options.choices.map(c=><label key={c.trackId+':'+c.itemId+':'+c.scoreKey} className="block"><input type="checkbox" checked={selected.includes(c)} disabled={Boolean(selected.length&&selected[0].trackId!==c.trackId)} onChange={e=>setSelected(old=>e.target.checked?[...old,c]:old.filter(v=>v!==c))}/>{c.label}（{c.unit}）</label>)}<p>发布后锁定计分定义。本人仅可查看工具原本允许披露的变化数值；学校不能由此查看个人分数。</p></fieldset>}
  </>}
  <button disabled={disabled||longitudinal&&!selected.length} onClick={()=>publish(options.baselineId?undefined:{mode:longitudinal?'LONGITUDINAL':'SINGLE',metrics:selected.map(({trackId,itemId,scoreKey})=>({trackId,itemId,scoreKey}))})}>发布教师评价任务</button>
 </div>
}
export function TeacherTrackingNext({api,path,create,disabled}:{api:Api;path:string;create:()=>void;disabled:boolean}){
 const [configured,setConfigured]=useState(false)
 useEffect(()=>{let active=true;void api<{baselineId:string|null}>(path+'/tracking').then(v=>{if(active)setConfigured(Boolean(v.baselineId))}).catch(()=>{});return()=>{active=false}},[api,path])
 return configured?<button disabled={disabled} onClick={create}>创建下一轮教师自评</button>:null
}
export function TeacherPersonalChanges({api,executionId}:{api:Api;executionId:string}){
 const [report,setReport]=useState<{api:Api;executionId:string;value:PersonalChangesResponse}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const source=useRef({api,executionId});source.current={api,executionId}
 const load=async()=>{const selected=source.current;setBusy(true);setError('');try{const value=await api<PersonalChangesResponse>('/scale-tasks/'+encodeURIComponent(executionId)+'/changes','POST',{});if(source.current.api===selected.api&&source.current.executionId===selected.executionId)setReport({api,executionId,value})}catch(e){if(source.current.api===selected.api&&source.current.executionId===selected.executionId)setError(e instanceof Error?e.message:'变化报告暂不可用')}finally{if(source.current.api===selected.api&&source.current.executionId===selected.executionId)setBusy(false)}}
 return <div><button type="button" disabled={busy} onClick={()=>void load()}>查看我的变化</button>{error&&<p role="alert">{error}</p>}{report?.api===api&&report.executionId===executionId&&<PersonalChangesReport report={report.value}/>}</div>
}
