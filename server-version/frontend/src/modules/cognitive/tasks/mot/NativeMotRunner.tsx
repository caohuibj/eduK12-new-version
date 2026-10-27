import React,{useEffect,useState} from 'react'
import type {CognitiveTaskProps} from '../../core/runner.types'
import {cognitiveRawDigest,requireCognitiveDurability} from '../../core/raw-archive'
import {MotTask} from './MotTask'
import {createMotDraft,type MotDraftPort} from './draft'
import {MOT_IDENTITY,motConfig,type MotProfile,type MotTrial} from './generated/protocol'
/** Transport mapping preserves captured clocks, never derives onset from submit time. */
export function nativeMotEnvelope(core:MotTrial):Record<string,unknown>{
 return {schemaVersion:1,trialIndex:core.trialIndex,phase:'test',condition:String(core.speed),
  startedAtPerfMs:core.startedAtPerfMs,endedAtPerfMs:core.endedAtPerfMs,durationMs:core.completionTimeMs,
  flags:{timeout:core.timedOut,premature:core.prematureInputs>0},
  qualityEvents:core.interruptions.filter(e=>e!=='viewport_changed'),payload:structuredClone(core)}
}
export function NativeMotRunner(props:CognitiveTaskProps){
 const {taskContext:c,nativeHost}=props
 const [draft,setDraft]=useState<MotDraftPort|null>(null),[error,setError]=useState('')
 const snapshot=c.sessionSnapshot
 useEffect(()=>{
  let port:MotDraftPort|null=null
  try{
   requireCognitiveDurability()
   if(!nativeHost||!c.nativeTask||!snapshot||c.engineVersion!==MOT_IDENTITY.engineVersion||c.scoringVersion!==MOT_IDENTITY.scoringVersion
    ||c.configVersion!==MOT_IDENTITY.configVersion||c.attemptEpoch!==c.attemptNo||!Number.isSafeInteger(c.attemptEpoch)
    ||(c.sessionEpoch!==undefined&&c.sessionEpoch!==c.attemptEpoch)||snapshot.testType!=='mot'||snapshot.configHash!==c.definitionHash
    ||snapshot.protocol.key!==`mot/${MOT_IDENTITY.engineVersion}/${MOT_IDENTITY.scoringVersion}`
    ||!['research','experience'].includes(String(c.config.profile))
    ||cognitiveRawDigest(c.config)!==cognitiveRawDigest(motConfig(c.config.profile as MotProfile)))throw Error('测验设置尚未准备好，请联系发布者')
   port=createMotDraft({sessionId:c.sessionId,attemptNo:c.attemptEpoch!,protocolKey:'mot/1.1.1/1.1.0',resolvedConfigHash:snapshot.configHash,randomSeed:c.randomSeed})
   setDraft(port);setError('')
  }catch(e){setError(e instanceof Error?e.message:'本机保存暂不可用')}
  return()=>port?.close?.()
 },[c.sessionId,c.attemptEpoch,c.engineVersion,c.scoringVersion,c.configVersion,c.definitionHash,c.randomSeed])
 if(error)return <p role="alert">{error}</p>
 if(!draft||!nativeHost)return <p role="status">正在准备测验…</p>
 return <MotTask config={motConfig(c.config.profile as MotProfile)} randomSeed={c.randomSeed} trialIndex={props.trialIndex} draft={draft}
  onTrialComplete={core=>nativeHost.appendEnvelope(nativeMotEnvelope(core))}
  prepareFinalArchive={async records=>{await nativeHost.sealRaw({schemaVersion:1,formal:records.formal,practice:records.practice})}}
  onTaskComplete={nativeHost.complete}/>
}
