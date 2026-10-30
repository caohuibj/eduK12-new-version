import {useEffect,useRef,useState} from 'react'
import {PersonalChangesReport,type PersonalChangesResponse} from './PersonalChangesReport'
type Api=<T>(path:string,method?:string,data?:unknown)=>Promise<T>
type Choice={trackId:string;itemId:string;scoreKey:string;label:string;unit:string;visible?:boolean;selectedVisible?:boolean}
type Metric=Pick<Choice,'trackId'|'itemId'|'scoreKey'>
type Selection={mode:'SINGLE'|'LONGITUDINAL';metrics:Metric[];visibleMetrics:Metric[]}
const choiceKey=(choice:Metric)=>JSON.stringify([choice.trackId,choice.itemId,choice.scoreKey])
type PublicationProps={api:Api;path:string;publish:(tracking?:Selection)=>void;disabled:boolean;entry?:'SCHOOL'|'TEACHER';publishLabel?:string}
export function EducationTrackingPublish(props:PublicationProps){
 const scope=useRef({api:props.api,path:props.path,generation:0})
 if(scope.current.api!==props.api||scope.current.path!==props.path)scope.current={api:props.api,path:props.path,generation:scope.current.generation+1}
 return <EducationTrackingPublishSession key={scope.current.generation} {...props}/>
}
function EducationTrackingPublishSession({api,path,publish,disabled,entry='TEACHER',publishLabel}:PublicationProps){
 const [options,setOptions]=useState<{baselineId:string|null;ordinal:number|null;choices:Choice[]}|null>(null)
 const [error,setError]=useState(''),[longitudinal,setLongitudinal]=useState(false),[selected,setSelected]=useState<Choice[]>([]),[visibleKeys,setVisibleKeys]=useState<string[]>([])
 useEffect(()=>{let active=true;void api<NonNullable<typeof options>>(path+'/tracking').then(value=>{if(!active)return;setOptions(value);if(value.baselineId){setSelected(value.choices);setVisibleKeys(value.choices.filter(c=>c.visible!==false&&(c.selectedVisible??true)).map(choiceKey))}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'追踪配置读取失败')});return()=>{active=false}},[api,path])
 if(error)return <p role="alert">{error}</p>
 if(!options)return <p>正在读取追踪配置…</p>
 const tracking=!!options.baselineId||longitudinal
 return <div>
  {options.baselineId?<p>纵向 T{options.ordinal}：追踪指标和计分定义继承自首次发布；本人可见性可在原披露上限内收窄。</p>:<>
   <label>测量模式 <select aria-label={entry==='SCHOOL'?'学生测量模式':'教师测量模式'} value={longitudinal?'LONGITUDINAL':'SINGLE'} onChange={e=>{setLongitudinal(e.target.value==='LONGITUDINAL');setSelected([]);setVisibleKeys([])}}><option value="SINGLE">单次测量</option><option value="LONGITUDINAL" disabled={!options.choices.length}>Longitudinal 纵向追踪</option></select></label>
   {longitudinal&&<fieldset><legend>追踪的子工具指标（同一投放）</legend>{options.choices.map(c=><label key={choiceKey(c)} className="block"><input type="checkbox" checked={selected.some(value=>choiceKey(value)===choiceKey(c))} disabled={Boolean(selected.length&&selected[0].trackId!==c.trackId)} onChange={e=>{
    const checked=e.target.checked;setSelected(old=>checked?[...old,c]:old.filter(v=>choiceKey(v)!==choiceKey(c)));setVisibleKeys(old=>checked&&c.visible!==false?[...new Set([...old,choiceKey(c)])]:old.filter(key=>key!==choiceKey(c)))
   }}/>{c.label}（{c.unit}）{c.visible===false?' · 工具未开放本人变化数值':''}</label>)}</fieldset>}
  </>}
  {tracking&&<fieldset><legend>本轮本人可见指标</legend>{selected.map(c=><label key={choiceKey(c)} className="block"><input type="checkbox" disabled={disabled||c.visible===false} checked={visibleKeys.includes(choiceKey(c))&&c.visible!==false} onChange={e=>setVisibleKeys(old=>e.target.checked?[...new Set([...old,choiceKey(c)])]:old.filter(key=>key!==choiceKey(c)))}/>{c.label}{c.visible===false?' · 来源未授权本人展示':''}</label>)}<p>计划追踪与本人披露分别冻结；此选择不会让学校或其他受众获得个人分数。</p></fieldset>}
  <button disabled={disabled||tracking&&!selected.length} onClick={()=>publish({mode:tracking?'LONGITUDINAL':'SINGLE',metrics:selected.map(({trackId,itemId,scoreKey})=>({trackId,itemId,scoreKey})),visibleMetrics:selected.filter(c=>c.visible!==false&&visibleKeys.includes(choiceKey(c))).map(({trackId,itemId,scoreKey})=>({trackId,itemId,scoreKey}))})}>{publishLabel??(entry==='SCHOOL'?'正式发布本人测评':'发布教师评价任务')}</button>
 </div>
}
export function EducationTrackingNext({api,path,create,disabled,entry='TEACHER'}:{api:Api;path:string;create:()=>void;disabled:boolean;entry?:'SCHOOL'|'TEACHER'}){
 const [configured,setConfigured]=useState(false)
 useEffect(()=>{let active=true;void api<{baselineId:string|null}>(path+'/tracking').then(v=>{if(active)setConfigured(Boolean(v.baselineId))}).catch(()=>{});return()=>{active=false}},[api,path])
 return configured?<button disabled={disabled} onClick={create}>{entry==='SCHOOL'?'创建下一轮学生活动':'创建下一轮教师自评'}</button>:null
}
export function EducationPersonalChanges({api,executionId,entry='TEACHER',path}:{api:Api;executionId:string;entry?:'SCHOOL'|'TEACHER';path?:string}){
 const endpoint=path??(entry==='SCHOOL'?'/reports/student/executions/':'/scale-tasks/')+encodeURIComponent(executionId)+'/changes'
 const [report,setReport]=useState<{api:Api;executionId:string;endpoint:string;value:PersonalChangesResponse}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const source=useRef({api,executionId,endpoint});source.current={api,executionId,endpoint}
 const load=async()=>{const selected=source.current;setBusy(true);setError('');try{const value=await api<PersonalChangesResponse>(endpoint,'POST',{});if(source.current.api===selected.api&&source.current.executionId===selected.executionId&&source.current.endpoint===selected.endpoint)setReport({api,executionId,endpoint,value})}catch(e){if(source.current.api===selected.api&&source.current.executionId===selected.executionId&&source.current.endpoint===selected.endpoint)setError(e instanceof Error?e.message:'变化报告暂不可用')}finally{if(source.current.api===selected.api&&source.current.executionId===selected.executionId&&source.current.endpoint===selected.endpoint)setBusy(false)}}
 return <div><button type="button" disabled={busy} onClick={()=>void load()}>查看我的变化</button>{error&&<p role="alert">{error}</p>}{report?.api===api&&report.executionId===executionId&&report.endpoint===endpoint&&<PersonalChangesReport report={report.value}/>}</div>
}
