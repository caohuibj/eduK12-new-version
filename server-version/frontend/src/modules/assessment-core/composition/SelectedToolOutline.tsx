import {useId} from 'react'
import './selected-tool-outline.css'

export type SelectedToolOutlineItem={id:string;title:string;kind:string;version:string}

/** Presentation only: no catalogue requests, permissions or execution-order semantics. */
export function SelectedToolOutline({items,className='',heading='已选工具大纲',onRemove,disabled=false}:{
  items:SelectedToolOutlineItem[]|undefined;className?:string;heading?:string;onRemove?:(id:string)=>void;disabled?:boolean
}){
  const headingId=useId()
  return <section className={'selected-tool-outline '+className} aria-labelledby={headingId}>
    <h4 id={headingId}>{heading}</h4>
    <p>仅展示当前配置，不代表强制作答顺序；各工具按原有规则运行。</p>
    {items===undefined?<p role="status">工具明细暂不可用，请重新读取任务详情。</p>:items.length===0
      ?<p>尚未配置工具。</p>:<ul>{items.map(item=><li key={item.id}>
        <strong>{item.title}</strong>
        <span>{item.kind} · 固定版本：{item.version}</span>{onRemove&&<button type="button" disabled={disabled} onClick={()=>onRemove(item.id)}>移除 {item.title}</button>}
      </li>)}</ul>}
  </section>
}
