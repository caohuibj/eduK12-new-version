import {useEffect,useRef,useState} from 'react'
import {ArrowRight,BookOpen,ClipboardList,Menu,MessageSquareText,RefreshCw} from 'lucide-react'
import type {SchoolApi} from './SchoolRecovery'
import type {SchoolTask,TaskPage} from './SchoolStudentTasks'
import {SchoolCollectionControls,type SchoolCollectionView} from './SchoolCollectionControls'
import {schoolSearchText,schoolDeadline} from './school-collection'
import {workspaceHref,type SchoolNavigationItem} from './school-navigation'
import './school-learner.css'

export function SchoolLearnerMenu({items,onNavigate}:{items:SchoolNavigationItem[];onNavigate:(id:string)=>void}){
 const menu=useRef<HTMLDetailsElement>(null)
 const available=items.filter(item=>!['overview','account'].includes(item.id))
 if(!available.length)return null
 return <details className="hs-learner-menu" ref={menu} onKeyDown={event=>{if(event.key==='Escape'&&menu.current){menu.current.open=false;menu.current.querySelector('summary')?.focus()}}}>
  <summary aria-label="校园功能" title="校园功能"><Menu size={20} aria-hidden="true"/></summary>
  <div className="hs-learner-menu-links" aria-label="校园功能入口">{available.map(item=><a key={item.id} href={workspaceHref(item.id)} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();if(menu.current)menu.current.open=false;onNavigate(item.id)}}><item.icon size={18} aria-hidden="true"/>{item.label}</a>)}</div>
 </details>
}

const labels:Record<SchoolTask['kind'],string>={READING:'阅读',ASSIGNMENT:'练习',CHECKIN:'打卡',MEASUREMENT:'问卷与测评'}
export function SchoolLearnerHome({api,username,items,onNavigate}:{api:SchoolApi;username:string;items:SchoolNavigationItem[];onNavigate:(id:string,activityId?:string)=>void}){
 const [result,setResult]=useState<TaskPage|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0)
 const [query,setQuery]=useState(''),[sort,setSort]=useState('recommended'),[view,setView]=useState<SchoolCollectionView>('list')
 const canReadTasks=items.some(item=>item.id==='tasks')
 useEffect(()=>{
  if(!canReadTasks)return
  let live=true
  setLoading(true);setError('');setResult(null)
  void api<TaskPage>('/my/activity-tasks?page=1&pageSize=25').then(data=>{if(live)setResult(data)}).catch(cause=>{if(live)setError(cause instanceof Error?cause.message:'校园活动暂时无法读取')}).finally(()=>{if(live)setLoading(false)})
  return()=>{live=false}
 },[api,canReadTasks,retry])
 const activities=new Map<string,{id:string;title:string;tasks:SchoolTask[]}>()
 for(const task of result?.list??[]){const group=activities.get(task.activityId)??{id:task.activityId,title:task.activityTitle,tasks:[]};group.tasks.push(task);activities.set(task.activityId,group)}
 const partial=Boolean(result&&(result.hasMore||result.truncated||result.total>result.list.length))
 const shown=[...activities.values()].filter(group=>schoolSearchText(group.title+' '+group.tasks.map(task=>task.title).join(' ')).includes(schoolSearchText(query))).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'zh-CN',{numeric:true}):sort==='deadline'?(Math.min(...a.tasks.map(task=>schoolDeadline(task.deadline)))-Math.min(...b.tasks.map(task=>schoolDeadline(task.deadline))))||0:0)
 const navigate=(event:React.MouseEvent<HTMLAnchorElement>,id:string,activityId?:string)=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();if(activityId)onNavigate(id,activityId);else onNavigate(id)}
 return <div className="hs-learner-home">
  <header className="hs-learner-home-header"><div><h1>我的校园</h1><p>你好，{username}。选择校园活动，继续今天的参与。</p></div>
   <div className="hs-learner-shortcuts">{items.filter(item=>['tasks','feedback'].includes(item.id)).map(item=><a key={item.id} className={'hs-learner-shortcut hs-learner-shortcut--'+item.id} href={workspaceHref(item.id)} onClick={event=>navigate(event,item.id)}>
    <span className="hs-learner-shortcut-icon">{item.id==='tasks'?<ClipboardList size={22}/>:<MessageSquareText size={22}/>}</span>
    <span className="hs-learner-shortcut-copy"><strong>{item.id==='tasks'?'校园任务':'反馈与结果'}</strong><small>{item.id==='tasks'?'阅读、练习、打卡与问卷':'查看学校向你开放的反馈'}</small></span>
    {item.id==='tasks'&&<span className="hs-learner-shortcut-count">{result?.total??'—'}<small>项</small></span>}<ArrowRight size={17} aria-hidden="true"/>
   </a>)}</div>
  </header>
  <section aria-labelledby="hs-learner-activities"><div className="hs-learner-section-heading"><h2 id="hs-learner-activities">校园活动</h2>{result?<SchoolCollectionControls query={query} onQuery={setQuery} sort={sort} onSort={setSort} view={view} onView={setView} searchLabel={partial?'检索已加载的活动':'检索校园活动'} placeholder="搜索活动名称或任务名称" sorts={[{value:'recommended',label:'默认顺序'},{value:'deadline',label:'最早任务截止优先'},{value:'title',label:'活动名称 A–Z'}]} actions={<button type="button" disabled={loading} onClick={()=>setRetry(value=>value+1)} aria-label="刷新校园活动"><RefreshCw size={17} aria-hidden="true"/></button>}/>:<button type="button" disabled={loading} onClick={()=>setRetry(value=>value+1)} aria-label="刷新校园活动"><RefreshCw size={17} aria-hidden="true"/></button>}</div>
   {result&&<><p className="hs-collection-summary" role="status">{query?`检索到 ${shown.length} 组活动 · “${query}”`:`${activities.size} 组活动`}{partial?' · 检索和排序仅作用于已加载的任务所对应的活动':''}</p></>}
   {loading&&canReadTasks?<p className="hs-learner-state" role="status">正在读取校园活动…</p>:error?<div className="hs-learner-state" role="alert"><h3>校园活动暂时无法显示</h3><p>{error}</p><button onClick={()=>setRetry(value=>value+1)}>重新读取</button></div>:activities.size===0?<div className="hs-learner-state"><BookOpen size={26} aria-hidden="true"/><h3>暂时没有开放的活动任务</h3><p>学校安排并开放给你的活动会显示在这里。</p></div>:
    <div className={"hs-learner-activities"+(view==='cards'?' hs-learner-activities--cards':'')}>{shown.map((group,index)=>{const href=new URL(workspaceHref('tasks'),window.location.origin);href.searchParams.set('activityId',group.id);return <a className="hs-learner-activity" href={href.pathname+href.search} onClick={event=>navigate(event,'tasks',group.id)} key={group.id}>
     <div className={'hs-learner-activity-art hs-learner-activity-art--'+index%3} aria-hidden="true"><span><BookOpen size={16}/>校园活动</span></div>
     <div className="hs-learner-activity-copy"><span className="hs-learner-open">已开放</span><h3>{group.title}</h3><p>{[...new Set(group.tasks.map(task=>labels[task.kind]))].join(' · ')}</p><span className="hs-learner-activity-bottom"><span>查看活动任务</span><ArrowRight size={18} aria-hidden="true"/></span></div>
    </a>})}</div>}
   {result&&activities.size>0&&shown.length===0&&<p className="hs-collection-empty">没有匹配的已加载活动，请尝试其他关键词。</p>}
   {partial&&<p className="hs-learner-partial">这里根据当前加载的任务展示活动。<a href={workspaceHref('tasks')} onClick={event=>navigate(event,'tasks')}>进入完整任务清单</a></p>}
  </section>
 </div>
}
