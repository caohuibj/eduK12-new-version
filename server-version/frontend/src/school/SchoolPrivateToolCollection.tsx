import type {ReactNode} from 'react'
import {ArrowRight,RefreshCw} from 'lucide-react'
import {SchoolCollectionControls,type SchoolCollectionView} from './SchoolCollectionControls'
import {schoolSearchText} from './school-collection'
import type {PrivateToolSummary} from '../components/education-tools/privateToolClient'
export type SchoolPrivateToolControls={query:string;sort:string;view:SchoolCollectionView}
const kindLabel=(item:PrivateToolSummary)=>item.kind==='SCALE'?'量表':'表单'
const modified=(item:PrivateToolSummary)=>{const time=Date.parse(item.updatedAt??'');return Number.isFinite(time)?time:null}
export function SchoolPrivateToolCollection({items,hasMore,busy,error,controls,onControls,onRefresh,onMore,onSelect,createControl,helpControl,uncertainCreate}:{
 items:PrivateToolSummary[];hasMore:boolean;busy:boolean;error:string;controls:SchoolPrivateToolControls;onControls:(value:SchoolPrivateToolControls)=>void
 onRefresh:()=>void;onMore:()=>void;onSelect:(id:string)=>void;createControl:ReactNode;helpControl:ReactNode;uncertainCreate:boolean
}){
 const query=schoolSearchText(controls.query.trim())
 const shown=items.filter(item=>schoolSearchText(`${item.title} ${kindLabel(item)}`).includes(query)).slice().sort((a,b)=>{
  if(controls.sort==='title')return a.title.localeCompare(b.title,'zh-CN',{numeric:true})
  if(controls.sort==='title-desc')return b.title.localeCompare(a.title,'zh-CN',{numeric:true})
  if(controls.sort==='kind')return kindLabel(a).localeCompare(kindLabel(b),'zh-CN')||a.title.localeCompare(b.title,'zh-CN',{numeric:true})
  const left=modified(a),right=modified(b)
  if(left===null||right===null)return left===right?0:left===null?1:-1
  return controls.sort==='oldest'?left-right:right-left
 })
 return <div className="education-private-catalog">
  <div className="education-private-catalog-toolbar"><p className="hs-collection-summary" role="status">{!items.length&&busy?'正在读取工具…':!items.length&&error?'工具暂不可用':query?`找到 ${shown.length} 项工具`:`${items.length} 项工具`}</p>
   <SchoolCollectionControls query={controls.query} onQuery={query=>onControls({...controls,query})} sort={controls.sort} onSort={sort=>onControls({...controls,sort})} view={controls.view} onView={view=>onControls({...controls,view})} searchLabel={hasMore?'检索已加载的工具':'检索工具'} placeholder="搜索工具名称或类型（量表／表单）" sorts={[{value:'updated',label:'最近更新优先'},{value:'oldest',label:'最早更新优先'},{value:'title',label:'名称 A–Z'},{value:'title-desc',label:'名称 Z–A'},{value:'kind',label:'工具类型'}]} actions={<button type="button" aria-label="重新读取列表" title="刷新工具列表" disabled={busy} onClick={onRefresh}><RefreshCw size={18} aria-hidden="true"/></button>}/>
   <div className="education-private-catalog-commands">{helpControl}{createControl}</div>
  </div>
  {hasMore&&<p className="education-private-catalog-limit">还有更多工具未加载；检索和排序仅作用于已加载的 {items.length} 项。</p>}
  {busy&&items.length>0&&<p role="status">正在读取工具…</p>}
  {uncertainCreate&&<p role="alert">创建结果尚未确认，已暂停重复创建。请重新读取列表，核对是否已有本次工具，再决定是否创建。</p>}
  {!busy&&!error&&!shown.length&&<p>{query?'没有找到匹配的工具，请调整或清空检索。':'暂无私有工具，可先创建一份量表或表单。'}</p>}
  <div className={'education-private-list'+(controls.view==='cards'?' education-private-list--cards':'')} role="list" aria-label="我的工具列表">{shown.map(item=><article key={item.id} role="listitem"><div><h3>{item.title}</h3><p>{kindLabel(item)} · 修订 {item.revision}{modified(item)!==null&&<> · <time dateTime={item.updatedAt}>{new Date(item.updatedAt!).toLocaleDateString('zh-CN')}</time>更新</>}</p></div><button type="button" disabled={busy} aria-label={'编辑 '+item.title} onClick={()=>onSelect(item.id)}>编辑<ArrowRight size={16} aria-hidden="true"/></button></article>)}</div>
  {hasMore&&<button type="button" className="education-private-load-more" disabled={busy} onClick={onMore}>加载更多工具</button>}
 </div>
}
