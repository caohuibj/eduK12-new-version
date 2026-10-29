import React,{useEffect,useRef,useState} from 'react'
import type {CognitiveTaskProps,CognitiveTaskContext} from '../../core/runner.types'
import {nativeContentSnapshot} from '../../core/NativeContentRunner'
import {finalDraftStore,type FinalDraftMeta} from '../../../../services/persistence/finalDraftStore'
import {nativeEnumerationDraftKey} from '../../core/native-enumeration-draft-key'
import {requireCognitiveDurability} from '../../core/raw-archive'
import {ENUMERATION_RECIPE_IDENTITY,ENUMERATION_PROTOCOL,enumerationConfigEqual,enumerationRecipeConfig,type EnumerationRecipeConfig} from './generated/protocol'
import {enumerationArtifact,enumerationPageOrigin,type EnumerationArtifact,type EnumerationContext} from './display'
import {freezeEnumerationArtifact,readFrozenEnumerationArtifact} from './local-artifact'
import {createNativeEnumerationPort,type NativeEnumerationPort} from './native-port'
import {EnumerationCalibration} from './EnumerationCalibration'
import {EnumerationTask} from './EnumerationTask'
export function nativeEnumerationConfig(context:CognitiveTaskContext):EnumerationRecipeConfig {
 nativeContentSnapshot(context)
 const id=ENUMERATION_RECIPE_IDENTITY,s=context.sessionSnapshot,c=context.config
 if(!context.nativeTask||!s||context.testType!==id.testType||context.engineVersion!==id.engineVersion||context.scoringVersion!==id.scoringVersion
  ||context.configVersion!==id.configVersion||!enumerationConfigEqual(s?.protocol,ENUMERATION_PROTOCOL)||context.attemptEpoch!==context.attemptNo||!Number.isSafeInteger(context.attemptEpoch)
  ||(context.sessionEpoch!==undefined&&context.sessionEpoch!==context.attemptEpoch)||s.protocol.key!==id.protocolKey
  ||s.testType!==id.testType||s.engineVersion!==id.engineVersion||s.scoringVersion!==id.scoringVersion||s.configVersion!==id.configVersion
  ||s.configHash!==context.definitionHash||!['research','experience'].includes(String(c.profile))
  ||!enumerationConfigEqual(c,s.config)||!enumerationConfigEqual(c,enumerationRecipeConfig(c.profile as 'research'|'experience')))
  throw Error('测验设置尚未准备好，请联系发布者')
 return structuredClone(c) as unknown as EnumerationRecipeConfig
}
function NativeEnumerationGeneration(props:CognitiveTaskProps){
 const [initial]=useState(()=>({context:structuredClone(props.taskContext),host:props.nativeHost}))
 const [state,setState]=useState<{meta:FinalDraftMeta;artifact:EnumerationArtifact|null;port:NativeEnumerationPort|null;recovery:boolean}|null>(null)
 const prepared=useRef<EnumerationArtifact|null>(null)
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),active=useRef(true)
 let config:EnumerationRecipeConfig|null=null
 try{config=nativeEnumerationConfig(initial.context)}catch{}
 useEffect(()=>{active.current=true
  void(async()=>{
   requireCognitiveDurability();const resolved=nativeEnumerationConfig(initial.context);if(!initial.host)throw Error('当前入口尚不支持此测验')
   // Actual new enum epoch key is shared with the host; never create or infer metadata.
   const meta=await finalDraftStore.get(nativeEnumerationDraftKey(initial.context.sessionId,initial.context.attemptEpoch!))
   if(!meta||meta.instrument!=='cognitive'||meta.attemptId!==initial.context.sessionId||meta.attemptEpoch!==initial.context.attemptEpoch||meta.definitionHash!==initial.context.definitionHash)throw Error('本机作答设置尚未准备好，请联系发布者')
   const stored=await readFrozenEnumerationArtifact(meta),artifact=stored?.artifact??null
   if(artifact&&(artifact.context.usage!=='AUTHENTICATED_CONTENT_CANDIDATE'||artifact.context.attemptId!==JSON.stringify([initial.context.sessionId,initial.context.attemptEpoch])
    ||artifact.context.randomSeed!==initial.context.randomSeed||!enumerationConfigEqual(artifact.context.config,resolved)))throw Error('原记录与本次设置不一致')
   const port=artifact?createNativeEnumerationPort(meta,artifact,initial.host,enumerationPageOrigin()):null
   const records=port?await port.snapshot():null
   if(active.current)setState({meta,artifact,port,recovery:Boolean(records&&(records.hasReservations||records.ended))})
  })().catch(e=>{if(active.current)setError(e instanceof Error?e.message:'本机保存暂不可用')})
  return()=>{active.current=false}
 },[])
 if(error)return <section className="enumeration-candidate"><p role="alert">{error}</p></section>
 if(!state||!config)return <section className="enumeration-candidate"><p role="status">正在准备测验…</p></section>
 if(state.recovery)return <section className="enumeration-candidate"><section className="enum-reading"><h1>本次作答已停止</h1>
  <p>原记录会保留供保存重试，请勿重新开始。本页只保存或提交已经记录的作答，不会再次呈现点阵。</p>
  <button disabled={busy} onClick={()=>{setBusy(true);setNotice('');void state.port!.recover().then(result=>{if(active.current)setNotice(result.complete?'作答已提交，正在读取已保存报告…':'原记录已保留；本次正式作答尚未完成，请联系发布者。')}).catch(e=>{if(active.current)setNotice(e instanceof Error?e.message:'保存尚未确认')}).finally(()=>{if(active.current)setBusy(false)})}}>{busy?'正在保存原记录…':'保存原记录'}</button>
  {notice&&<p role="status">{notice}</p>}
 </section></section>
 if(!state.artifact)return <EnumerationCalibration recipe={config.stimulusRecipe} onConfirm={async calibration=>{
  if(!active.current||!initial.host)return
  const previous=prepared.current
  if(previous){const {id:_old,...oldValues}=previous.context.calibration!;const {id:_new,...values}=calibration;if(JSON.stringify(oldValues)!==JSON.stringify(values))throw Error('原设置已保留，请使用原设置重试或联系发布者。')}
  const context:EnumerationContext={contextId:crypto.randomUUID(),attemptId:JSON.stringify([initial.context.sessionId,initial.context.attemptEpoch]),usage:'AUTHENTICATED_CONTENT_CANDIDATE',
   config:config!,randomSeed:initial.context.randomSeed,language:'zh',calibration,recipe:structuredClone(config!.stimulusRecipe)}
  prepared.current??=enumerationArtifact(context)
  const original=await freezeEnumerationArtifact(state.meta,prepared.current)
  if(!active.current)return
  const port=createNativeEnumerationPort(state.meta,original.artifact,initial.host,enumerationPageOrigin())
  const records=await port.snapshot();if(active.current)setState({...state,artifact:original.artifact,port,recovery:records.hasReservations||records.ended})
 }}/>
 return <EnumerationTask context={state.artifact.context} persistence={state.port!} hostManagedReport/>
}
/** Genuine frozen identity switches unmount old task; normal trial-index renders retain original callbacks. */
export function NativeEnumerationRunner(props:CognitiveTaskProps){const c=props.taskContext
 return <NativeEnumerationGeneration key={JSON.stringify([c.sessionId,c.attemptEpoch,c.definitionHash,c.randomSeed,c.engineVersion,c.scoringVersion,c.configVersion,c.sessionSnapshot?.protocolSignature])} {...props}/>
}
