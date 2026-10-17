import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ResearchDraft } from './builder.types'

type Instrument=Pick<ResearchDraft,'id'|'kind'|'title'|'instrumentKey'|'revision'|'status'|'updatedAt'>
type Snapshot={list:Instrument[];error:string;loading:boolean;revision:number;loaded:boolean}
type Entry={snapshot:Snapshot;listeners:Set<()=>void>;request?:Promise<void>;generation:number}

// Owned by one mounted project workspace, never shared across sessions. Only
// pages being viewed are retained; a mutation refreshes every live page once.
export function createInstrumentLibrary(projectId:string){
  const entries=new Map<number,Entry>()
  let revision=0
  const entry=(page:number)=>{
    let found=entries.get(page)
    if(!found){
      found={snapshot:{list:[],error:'',loading:false,revision,loaded:false},listeners:new Set(),generation:0}
      entries.set(page,found)
    }
    return found
  }
  const notify=(target:Entry,patch:Partial<Snapshot>)=>{
    target.snapshot={...target.snapshot,...patch}
    target.listeners.forEach(listener=>listener())
  }
  const load=(page:number,force=false):Promise<void>=>{
    const target=entry(page)
    if(!force&&target.request)return target.request
    const generation=++target.generation
    notify(target,{loading:true,error:'',revision})
    const request=(async()=>{
      try{
        await Promise.resolve()
        const response=await fetch('/api/survey/projects/'+encodeURIComponent(projectId)+'/instruments?page='+page,{
          method:'GET',headers:{'Content-Type':'application/json'},credentials:'same-origin',
        })
        const result=await response.json() as {code:number|string;message?:string;data:{list:Instrument[]}|null}
        if(!response.ok||result.code!==0||!result.data)throw new Error(result.message||'研究工具列表无法加载')
        if(target.generation===generation)notify(target,{list:result.data.list,error:'',loading:false,loaded:true})
      }catch(error){
        if(target.generation===generation)notify(target,{error:error instanceof Error?error.message:'研究工具列表无法加载',loading:false})
        throw error
      }finally{
        if(target.generation===generation)target.request=undefined
      }
    })()
    target.request=request
    return request
  }
  return {
    snapshot:(page:number)=>entry(page).snapshot,
    subscribe(page:number,listener:()=>void){
      const target=entry(page)
      target.listeners.add(listener)
      // A second consumer (including StrictMode's setup replay) joins the same
      // live result/request. Errors remain retryable rather than cached success.
      if(!target.request&&!target.snapshot.loading&&!target.snapshot.loaded&&!target.snapshot.error){
        void load(page).catch(()=>{})
      }
      return()=>{
        target.listeners.delete(listener)
        queueMicrotask(()=>{
          if(!target.listeners.size&&entries.get(page)===target)entries.delete(page)
        })
      }
    },
    load,
    async changed(page:number){
      revision++
      for(const current of entries.keys()){
        if(current!==page)void load(current,true).catch(()=>{})
      }
      // Other consumers surface their own errors. A failed secondary page
      // must not turn an acknowledged create/import into an apparent failure.
      await load(page,true)
    },
  }
}
export type InstrumentLibrary=ReturnType<typeof createInstrumentLibrary>

export function useInstrumentLibrary(projectId:string,shared?:InstrumentLibrary){
  const library=useMemo(()=>shared??createInstrumentLibrary(projectId),[projectId,shared])
  const [position,setPosition]=useState({library,page:1})
  const page=position.library===library?position.page:1
  const navigation=useRef(0)
  useEffect(()=>{const counter=navigation;counter.current++;return()=>{counter.current++}},[library])
  const subscribe=useCallback((listener:()=>void)=>library.subscribe(page,listener),[library,page])
  const snapshot=useCallback(()=>library.snapshot(page),[library,page])
  const state=useSyncExternalStore(subscribe,snapshot)
  const refresh=useCallback(async(nextPage=1,changed=false)=>{
    const current=++navigation.current
    if(changed){setPosition({library,page:nextPage});await library.changed(nextPage)}
    else if(nextPage===page||library.snapshot(nextPage).error)await library.load(nextPage)
    else {
      // Navigating to a page already displayed by the other consumer reuses
      // its live result; otherwise start its first request.
      const next=library.snapshot(nextPage)
      if(!next.loaded&&!next.loading)await library.load(nextPage)
      else if(next.loading)await library.load(nextPage)
    }
    if(current===navigation.current)setPosition({library,page:nextPage})
  },[library,page])
  return {...state,page,refresh}
}
