import {useState} from 'react'
import './approved-scale-axes.css'

type Axis='CONTENT'|'PARAMETERS'|'REPORT'
export type ApprovedScaleChoice={id:string;toolKey:string;title:string;versions:Record<Axis,string>}
type Props={choices:ApprovedScaleChoice[];disabled?:boolean;onSelect:(id:string)=>void;scopeLabel?:string}
const axes:Axis[]=['CONTENT','PARAMETERS','REPORT']
const labels:Record<Axis,string>={CONTENT:'题本 C',PARAMETERS:'解释参数 P',REPORT:'报告 R'}
const empty:Record<Axis,string>={CONTENT:'',PARAMETERS:'',REPORT:''}
const versionLabel=(axis:Axis,value:string)=>value==='none-v1'?(axis==='REPORT'?'不反馈（明确未配置）':axis==='PARAMETERS'?'未配置阈值或常模':value):value

/** Discovery over already approved exact combinations, never an approval or
 * constructor. Labels narrow candidates; only an explicit exact row id is sent
 * to the existing issuer. Equal version labels never become identity evidence. */
export default function ApprovedScaleAxes({choices,disabled=false,onSelect,scopeLabel='当前已读取目录'}:Props){
 const [tool,setTool]=useState(''),[selection,setSelection]=useState(empty),[exact,setExact]=useState('')
 const tools=[...new Map(choices.map(choice=>[choice.toolKey,{key:choice.toolKey,title:choice.title}])).values()]
 const candidates=choices.filter(choice=>choice.toolKey===tool)
 const complete=axes.every(axis=>selection[axis])
 const matches=complete?candidates.filter(choice=>axes.every(axis=>choice.versions[axis]===selection[axis])):[]
 // Refresh/withdrawal cannot silently replace or accept an older chosen row.
 const selected=matches.find(choice=>choice.id===exact)
 function chooseAxis(axis:Axis,value:string){setSelection(old=>({...old,[axis]:value}));setExact('')}
 return <details className="approved-scale-axes"><summary>按题本、参数和报告查找已批准配置</summary>
  <p>{scopeLabel}；仅查找已批准且当前可分配的完整组合。不会为新搭配代作系统审批。请核对人群、用途及报告措辞，专业搭配由管理员决定。</p>
  <fieldset disabled={disabled}><legend>手选 C/P/R 查找配置</legend>
   <label>量表工具<select value={tools.some(value=>value.key===tool)?tool:''} onChange={event=>{setTool(event.target.value);setSelection(empty);setExact('')}}>
    <option value="">选择量表工具</option>{tools.map(value=><option key={value.key} value={value.key}>{value.title}</option>)}
   </select></label>
   {axes.map(axis=><label key={axis}>{labels[axis]}<select aria-label={labels[axis]} disabled={!candidates.length} value={selection[axis]} onChange={event=>chooseAxis(axis,event.target.value)}>
    <option value="">明确选择{labels[axis]}</option>{[...new Set(candidates.map(choice=>choice.versions[axis]))].map(value=><option key={value} value={value}>{versionLabel(axis,value)}</option>)}
   </select></label>)}
   {complete&&matches.length===0&&<p role="status">所选三项尚无本目录可分配的已批准组合。请核对目录范围及系统批准，不能改用默认版本。</p>}
   {matches.length>0&&<label>核对精确配置<select value={selected?exact:''} onChange={event=>setExact(event.target.value)}>
    <option value="">核对并选择精确组合</option>{matches.map(choice=><option key={choice.id} value={choice.id}>{choice.title} · {choice.id}</option>)}
   </select></label>}
   {matches.length>1&&<p>同名版本对应多份配置，请核对来源身份；系统不会自动选择。</p>}
   <button type="button" disabled={disabled||!selected} onClick={()=>{if(selected)onSelect(selected.id)}}>使用所选已批准组合</button>
  </fieldset>
 </details>
}
