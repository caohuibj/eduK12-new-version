import {useEffect,useState,type ComponentType,type ReactNode} from 'react'
import {createRetryableLazy} from '../shared-ui/RetryableLazy'

/** Reuse the existing retryable code loader; task data and authority are never cached. */
export function deferredPage<P extends object>(load:()=>Promise<{default:ComponentType<P>}>) {
  return createRetryableLazy(load,'页面内容')
}

/** Hidden tabs do not request code/data until visited; subsequent switches retain drafts. */
export function KeepMountedOnVisit({active,children}:{active:boolean;children:ReactNode}) {
  const [visited,setVisited]=useState(active)
  useEffect(()=>{if(active)setVisited(true)},[active])
  return active||visited?<>{children}</>:null
}
