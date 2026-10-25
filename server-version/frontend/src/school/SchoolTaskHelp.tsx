import {useEffect,useId,useRef,useState,type ReactNode} from 'react'
import {Info} from 'lucide-react'

export function SchoolTaskHelp({children,label='观察任务与隐私说明',buttonText='任务说明'}:{children:ReactNode;label?:string;buttonText?:string}){
  const [open,setOpen]=useState(false)
  const root=useRef<HTMLDivElement>(null),toggle=useRef<HTMLButtonElement>(null),id=useId()
  useEffect(()=>{
    if(!open)return
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)}
    const close=()=>setOpen(false)
    document.addEventListener('pointerdown',outside)
    document.addEventListener('scroll',close,true)
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('scroll',close,true)}
  },[open])
  return <div ref={root} className="hs-teacher-task-help" onMouseLeave={()=>setOpen(false)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOpen(false)}} onKeyDown={event=>{if(event.key==='Escape'){setOpen(false);toggle.current?.focus()}}}>
    <button ref={toggle} type="button" aria-label={label} aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(value=>!value)}><Info size={16} aria-hidden="true"/>{buttonText}</button>
    {open&&<div id={id} className="hs-teacher-task-help-content" role="note" aria-label={label}>{children}</div>}
  </div>
}

