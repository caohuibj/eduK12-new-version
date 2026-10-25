import {useEffect,useId,useRef,useState,type ReactNode} from 'react'
import {LayoutGrid,List,Search,X} from 'lucide-react'
export type SchoolCollectionView='list'|'cards'
export function SchoolCollectionControls({query,onQuery,sort,onSort,view,onView,searchLabel,placeholder,sorts,actions}:{
 query:string;onQuery:(value:string)=>void;sort:string;onSort:(value:string)=>void;view:SchoolCollectionView;onView:(value:SchoolCollectionView)=>void
 searchLabel:string;placeholder:string;sorts:readonly {value:string;label:string}[];actions?:ReactNode
}){
 const [draft,setDraft]=useState(query),[open,setOpen]=useState(false)
 const id=useId(),input=useRef<HTMLInputElement>(null),toggle=useRef<HTMLButtonElement>(null)
 useEffect(()=>setDraft(query),[query])
 useEffect(()=>{if(open)input.current?.focus()},[open])
 return <>
  <div className="hs-collection-options"><label><span>排序</span><select aria-label="排序" value={sort} onChange={event=>onSort(event.target.value)}>{sorts.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
   <div className="hs-collection-views" role="group" aria-label="显示方式"><button type="button" aria-label="列表视图" title="列表视图" aria-pressed={view==='list'} onClick={()=>onView('list')}><List size={18} aria-hidden="true"/></button><button type="button" aria-label="卡片视图" title="卡片视图" aria-pressed={view==='cards'} onClick={()=>onView('cards')}><LayoutGrid size={18} aria-hidden="true"/></button></div>
   <div className="hs-collection-actions"><button ref={toggle} type="button" className="hs-collection-search-toggle" aria-label={searchLabel} title={searchLabel} aria-expanded={open} aria-controls={open?id:undefined} data-filtered={Boolean(query)} onClick={()=>setOpen(value=>!value)}><Search size={18} aria-hidden="true"/></button>{actions}</div>
  </div>
  {open&&<form id={id} role="search" className="hs-collection-search" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();setOpen(false);toggle.current?.focus()}}} onSubmit={event=>{event.preventDefault();onQuery(draft.trim())}}><Search size={18} aria-hidden="true"/><input ref={input} type="search" aria-label={searchLabel} placeholder={placeholder} value={draft} onChange={event=>setDraft(event.target.value)}/>{(draft||query)&&<button type="button" aria-label="清空检索" onClick={()=>{setDraft('');onQuery('')}}><X size={17} aria-hidden="true"/></button>}<button type="submit">检索</button></form>}
 </>
}
