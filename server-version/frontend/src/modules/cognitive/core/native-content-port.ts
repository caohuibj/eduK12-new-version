import {finalDraftStore,assertFinalDraftWriteIdentity,type FinalDraftStore,type FinalDraftWriteIdentity} from '../../../services/persistence/finalDraftStore'
import {cognitiveRawDigest as digest,requireCognitiveDurability} from './raw-archive'
import {isNativePublicReportSnapshot} from './native-public-report'
import type {CognitiveNativeHost} from './runner.types'
export interface NativeContentContext {contextKey:string;randomSeed:string;manifestHash:string;snapshot:{schemaVersion:1;testType:string;engineVersion:string;scoringVersion:string;configVersion:string;config:unknown;protocol:unknown;configHash:string;protocolSignature:string;frozenAt:string}}
export interface NativeContentRecord {contextKey:string;recordKey:string;recordDigest:string;configHash:string;protocolSignature:string;manifestHash:string;realm:{timeOriginMs:number;pageInstanceId:string};raw:unknown}
export interface NativeContentClaim {contextKey:string;configHash:string;protocolSignature:string;manifestHash:string;recordDigests:string[];finalPayloadDigest:string;practiceCount:number;termination:'completed'|'aborted';terminationReason:string|null}
export interface NativeContentReceipt<P> {contextKey:string;finalPayloadDigest:string;finalSaved:true;receiptId:string;reportDigest:string;report:P}
export interface NativePortAdapter<C,R,P>{manifest(context:C):unknown;envelope(raw:R):Record<string,unknown>;isReport(value:unknown):value is P}
const OPEN='cognitive.native-content.open.v1',FINAL='cognitive.native-content.final.v1',PREFIX='cognitive.native-content.record.'
const same=(a:unknown,b:unknown)=>digest(a)===digest(b)
/** Recovery keeps the original administration metadata even when the current viewport changes. */
export async function retainedNativeContentContext<C extends NativeContentContext>(owner:FinalDraftWriteIdentity,fresh:C,store:FinalDraftStore=finalDraftStore):Promise<C>{
 const meta=await store.get(owner.draftKey);if(!meta)throw Error('本机原记录不存在');assertFinalDraftWriteIdentity(meta,owner)
 const saved=(meta.frozenInstrumentArtifacts?.[OPEN] as {context:C}|undefined)?.context
 if(!saved)return fresh
 if(saved.contextKey!==fresh.contextKey||saved.randomSeed!==fresh.randomSeed||saved.manifestHash!==fresh.manifestHash||!same(saved.snapshot,fresh.snapshot))throw Error('原作答冻结设置与本次不同')
 return structuredClone(saved)
}
function phase(record:NativeContentRecord){const v=record as NativeContentRecord&{phase?:string;kind?:string},raw=v.raw as {plan?:{phase?:string}};return v.kind==='quiz'?'quiz':v.phase??raw.plan?.phase}
export function createNativeContentPort<C extends NativeContentContext,D extends NativeContentRecord,F extends NativeContentClaim,R,P>(
 expected:FinalDraftWriteIdentity,context:C,adapter:NativePortAdapter<C,R,P>,host:CognitiveNativeHost,store:FinalDraftStore=finalDraftStore){
 requireCognitiveDurability(store)
 const owner=structuredClone(expected),original=structuredClone(context),manifest=adapter.manifest(original)
 let flight:Promise<NativeContentReceipt<P>>|null=null,activeClaim:F|null=null
 const read=async()=>{const meta=await store.get(owner.draftKey);if(!meta)throw Error('本机原记录不存在');assertFinalDraftWriteIdentity(meta,owner)
  if(meta.instrument!=='cognitive')throw Error('本机测验身份不一致');return meta}
 const inventory=async()=>{const meta=await read(),slots=meta.frozenInstrumentArtifacts??{},binding=slots[OPEN] as {context:C;manifest:unknown;realm:D['realm']}|undefined
  if(binding&&(!same(binding.context,original)||!same(binding.manifest,manifest)))throw Error('原设置与本次冻结身份不一致')
  const records=Object.entries(slots).filter(([key])=>key.startsWith(PREFIX)).map(([,v])=>structuredClone(v) as D)
  return {binding,records,claim:slots[FINAL] as F|undefined}}
 const validateRecord=(row:D,binding:NonNullable<Awaited<ReturnType<typeof inventory>>['binding']>)=>{
  const {recordDigest,...value}=row
  if(!row.recordKey||(PREFIX+row.recordKey).length>128||recordDigest!==digest(value)||row.contextKey!==original.contextKey||row.configHash!==original.snapshot.configHash
   ||row.protocolSignature!==original.snapshot.protocolSignature||row.manifestHash!==original.manifestHash||!same(row.realm,binding.realm))throw Error('本机原记录与冻结设置不一致')
 }
 const finalize=(claim:F):Promise<NativeContentReceipt<P>>=>{
  if(flight)return same(activeClaim,claim)?flight:Promise.reject(Error('最终记录提交中，不能更换封存内容'))
  const input=structuredClone(claim);activeClaim=input
  flight=(async()=>{const data=await inventory();if(!data.binding)throw Error('缺少本次启动记录')
   const {finalPayloadDigest,...body}=input
   if(digest(body)!==finalPayloadDigest||input.contextKey!==original.contextKey||input.configHash!==original.snapshot.configHash||input.protocolSignature!==original.snapshot.protocolSignature||input.manifestHash!==original.manifestHash
    ||input.recordDigests.length!==data.records.length||new Set(input.recordDigests).size!==data.records.length)throw Error('最终记录封存不一致')
   const byDigest=new Map(data.records.map(row=>[row.recordDigest,row])),records=input.recordDigests.map(h=>{const row=byDigest.get(h);if(!row)throw Error('缺少待提交原记录');validateRecord(row,data.binding!);return row})
   const formal=records.filter(row=>phase(row)==='test')
   if(!formal.length)throw Error('尚无正式作答记录，练习原件继续保留')
   if(records.filter(row=>phase(row)==='practice').length!==input.practiceCount)throw Error('练习记录数量不一致')
   if(data.claim&&!same(data.claim,input))throw Error('不能更换已封存记录')
   if(!data.claim)await store.freezeInstrumentArtifact(owner,FINAL,input)
   await host.sealRaw({schemaVersion:1,kind:'COGNITIVE_NATIVE_CONTENT_V1',context:original,manifest,realm:data.binding.realm,records,claim:input})
   for(const [index,row] of formal.entries()){
    const envelope=adapter.envelope(row.raw as R)
    if(envelope.trialIndex!==index||await host.appendEnvelope(envelope)===false)throw Error('正式作答原件次序尚未确认')
   }
   const receipt=await host.complete(),snapshot=receipt.nativeReport
   if(receipt.coreSaved!==true||receipt.sessionId!==owner.attemptId||receipt.attemptEpoch!==owner.attemptEpoch||receipt.definitionHash!==owner.definitionHash||receipt.submissionId!==owner.submissionId
    ||!isNativePublicReportSnapshot(snapshot)||snapshot.testType!==original.snapshot.testType||snapshot.engineVersion!==original.snapshot.engineVersion||snapshot.scoringVersion!==original.snapshot.scoringVersion
    ||snapshot.configVersion!==original.snapshot.configVersion||snapshot.configHash!==original.snapshot.configHash||snapshot.protocolSignature!==original.snapshot.protocolSignature||!adapter.isReport(snapshot.report))throw Error('服务器公开报告回执尚未核对')
   return {contextKey:original.contextKey,finalPayloadDigest:input.finalPayloadDigest,finalSaved:true as const,receiptId:receipt.submissionId,reportDigest:digest(snapshot.report),report:structuredClone(snapshot.report)}
  })().finally(()=>{flight=null;activeClaim=null})
  return flight
 }
 return {
  prepareLocalAttempt:async(value:C,plan:unknown,realm:D['realm'])=>{await read();if(!same(value,original)||!same(plan,manifest)||!Number.isFinite(realm.timeOriginMs)||realm.timeOriginMs<0||!realm.pageInstanceId)throw Error('启动冻结身份不一致')
   const frozen=await store.freezeInstrumentArtifact(owner,OPEN,{context:original,manifest,realm:structuredClone(realm)})
   if(!frozen.created)throw Error('原作答已经开始，不能重新呈现')
   return {fresh:true as const,contextKey:original.contextKey,bindingDigest:digest({context:original,manifest,realm})}},
  persistLocalDraft:async(value:D)=>{const row=structuredClone(value),data=await inventory();if(!data.binding)throw Error('缺少本次启动记录');validateRecord(row,data.binding)
   await store.freezeInstrumentArtifact(owner,PREFIX+row.recordKey,row)
   return {retained:true as const,contextKey:row.contextKey,recordKey:row.recordKey,recordDigest:row.recordDigest}},
  finalize,inventory,
  recover:async()=>{const data=await inventory();if(!data.binding)return false;if(data.claim){await finalize(data.claim);return true}
   const formal=data.records.filter(row=>phase(row)==='test');if(!formal.length)return false
   const base={contextKey:original.contextKey,configHash:original.snapshot.configHash,protocolSignature:original.snapshot.protocolSignature,manifestHash:original.manifestHash,
    practiceCount:data.records.filter(row=>phase(row)==='practice').length,termination:'aborted' as const,terminationReason:'page-reloaded',recordDigests:data.records.map(row=>row.recordDigest)}
   const extra=original.snapshot.testType==='gradcpt'?{formalCaptureCount:formal.length,presented:(()=>{const raw=formal[0].raw as {plan:Array<{kind:string;index:number}>;slots:Array<{endMs:number|null}>};return raw.plan.filter(p=>p.kind!=='boundary'&&raw.slots[p.index]?.endMs!=null).length})()}
    :{formalCount:formal.length,...(original.snapshot.testType==='balloon-effort'?{quizCount:data.records.filter(row=>phase(row)==='quiz').length}:{})}
   const body={...base,...extra};await finalize({...body,finalPayloadDigest:digest(body)} as unknown as F);return true},
 }
}
