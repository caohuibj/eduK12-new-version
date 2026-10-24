import {createElement,useEffect,useState,type ComponentType} from 'react'

/** Share code downloads, not researcher data. A failed optional chunk must not
 * reach the app boundary and discard an already edited parent draft. */
export function deferredResearcherComponent<P extends object>(load:()=>Promise<ComponentType<P>>,label:string){
  let resolved:ComponentType<P>|undefined
  let pending:Promise<ComponentType<P>>|undefined
  const prepare=()=>pending??=load().then(value=>(resolved=value)).catch(error=>{
    pending=undefined
    throw error
  })
  return function DeferredResearcherComponent(props:P){
    const [Component,setComponent]=useState(()=>resolved)
    const [failed,setFailed]=useState(false),[revision,setRevision]=useState(0)
    useEffect(()=>{
      let current=true
      if(!Component){
        setFailed(false)
        void prepare().then(value=>{if(current)setComponent(()=>value)})
          .catch(()=>{if(current)setFailed(true)})
      }
      return()=>{current=false}
    },[Component,revision])
    if(Component)return createElement(Component,props)
    return failed
      ? <div role="alert"><p>{label}加载失败，当前页面内容仍保留。</p><button type="button" className="btn-secondary" onClick={()=>setRevision(value=>value+1)}>重试{label}</button></div>
      : <p role="status">正在加载{label}…</p>
  }
}
