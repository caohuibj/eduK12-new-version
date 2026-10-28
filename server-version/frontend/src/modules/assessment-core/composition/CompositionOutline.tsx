import {ArrowDown,ArrowUp,Layers,Trash2} from 'lucide-react'
import type {ReactNode} from 'react'
export type CompositionOutlineItem={id:string;title:string;detail:string}
/** Pure ordered editing shared by product adapters. No catalog, authority,
 * version selection, persistence, scoring or package creation lives here. */
export function CompositionOutline({items,max,onMove,onRemove,disabled=false,footer,renderItemEditor}:{items:CompositionOutlineItem[];max:number;
 onMove:(index:number,offset:number)=>void;onRemove:(index:number)=>void;disabled?:boolean;footer:string;
 renderItemEditor?:(item:CompositionOutlineItem,index:number)=>ReactNode}){
 return <aside className="survey-composition-outline" aria-label="作答顺序">
  <header className="survey-composition-step"><span>03</span><div><h2>作答顺序</h2><p>从上到下依次呈现，使用箭头调整。</p></div><small aria-live="polite" aria-atomic="true">{items.length} / {max} 项</small></header>
  {!items.length?<div className="survey-composition-empty"><Layers size={28}/><h3>从第一个工具开始</h3><p>添加后的工具会出现在这里，再按被试作答顺序排列。</p></div>:<ol>{items.map((item,index)=><li key={item.id}>
   <span className="survey-composition-position">{String(index+1).padStart(2,'0')}</span><div><strong>{item.title||'已选工具'}</strong><small>{item.detail}</small>{renderItemEditor?.(item,index)}</div>
   <div className="survey-composition-outline-actions"><button type="button" aria-label={'上移工具 '+(index+1)} disabled={disabled||index===0} onClick={()=>onMove(index,-1)}><ArrowUp size={16}/></button>
    <button type="button" aria-label={'下移工具 '+(index+1)} disabled={disabled||index===items.length-1} onClick={()=>onMove(index,1)}><ArrowDown size={16}/></button>
    <button type="button" aria-label={'移除工具 '+(index+1)} disabled={disabled} onClick={()=>onRemove(index)}><Trash2 size={16}/></button></div>
  </li>)}</ol>}
  {items.length>=max&&<p role="status" className="survey-composition-limit">已达到 {max} 项上限，移除一项后可继续添加。</p>}
  <div className="survey-composition-outline-note"><strong>各项分别计分与反馈</strong><p>{footer}</p></div>
 </aside>
}
