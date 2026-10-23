import {useCallback,useEffect,useState} from 'react'

export type FormPendingChange=(id:string,pending:boolean)=>void
export function useFormBulkDraft(id:string,onPendingChange?:FormPendingChange,initialText=''){
  const [text,setText]=useState(initialText)
  const [mode,setMode]=useState<'append'|'replace'>('append'),[coded,setCoded]=useState(false)
  useEffect(()=>{onPendingChange?.(id,!!initialText.trim());return()=>onPendingChange?.(id,false)},[id,onPendingChange,initialText])
  const update=(next:string)=>{setText(next);onPendingChange?.(id,!!next.trim())}
  return {text,update,mode,setMode,coded,setCoded,pending:!!text.trim()}
}

/** Aggregates independent option/row buffers without one clearing the other's warning. */
export function useFormPendingBuffers(){
  const [pending,setPending]=useState<Record<string,boolean>>({})
  const onPendingChange=useCallback<FormPendingChange>((id,next)=>setPending(current=>{
    if(next)return current[id]?current:{...current,[id]:true}
    if(!current[id])return current
    const copy={...current};delete copy[id];return copy
  }),[])
  const hasPending=Object.keys(pending).length>0
  const clear=()=>setPending({})
  useEffect(()=>{
    if(!hasPending)return
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
    window.addEventListener('beforeunload',warn)
    return()=>window.removeEventListener('beforeunload',warn)
  },[hasPending])
  return {hasPending,onPendingChange,clear}
}
