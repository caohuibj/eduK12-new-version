import React,{useEffect,useMemo,useState} from 'react'
import type {CognitiveTaskProps} from '../../core/runner.types'
import {createNativeContentRunner,nativeContentSnapshot} from '../../core/NativeContentRunner'
import {isNativePublicReportSnapshot} from '../../core/native-public-report'
import {finalDraftStore,assertFinalDraftWriteIdentity} from '../../../../services/persistence/finalDraftStore'
import {cognitiveRawDigest as digest,requireCognitiveDurability} from '../../core/raw-archive'
import {MotCalibration} from '../mot/MotCalibration'
import type {MotCalibration as Calibration} from '../mot/generated/protocol'
import {AntTask} from './AntTask'
import {AntReportCard} from './AntReportCard'
import {antDisplayProblem,readAntViewport,type AntFrozenDisplay} from './display'
import {ANT_GUIDED_IDENTITY,type AntConfig} from './generated/protocol'
import {antNativeGeometry,antNativeManifest,antNativeEnvelope,ANT_NATIVE_GEOMETRY_VERSION,type AntNativeRawRecord} from './generated/native-protocol'
import {isNativeAntReport,type NativeAntReport} from './generated/native-report'
import {antNativePorts,type NativeAntContext,type NativeAntRecord,type NativeAntClaim,type NativeAntPort} from './native-ports'
import type {NativePublicReportSnapshot} from '../../types'
function displayFor(calibration:Calibration,hash:string,signature:string):AntFrozenDisplay{
 const geometry=antNativeGeometry(calibration.referenceCssPx,calibration.viewingDistanceMm),inputMap={leftKey:'ArrowLeft',rightKey:'ArrowRight'},geometryVersion=ANT_NATIVE_GEOMETRY_VERSION
 return {schemaVersion:1,calibrationId:crypto.randomUUID(),geometryVersion,geometryHash:digest({geometryVersion,geometry,inputMap}),configHash:hash,protocolSignature:signature,origin:'host_physical_calibration',referenceMm:50,referenceCssPx:calibration.referenceCssPx,viewingDistanceMm:calibration.viewingDistanceMm,viewport:readAntViewport(),geometry,inputMap}
}
function AntContent({context,ports}:{context:NativeAntContext;ports:NativeAntPort}){
 const mapped=useMemo(()=>antNativePorts(context,ports),[context,ports])
 return <AntTask contextId={context.contextKey} config={context.snapshot.config as AntConfig} randomSeed={context.randomSeed} configHash={context.snapshot.configHash} protocolSignature={context.snapshot.protocolSignature} language="zh" display={{frozen:context.administration,readViewport:readAntViewport}} {...mapped}/>
}
function NativeAntGeneration(props:CognitiveTaskProps){
 const [ready,setReady]=useState(false),[calibrating,setCalibrating]=useState(false),[display,setDisplay]=useState<AntFrozenDisplay|null>(null),[error,setError]=useState('')
 const c=props.taskContext,s=nativeContentSnapshot(c)
 useEffect(()=>{let active=true;void(async()=>{
  requireCognitiveDurability();if(!props.nativeHost?.getDraftIdentity)throw Error('当前入口的本机保存尚未接通')
  const owner=await props.nativeHost.getDraftIdentity(),meta=await finalDraftStore.get(owner.draftKey);if(!meta)throw Error('本机原记录不存在');assertFinalDraftWriteIdentity(meta,owner)
  const old=(meta.frozenInstrumentArtifacts?.['cognitive.native-content.open.v1'] as {context:NativeAntContext}|undefined)?.context
  if(active){if(old)setDisplay(old.administration);setReady(true)}
 })().catch(e=>{if(active)setError(e instanceof Error?e.message:'本机保存暂不可用')});return()=>{active=false}},[])
 const Runner=useMemo(()=>display?createNativeContentRunner<NativeAntContext,NativeAntRecord,NativeAntClaim,AntNativeRawRecord,NativeAntReport>({
  createContext:(c,key)=>{const snapshot=nativeContentSnapshot(c),config=snapshot.config as AntConfig
   if(snapshot.testType!==ANT_GUIDED_IDENTITY.testType||snapshot.engineVersion!==ANT_GUIDED_IDENTITY.engineVersion||snapshot.scoringVersion!==ANT_GUIDED_IDENTITY.scoringVersion||snapshot.configVersion!==ANT_GUIDED_IDENTITY.configVersion
    ||digest(display.geometry)!==digest(antNativeGeometry(display.referenceCssPx,display.viewingDistanceMm))||display.geometryHash!==digest({geometryVersion:display.geometryVersion,geometry:display.geometry,inputMap:display.inputMap})||antDisplayProblem(display,display.viewport,config,snapshot.configHash,snapshot.protocolSignature))throw Error('ANT 冻结设置或校准尚未核对')
   return {contextKey:key,snapshot,randomSeed:c.randomSeed,manifestHash:digest(antNativeManifest(config,c.randomSeed).formal),administration:display}},
  manifest:context=>antNativeManifest(context.snapshot.config as AntConfig,context.randomSeed),envelope:raw=>antNativeEnvelope(raw,digest(raw.raw.display)),isReport:(value:unknown):value is NativeAntReport=>isNativeAntReport(value)&&value.contextId===JSON.stringify([c.sessionId,c.attemptEpoch,c.definitionHash]),Component:AntContent,
 }):null,[display])
 if(error)return <p role="alert">{error}</p>
 if(!ready)return <p role="status">正在准备 ANT 与本机保存…</p>
 if(Runner)return <Runner {...props}/>
 if(calibrating)return <div className="mot-task"><MotCalibration language="zh" geometryFits={calibration=>{try{const d=displayFor(calibration,s.configHash,s.protocolSignature);return antDisplayProblem(d,d.viewport,c.config as unknown as AntConfig,s.configHash,s.protocolSignature)===null}catch{return false}}} onConfirm={calibration=>setDisplay(displayFor(calibration,s.configHash,s.protocolSignature))}/></div>
 return <section className="ant-candidate"><h1>开始前，确认屏幕尺寸与观看距离</h1><p>请准备实体尺子，把设备放稳。校准后会显示完整说明与例子，再开始练习。</p><button onClick={()=>setCalibrating(true)}>校准屏幕</button></section>
}
export function NativeAntRunner(props:CognitiveTaskProps){const c=props.taskContext;try{nativeContentSnapshot(c)}catch{return <p role="alert">ANT 冻结设置尚未核对，请联系组织者。</p>}return <NativeAntGeneration key={JSON.stringify([c.sessionId,c.attemptEpoch,c.definitionHash,c.randomSeed])} {...props}/>}
export function NativeContentReport({snapshot}:{snapshot:NativePublicReportSnapshot}){
 const r=snapshot.report
 if(!isNativePublicReportSnapshot(snapshot)||snapshot.testType!==ANT_GUIDED_IDENTITY.testType||snapshot.engineVersion!==ANT_GUIDED_IDENTITY.engineVersion||snapshot.scoringVersion!==ANT_GUIDED_IDENTITY.scoringVersion||snapshot.configVersion!==ANT_GUIDED_IDENTITY.configVersion||!isNativeAntReport(r))return <p role="alert">已保存 ANT 报告暂时无法核对。</p>
 return <AntReportCard data={{contextId:String(r.contextId),configHash:String(r.configHash),protocolSignature:String(r.protocolSignature),projection:r.projection,qualityFlags:r.qualityFlags}} contextId={String(r.contextId)} configHash={snapshot.configHash} protocolSignature={snapshot.protocolSignature}/>
}
