import { lazy,Suspense,useEffect,useMemo,useRef,useState } from 'react'
import type { SituationalRunnerClient } from '../modules/situational/api'
import type { SituationalAttemptResponse } from '../modules/situational/types'
import { isSurveySituationalReference,type SurveySituationalReference } from './survey-situational-api'
const Runner=lazy(()=>import('../modules/situational/pages/SituationalRunner'))
type Response=SituationalAttemptResponse&{receipt?:SurveySituationalReference}
export function SurveySituationalUnit(props:{publicId:string;attemptId:string;slotKey:string;title:string;
  accessCredential:string;researchCode?:string;onStarted?:(id:string)=>void;onCommitted:(receipt:SurveySituationalReference)=>void}){
  const [child,setChild]=useState<string|null>(null),[done,setDone]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  const generation=useRef(0)
  const onStarted=useRef(props.onStarted);onStarted.current=props.onStarted
  const onCommitted=useRef(props.onCommitted);onCommitted.current=props.onCommitted
  const base=`/api/public/survey/r/${encodeURIComponent(props.publicId)}/attempts/${encodeURIComponent(props.attemptId)}/situational/${encodeURIComponent(props.slotKey)}`
  const client=useMemo(()=>{
    const proof={accessCredential:props.accessCredential,...(props.researchCode?{researchCode:props.researchCode}:{})}
    const call=async(path:string,submission?:unknown)=>{
      const response=await fetch(base+path,{method:'POST',credentials:'omit',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({...proof,...(submission?{submission}:{})})})
      const body=await response.json() as {code:number;message:string;data:Response}
      if(!response.ok||body.code!==0||!body.data)throw Object.assign(new Error(body.message||'情境化任务访问失败'),{status:response.status})
      return body
    }
    const result:SituationalRunnerClient={start:()=>call('/start'),resume:id=>call(`/${encodeURIComponent(id)}/read`),
      result:id=>call(`/${encodeURIComponent(id)}/read`),submit:(id,input)=>call(`/${encodeURIComponent(id)}/final`,input),
      loadAsset:async(id,assetId)=>{
        const response=await fetch(base+`/${encodeURIComponent(id)}/images/${encodeURIComponent(assetId)}`,{
          method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(proof),
        })
        if(!response.ok)throw Object.assign(new Error('情境图片暂时无法访问，请重试'),{status:response.status})
        return response.blob()
      },
      loadVideoSources:async()=>{throw new Error('当前原生情境化试点不支持视频')},
    }
    return {runner:result,call}
  },[base,props.accessCredential,props.researchCode])
  useEffect(()=>{
    const epoch=++generation.current;let active=true;setChild(null);setDone(false);setError('')
    void client.call('/start').then(({data})=>{
      if(!active)return
      onStarted.current?.(data.attempt.id)
      if(isSurveySituationalReference(data.receipt)){onCommitted.current(data.receipt);setDone(true)}
      else setChild(data.attempt.id)
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'情境化任务访问失败')})
    return ()=>{active=false;if(generation.current===epoch)generation.current++}
  },[client,retry])
  const complete=()=>{
    if(!child)return
    const epoch=generation.current
    void client.call(`/${encodeURIComponent(child)}/read`).then(({data})=>{
      if(epoch!==generation.current)return
      if(!isSurveySituationalReference(data.receipt))throw new Error('尚未核实正式保存回执，请重试读取')
      onCommitted.current(data.receipt);setDone(true)
    }).catch(e=>{if(epoch===generation.current)setError(e instanceof Error?e.message:'回执读取失败')})
  }
  return <section aria-label={props.title}><h2>{props.title}</h2>
    {error&&<div role="alert"><p>{error}</p><button type="button" onClick={()=>setRetry(v=>v+1)}>重试读取任务</button></div>}
    {done?<p role="status">情境化作答已可靠保存，请继续提交整轮研究。个体反馈按研究约定开放。</p>
      :child?<Suspense fallback={<p role="status">正在加载共享情境化作答工具…</p>}><Runner host={{attemptId:child,
        parentAttemptId:props.attemptId,compositeItemId:props.slotKey,client:client.runner,onCompleted:complete}}/></Suspense>
      :!error?<p role="status">正在读取情境化任务…</p>:null}
  </section>
}
