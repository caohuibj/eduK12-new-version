import React,{useEffect,useRef,useState} from 'react'
import {finalDraftStore,type FinalDraftWriteIdentity} from '../../../services/persistence/finalDraftStore'
import {cognitiveRawDigest as digest,requireCognitiveDurability} from './raw-archive'
import type {CognitiveTaskContext,CognitiveTaskProps} from './runner.types'
import {createNativeContentPort,retainedNativeContentContext,type NativeContentContext,type NativeContentRecord,type NativeContentClaim,type NativePortAdapter} from './native-content-port'
export function nativeContentSnapshot(c:CognitiveTaskContext):NativeContentContext['snapshot']{
 const s=c.sessionSnapshot
 if(!c.nativeTask||!s||s.schemaVersion!==1||s.testType!==c.testType||s.engineVersion!==c.engineVersion||s.scoringVersion!==c.scoringVersion||s.configVersion!==c.configVersion
  ||s.configHash!==c.definitionHash||digest(s.config)!==s.configHash||digest(s.protocol)!==s.protocolSignature||digest(s.config)!==digest(c.config)||c.attemptEpoch!==c.attemptNo||!Number.isSafeInteger(c.attemptEpoch))throw Error('测验冻结设置尚未核对')
 return {schemaVersion:1,testType:s.testType,engineVersion:s.engineVersion,scoringVersion:s.scoringVersion,configVersion:s.configVersion,config:s.config,protocol:s.protocol,configHash:s.configHash,protocolSignature:s.protocolSignature,frozenAt:s.frozenAt}
}
export function createNativeContentRunner<C extends NativeContentContext,D extends NativeContentRecord,F extends NativeContentClaim,R,P>(adapter:NativePortAdapter<C,R,P>&{
 createContext(context:CognitiveTaskContext,key:string):C
 Component:React.ComponentType<{context:C;ports:ReturnType<typeof createNativeContentPort<C,D,F,R,P>>}>
}){
 type Port=ReturnType<typeof createNativeContentPort<C,D,F,R,P>>
 function Generation(props:CognitiveTaskProps){
  const initial=useRef(props),active=useRef(true),[state,setState]=useState<{context:C;port:Port;recovery:boolean}|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  useEffect(()=>{active.current=true;const {taskContext:c,nativeHost:host}=initial.current
   void(async()=>{requireCognitiveDurability();nativeContentSnapshot(c)
    if(!host?.getDraftIdentity)throw Error('当前入口的本机保存尚未接通')
    const identity:FinalDraftWriteIdentity=await host.getDraftIdentity()
    if(identity.instrument!=='cognitive'||identity.attemptId!==c.sessionId||identity.attemptEpoch!==c.attemptEpoch||identity.definitionHash!==c.definitionHash)throw Error('本机作答身份与当前测验不一致')
    const fresh=adapter.createContext(c,JSON.stringify([c.sessionId,c.attemptEpoch,c.definitionHash])),context=await retainedNativeContentContext(identity,fresh),port=createNativeContentPort<C,D,F,R,P>(identity,context,adapter,host,finalDraftStore),inventory=await port.inventory()
    if(active.current)setState({context,port,recovery:Boolean(inventory.binding)})
   })().catch(e=>{if(active.current)setError(e instanceof Error?e.message:'本机保存暂不可用')})
   return()=>{active.current=false}
  },[])
  if(error)return <section role="alert">{error}</section>
  if(!state)return <p role="status">正在准备测验与本机保存…</p>
  if(state.recovery)return <section><h1>原作答已经停止</h1><p>已保留的原记录可继续保存；已经开始的任务不会重新呈现。若尚无正式记录，请联系发布者安排新的一次作答。</p>
   <button disabled={busy} onClick={()=>{setBusy(true);setNotice('');void state.port.recover().then(done=>{if(active.current)setNotice(done?'原记录已提交，正在读取已保存报告…':'练习原件已保留；尚无可提交的正式记录。')}).catch(e=>{if(active.current)setNotice(e instanceof Error?e.message:'保存尚未确认')}).finally(()=>{if(active.current)setBusy(false)})}}>{busy?'正在保存原记录…':'保存原记录'}</button>{notice&&<p role="status">{notice}</p>}</section>
  const Component=adapter.Component
  return <Component context={state.context} ports={state.port}/>
 }
 return function NativeContentRunner(props:CognitiveTaskProps){const c=props.taskContext;return <Generation key={JSON.stringify([c.sessionId,c.attemptEpoch,c.definitionHash,c.randomSeed,c.engineVersion,c.scoringVersion,c.configVersion,c.sessionSnapshot?.protocolSignature])} {...props}/>}
}
