import {createElement,useEffect,useState,type ComponentType} from 'react'

/** Cache presentation code only. Catch download failures here, not child render
 * errors, so an optional chunk cannot discard the parent's draft or list. */
export function createRetryableLazy<P extends object>(
  load:()=>Promise<{default:ComponentType<P>}>,
  label:string,
  cancel?:{label:string;run:(props:P)=>void},
){
  let resolved:ComponentType<P>|undefined
  let pending:Promise<ComponentType<P>>|undefined
  const prepare=()=>pending??=Promise.resolve().then(load).then(module=>(resolved=module.default)).catch(error=>{
    pending=undefined
    throw error
  })
  return function RetryableLazy(props:P){
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
    return <div>
      {failed?<div role="alert"><p>{label}加载失败，当前页面内容仍保留。</p><button type="button" className="training-accounts-secondary" onClick={()=>setRevision(value=>value+1)}>重试{label}</button></div>:<p role="status">正在加载{label}…</p>}
      {cancel&&<button type="button" className="training-accounts-secondary" onClick={()=>cancel.run(props)}>{cancel.label}</button>}
    </div>
  }
}
