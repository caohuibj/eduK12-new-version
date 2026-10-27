import {createContext,useCallback,useContext,useEffect,useId,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react'
import {createPortal} from 'react-dom'
import {ArrowLeft} from 'lucide-react'

type PageContext={scope:string;target:HTMLDivElement|null;activeId:string|undefined;activate:(id:string)=>void;deactivate:(id:string)=>void}
const Context=createContext<PageContext|null>(null)
/** Keep list controllers and drafts mounted while presenting one accessible content page. */
export function TeacherAssessmentProvider({children,onActiveChange,scope='ht-personal-tasks'}:{children:ReactNode;onActiveChange:(active:boolean)=>void;scope?:string}){
 const [target,setTarget]=useState<HTMLDivElement|null>(null),[pages,setPages]=useState<string[]>([])
 const activeId=pages[pages.length-1]
 const activate=useCallback((id:string)=>setPages(old=>old.includes(id)?old:[...old,id]),[])
 const deactivate=useCallback((id:string)=>setPages(old=>old.includes(id)?old.filter(value=>value!==id):old),[])
 const context=useMemo(()=>({scope,target,activeId,activate,deactivate}),[scope,target,activeId,activate,deactivate])
 useLayoutEffect(()=>{
  onActiveChange(Boolean(activeId))
  if(activeId){target?.querySelector<HTMLElement>('[data-teacher-assessment-page]:not([hidden])')?.focus({preventScroll:true});target?.scrollIntoView?.({block:'start'})}
 },[activeId,target,onActiveChange])
 useEffect(()=>()=>onActiveChange(false),[onActiveChange])
 return <Context.Provider value={context}>{children}<div ref={setTarget} className="ht-workspace ht-assessment-page-host" hidden={!activeId}/></Context.Provider>
}
export function TeacherAssessmentPage({children,title,kind,onBack,showTitle=true,busy=false,scope='ht-personal-tasks'}:{children:ReactNode;title:string;kind:'answer'|'feedback'|'practice';onBack?:()=>void;showTitle?:boolean;busy?:boolean;scope?:string}){
 const context=useContext(Context),id=useId(),page=useRef<HTMLElement>(null)
 const activate=context?.activate,deactivate=context?.deactivate,activeScope=context?.scope
 useLayoutEffect(()=>{if(!activate||!deactivate||activeScope!==scope)return;activate(id);return()=>deactivate(id)},[activate,deactivate,id,activeScope,scope])
 if(!context)return <>{children}</>
 if(!context.target)return null
 return createPortal(<section ref={page} data-teacher-assessment-page="" hidden={activeScope!==scope||context.activeId!==id} className={'ht-panel ht-assessment-page ht-assessment-page--'+kind} tabIndex={-1} role="region" aria-label={kind==='feedback'?'个人反馈详情':kind==='practice'?'专业实践独立页面':'测评独立作答页'}>
  <header className="ht-assessment-page-toolbar">{onBack&&<button type="button" disabled={busy} onClick={onBack}><ArrowLeft size={17} aria-hidden="true"/>{kind==='practice'?'返回专业实践':'返回测评列表'}</button>}<span>{kind==='feedback'?'个人反馈 · 只读结果':kind==='practice'?'专业实践':'测评作答'}</span></header>
  {showTitle&&<h1>{title}</h1>}
  {kind==='feedback'&&<p className="ht-muted">以下是本次已完成测评获准展示的结果，无需填写或提交。</p>}
  {children}
 </section>,context.target)
}
