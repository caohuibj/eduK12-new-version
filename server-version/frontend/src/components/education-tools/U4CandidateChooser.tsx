import {useEffect,useRef,useState} from 'react'
import {privateToolBase,privateToolError,type PrivateTool,type PrivateToolApi} from './privateToolClient'
type Candidate={key:string;title:string;responseMode:string;questions:number;scope:string}
export function U4CandidateChooser({api,organizationId,disabled,onCreated,onBusy}:{api:PrivateToolApi;organizationId:string;disabled:boolean;onCreated:(tool:PrivateTool)=>void;onBusy?:(busy:boolean)=>void}){
 const [items,setItems]=useState<Candidate[]>([]),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false)
 const alive=useRef(true),locked=useRef(false)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const selected=items.find(i=>i.key===key)
 const run=async(create:boolean)=>{
  if(disabled||locked.current||uncertain||create&&!selected)return
  locked.current=true;setBusy(true);onBusy?.(true);setError('')
  try{
   if(create){const result=await api<PrivateTool>(privateToolBase(organizationId)+'/u4-candidates','POST',{key});if(alive.current)onCreated(result)}
   else{const result=await api<{list:Candidate[]}>(privateToolBase(organizationId)+'/u4-candidates');if(alive.current){setItems(result.list);setKey(result.list[0]?.key??'')}}
  }catch(cause){if(alive.current){setError(privateToolError(cause));if(create)setUncertain(true)}}
  finally{locked.current=false;onBusy?.(false);if(alive.current)setBusy(false)}
 }
 return <details><summary>统一教学评价 · 独立候选工具</summary>
  <p>可分别选择完整模块或内容专题，保存为你的私有草稿。专题不是已验证的独立量表；固定版本和投放仍使用现有流程。</p>
  {!items.length?<button type="button" disabled={disabled||busy} onClick={()=>void run(false)}>加载教学评价候选</button>:<>
   <label>候选内容<select aria-label="教学评价候选" value={key} disabled={disabled||busy||uncertain} onChange={e=>setKey(e.target.value)}>{items.map(i=><option key={i.key} value={i.key}>{i.title}</option>)}</select></label>
   {selected&&<p>{selected.questions} 个记录字段 · {selected.responseMode==='SELF'?'教师本人':selected.responseMode==='STUDENT_REPORT'?'学生评教教师':selected.responseMode==='EXPERT_REPORT'?'专家观察':'主持人访谈'} · {selected.scope}</p>}
   <button type="button" disabled={disabled||busy||uncertain||!selected} onClick={()=>void run(true)}>创建所选候选草稿</button>
  </>}
  {error&&<p role="alert">{error}{uncertain?' 创建结果待核对，请重新读取工具列表；不会自动重试。':''}</p>}
 </details>
}
