import {useEffect,useId,useRef,useState,type ReactNode} from 'react'
import {ChevronDown,RefreshCw,SlidersHorizontal} from 'lucide-react'

/** Presentation-only tools; each resource view retains its existing filtering and API contracts. */
export default function TrainingResourceTools({searchLabel,refreshLabel,busy,loading,onRefresh,onReset,children}:{
 searchLabel:string;refreshLabel:string;busy:boolean;loading:boolean;onRefresh:()=>void;onReset:()=>void;children:ReactNode
}){
 const [open,setOpen]=useState(false)
 const anchor=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLElement>(null)
 const id=useId()
 useEffect(()=>{
  if(!open)return
  panel.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
  const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!anchor.current?.contains(event.target))setOpen(false)}
  document.addEventListener('pointerdown',outside)
  return()=>document.removeEventListener('pointerdown',outside)
 },[open])
 const close=()=>{setOpen(false);trigger.current?.focus()}
 return <div className="training-account-list-tools training-resource-view-tools">
  <div ref={anchor} className="training-account-filter-anchor training-resource-filter-anchor"
   onKeyDown={event=>{if(event.key==='Escape'&&open){event.preventDefault();close()}}}
   onBlur={event=>{if(event.relatedTarget instanceof Node&&!event.currentTarget.contains(event.relatedTarget))setOpen(false)}}>
   <button ref={trigger} type="button" className="training-accounts-secondary training-supervision-filter-toggle" disabled={busy} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}><SlidersHorizontal size={16} aria-hidden="true"/>{searchLabel}<ChevronDown size={15} aria-hidden="true"/></button>
   {open&&<section ref={panel} id={id} aria-label={searchLabel} className="training-account-filter-popover training-resource-record-popover">
    {children}
    <p className="training-resource-filter-hint">筛选结果即时更新</p>
    <div className="training-supervision-filter-actions"><button type="button" className="training-accounts-primary" disabled={busy} onClick={close}>完成</button><button type="button" className="training-accounts-secondary" disabled={busy} onClick={onReset}>重置</button></div>
   </section>}
  </div>
  <button type="button" className="training-accounts-secondary" aria-label={refreshLabel} disabled={busy||loading} onClick={onRefresh}><RefreshCw size={16} aria-hidden="true"/>刷新</button>
 </div>
}
