import {useState,type ReactNode} from 'react'
import {ArrowLeft,ArrowRight,RefreshCw} from 'lucide-react'
import {SchoolCollectionControls,type SchoolCollectionView} from './SchoolCollectionControls'
import {schoolSearchText} from './school-collection'

type Activity={courseId:string;title:string;purpose:string;status:string;participantCount:number;runCount:number}
const states:Record<string,string>={DRAFT:'准备中',SUBMITTED:'学校审核中',OPEN:'已开放',PAUSED:'已暂停',CLOSED:'已结束'}
const purposes:Record<string,string>={STUDENT_WELLBEING:'学生心理健康',LEARNING_ADAPTATION:'学习适应',SCHOOL_CLIMATE:'学校氛围与关系',FAMILY_SUPPORT:'家庭与学校支持'}
const rank=['DRAFT','SUBMITTED','OPEN','PAUSED','CLOSED']
export function SchoolActivityCollection({items,selectedId,busy,loading,error,hasMore,onRefresh,onMore,onSelect,createControl,helpControl}:{items:Activity[];selectedId?:string;busy:boolean;loading:boolean;error:string;hasMore:boolean;onRefresh:()=>void;onMore:()=>void;onSelect:(id:string)=>void;createControl:ReactNode;helpControl?:ReactNode}){
 const [query,setQuery]=useState(''),[sort,setSort]=useState('default'),[view,setView]=useState<SchoolCollectionView>('list')
 const shown=items.filter(item=>schoolSearchText([item.title,purposes[item.purpose]??item.purpose,states[item.status]??item.status].join(' ')).includes(schoolSearchText(query))).slice().sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'zh-CN',{numeric:true}):sort==='status'?rank.indexOf(a.status)-rank.indexOf(b.status):sort==='participants'?b.participantCount-a.participantCount:0)
 return <div className="hs-activity-catalog">
  <header className="hs-activity-catalog-heading"><h3>活动列表</h3><div className="hs-activity-catalog-heading-actions">{helpControl}{createControl}</div></header>
  {selectedId&&<button type="button" className="hs-activity-back" disabled={busy} onClick={()=>onSelect('')}><ArrowLeft size={16} aria-hidden="true"/>返回活动列表</button>}
  {error&&<p role="alert" className="hs-alert">{error}</p>}
  <div className="hs-activity-catalog-index" hidden={Boolean(selectedId)}>
   <div className="hs-activity-catalog-toolbar"><p className="hs-collection-summary">{!items.length&&loading?'活动目录':!items.length&&error?'活动目录暂不可用':query?`找到 ${shown.length} 项活动`:`${items.length} 项活动`}</p><SchoolCollectionControls query={query} onQuery={setQuery} sort={sort} onSort={setSort} view={view} onView={setView} searchLabel={hasMore?'检索已加载的活动':'检索活动'} placeholder="搜索活动名称、主题或状态" sorts={[{value:'default',label:'默认顺序'},{value:'title',label:'活动名称 A–Z'},{value:'status',label:'活动状态'},{value:'participants',label:'授权人数由多到少'}]} actions={<button type="button" aria-label="刷新活动列表" title="刷新活动列表" disabled={busy||loading} onClick={onRefresh}><RefreshCw size={18} aria-hidden="true"/></button>}/></div>
   {loading&&<p role="status">{items.length?'正在读取活动…':'正在加载活动列表…'}</p>}
   {hasMore&&<p className="hs-activity-catalog-limit">还有更多活动未加载；检索和排序仅作用于已加载的 {items.length} 项。</p>}
   {!loading&&!error&&shown.length===0&&<p className="hs-collection-empty">{query?'没有找到匹配的活动，请调整检索。':'目前没有可管理的活动。'}</p>}
   <div className={'hs-activity-catalog-list'+(view==='cards'?' hs-activity-catalog-list--cards':'')} role="list" aria-label="活动管理列表">{shown.map(item=><article key={item.courseId} className="hs-activity-catalog-item" role="listitem"><div><span className="hs-activity-catalog-purpose">{purposes[item.purpose]??item.purpose}</span><h4>{item.title}</h4>{items.some(other=>other.courseId!==item.courseId&&other.title===item.title)&&<span className="hs-activity-catalog-identity">编号 {item.courseId.slice(0,8)}</span>}</div><span className="hs-activity-catalog-state">{states[item.status]??item.status}</span><p className="hs-activity-catalog-counts"><span>授权学生 {item.participantCount} 人</span><span>测评 {item.runCount} 项</span></p><button type="button" disabled={busy} aria-label={'配置活动：'+item.title} onClick={()=>onSelect(item.courseId)}>配置活动<ArrowRight size={16} aria-hidden="true"/></button></article>)}</div>
   {hasMore&&<button type="button" className="hs-activity-load-more" disabled={busy||loading} onClick={onMore}>加载更多活动</button>}
  </div>
 </div>
}
