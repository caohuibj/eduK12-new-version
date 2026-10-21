import { Search, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import './training-catalog-controls.css'

export type CatalogSelection={search:string;tags:string;from:string;to:string;dateField:string;page:number;pageSize:number}
export function CatalogFilters({selection,onApply,deadline=false,label='内容'}:{selection:CatalogSelection;onApply:(value:CatalogSelection)=>void;deadline?:boolean;label?:string}) {
 const [draft,setDraft]=useState(selection)
 const change=(key:keyof CatalogSelection,value:string|number)=>setDraft(previous=>({...previous,[key]:value}))
 const active=Boolean(selection.search||selection.tags||selection.from||selection.to)
 return <details className="training-catalog-disclosure"><summary><Search size={16} aria-hidden="true"/><strong>检索与筛选</strong>{active&&<span>已应用筛选</span>}<small>标题 · 标签 · 时间</small><ChevronDown size={15} aria-hidden="true"/></summary><form className="training-catalog-filter" aria-label={`${label}检索`} onSubmit={event=>{event.preventDefault();onApply({...draft,page:1})}}>
  <label className="catalog-title-search">标题<input type="search" aria-label={`搜索${label}`} placeholder={`输入${label}标题`} maxLength={200} value={draft.search} onChange={e=>change('search',e.target.value)}/></label>
  <label>标签（全部匹配）<input placeholder="多个标签用逗号分隔" maxLength={209} value={draft.tags} onChange={e=>change('tags',e.target.value)}/></label>
  <label>时间依据<select value={draft.dateField} onChange={e=>change('dateField',e.target.value)}><option value="created">创建时间</option>{deadline&&<option value="deadline">截止时间</option>}</select></label>
  <label>开始日期<input type="date" value={draft.from} max={draft.to||undefined} onChange={e=>change('from',e.target.value)}/></label>
  <label>结束日期<input type="date" value={draft.to} min={draft.from||undefined} onChange={e=>change('to',e.target.value)}/></label>
  <div className="catalog-filter-actions"><button type="submit">查询</button><button type="button" onClick={()=>{const value={search:'',tags:'',from:'',to:'',dateField:'created',page:1,pageSize:selection.pageSize};setDraft(value);onApply(value)}}>清除筛选</button></div>
  <small>筛选所有记录；日期按当前设备时区，包含结束日。点击“查询”后更新。</small>
 </form></details>
}
export function CatalogPagination({selection,onApply,total,loading,label='内容'}:{selection:CatalogSelection;onApply:(value:CatalogSelection)=>void;total:number;loading:boolean;label?:string}) {
 return <nav className="training-catalog-pagination" aria-label={`${label}分页`}><label>每页<select aria-label="每页数量" value={selection.pageSize} onChange={e=>onApply({...selection,pageSize:Number(e.target.value),page:1})}>{[10,20,50].map(size=><option key={size} value={size}>{size} 条</option>)}</select></label><span role="status">共 {total} 条 · 第 {selection.page} / {Math.max(1,Math.ceil(total/selection.pageSize))} 页</span><button type="button" disabled={loading||selection.page===1} onClick={()=>onApply({...selection,page:selection.page-1})}>上一页</button><button type="button" disabled={loading||selection.page*selection.pageSize>=total||selection.page>=500} onClick={()=>onApply({...selection,page:selection.page+1})}>下一页</button>{selection.page>=500&&<small>请缩小筛选范围以继续查找。</small>}</nav>
}
