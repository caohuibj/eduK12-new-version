import {describe,it,expect,vi} from 'vitest'
import {createFinalDraftMeta,createFinalDraftStore} from '../../../../services/persistence/finalDraftStore'
import {cognitiveRawDigest,finishCognitiveCoreDraft,retryCognitiveRawArchive,requireCognitiveDurability} from '../raw-archive'
import {nativeCoreReceipt,nativeCompletedReceipt,assertNativeSession} from '../native-session-contract'
import {nativeMotEnvelope} from '../../tasks/mot/NativeMotRunner'
import {motConfig,type MotTrial} from '../../tasks/mot/generated/protocol'
import type {CognitiveSession} from '../../types'
const h='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64)
const identity={sessionId:'native-mot',attemptEpoch:1,submissionId:'submission',definitionHash:h}
const rawPayload={schemaVersion:1,formal:[{core:{trialIndex:0},raw:{motionFrameTimesMs:[1,2]}}],practice:[]}
const rawSha256=cognitiveRawDigest(rawPayload)
const receipt={...identity,coreSaved:true as const,archiveState:'confirmed' as const,archiveConfirmed:true,rawSubmissionId:'raw',coreHash:b,rawSha256,logicalHash:c,assetId:'asset',objectKey:'private/key',sha256:h,sizeBytes:500}
async function draft(sidecar=true){
 const store=createFinalDraftStore(),key='native-mot-test-'+crypto.randomUUID()
 const meta=createFinalDraftMeta({draftKey:key,instrument:'cognitive',attemptId:identity.sessionId,attemptEpoch:1,submissionId:identity.submissionId,definitionHash:h,contextSnapshotHash:null,deliveryMode:'final_only'})
 await store.ensure(meta)
 if(sidecar)await store.mutateCognitiveArchive(key,identity,{kind:'seal',rawPayload,rawSha256})
 await store.putTrial({draftKey:key,trialIndex:0,payload:{trialIndex:0},createdAt:1})
 await store.sealForSubmission(key,s=>({submissionId:s.meta.submissionId,trials:s.trials}))
 return {store,key,meta}
}
const config=motConfig('experience'),protocol={schemaVersion:1 as const,key:'mot/1.1.1/1.1.0',version:'1.1.1',clock:'performance' as const,randomizationAlgorithmVersion:'mot-fnv1a-mulberry32-v1',trialEnvelopeVersion:1 as const,phases:[{key:'test' as const,persists:true,required:true}],measurementCriticalConfigPaths:['*']}
const session:CognitiveSession={sessionId:identity.sessionId,assignmentId:'assignment',testType:'mot',attemptNo:1,attemptEpoch:1,status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',nativeTask:true,definitionHash:h,configVersion:'1.0.0',engineVersion:'1.1.1',scoringVersion:'1.1.0',config:{...config},randomSeed:'seed',protocol,protocolSignature:b,sessionSnapshot:{schemaVersion:1,frozenAt:'2026-10-26T00:00:00Z',testType:'mot',engineVersion:'1.1.1',scoringVersion:'1.1.0',configVersion:'1.0.0',config:{...config},configHash:h,protocol,protocolSignature:b}}
describe('MOT native core and raw archive boundary',()=>{
 it('canonical raw hash matches equivalent key order and preserves every frame',()=>{expect(cognitiveRawDigest({b:2,a:1})).toBe(cognitiveRawDigest({a:1,b:2}));expect(cognitiveRawDigest(rawPayload)).not.toBe(cognitiveRawDigest({...rawPayload,practice:[1]}))})
 it('rejects Memory storage as durable',()=>expect(()=>requireCognitiveDurability(createFinalDraftStore())).toThrow('耐久'))
 it('core completion retains sealed full raw and report lifecycle separately',async()=>{const {store,key}=await draft();const state=await finishCognitiveCoreDraft(key,store);expect(state?.coreSaved).toBe(true);expect(state?.archiveConfirmed).toBe(false);expect((await store.get(key))?.status).toBe('COMPLETED');expect((await store.get(key))?.cognitiveRawArchive?.rawPayload).toEqual(rawPayload)})
 it('generic cleanup cannot delete unconfirmed native original',async()=>{const {store,key}=await draft();await store.delete(key);expect((await store.get(key))?.cognitiveRawArchive?.rawSha256).toBe(rawSha256)})
 it('old legacy completion without raw still deletes its draft',async()=>{const {store,key}=await draft(false);await finishCognitiveCoreDraft(key,store);expect(await store.get(key)).toBeNull()})
 it('legacy unsealed completed cleanup remains compatible',async()=>{const store=createFinalDraftStore(),key='legacy-unsealed';await store.ensure(createFinalDraftMeta({draftKey:key,instrument:'cognitive',attemptId:'s',attemptEpoch:1,submissionId:'sub',definitionHash:h,contextSnapshotHash:null,deliveryMode:'final_only'}));await finishCognitiveCoreDraft(key,store);expect(await store.get(key)).toBeNull()})
 it('archive cannot run before authoritative core saved',async()=>{const {store,key}=await draft();const send=vi.fn();await expect(retryCognitiveRawArchive(key,send,store)).rejects.toThrow('尚未确认');expect(send).not.toHaveBeenCalled()})
 it('network failure retains original identity/raw; retry neither scores nor re-exposes',async()=>{const {store,key}=await draft();await finishCognitiveCoreDraft(key,store);await expect(retryCognitiveRawArchive(key,async()=>{throw Error('offline')},store)).rejects.toThrow('offline');const meta=await store.get(key);expect(meta?.cognitiveRawArchive?.archiveState).toBe('retry');const send=vi.fn(async(i,r)=>{expect(i).toEqual(identity);expect(r).toEqual({rawPayload,rawSha256});return receipt});await retryCognitiveRawArchive(key,send,store);expect(send).toHaveBeenCalledTimes(1);expect(await store.get(key)).toBeNull()})
 it.each([{...receipt,attemptEpoch:2},{...receipt,rawSha256:b},{...receipt,assetId:undefined},{...receipt,sizeBytes:0}])('wrong/incomplete archive confirmation retains original (%j)',async(value)=>{const {store,key}=await draft();await finishCognitiveCoreDraft(key,store);await expect(retryCognitiveRawArchive(key,async()=>value,store)).rejects.toThrow();expect((await store.get(key))?.cognitiveRawArchive?.rawPayload).toEqual(rawPayload)})
 it('pending server receipt never deletes local originals',async()=>{const {store,key}=await draft();await finishCognitiveCoreDraft(key,store);await retryCognitiveRawArchive(key,async()=>({...receipt,archiveState:'pending',archiveConfirmed:false}),store);expect((await store.get(key))?.cognitiveRawArchive?.archiveConfirmed).toBe(false)})
 it('void callback/local ACK cannot become coreSaved',async()=>{const {meta}=await draft();expect(()=>nativeCoreReceipt(session,meta,undefined)).toThrow('尚未确认');expect(()=>nativeCoreReceipt(session,meta,{...identity,coreSaved:true,payloadHash:b})).toThrow('尚未确认')})
 it('real native FINAL receipt binds completed session/submission/epoch',async()=>{const {meta}=await draft();const good={...identity,coreSaved:true,payloadHash:b,response:{sessionId:session.sessionId,status:'COMPLETED'}};expect(nativeCoreReceipt(session,meta,good).payloadHash).toBe(b);expect(()=>nativeCoreReceipt(session,meta,{...good,submissionId:'old'})).toThrow();expect(()=>nativeCompletedReceipt({...session,status:'COMPLETED',submissionId:'old',submissionPayloadHash:b},meta)).toThrow();expect(nativeCompletedReceipt({...session,status:'COMPLETED',submissionId:'submission',submissionPayloadHash:b},meta).coreSaved).toBe(true)})
 it('core receipt rejects a stale local draft epoch even when server identity is current',async()=>{const {meta}=await draft();expect(()=>nativeCoreReceipt(session,{...meta,attemptEpoch:2},{...identity,coreSaved:true,payloadHash:b,response:{sessionId:session.sessionId,status:'COMPLETED'}})).toThrow('尚未确认')})
 it('actual snapshot and epoch mismatch fails closed',()=>{expect(()=>assertNativeSession({...session,attemptEpoch:2})).toThrow();expect(()=>assertNativeSession({...session,config:{...config,totalTrials:45}})).toThrow();expect(()=>assertNativeSession({...session,definitionHash:b})).toThrow()})
 it('native envelope preserves captured onset/end, flags and all relevant events',()=>{const core={trialIndex:2,speed:4,startedAtPerfMs:12,endedAtPerfMs:10123,completionTimeMs:10111,timedOut:false,prematureInputs:1,interruptions:['visibility_lost','viewport_changed','window_blur','runner_restart']} as MotTrial;const e=nativeMotEnvelope(core);expect(e.startedAtPerfMs).toBe(12);expect(e.endedAtPerfMs).toBe(10123);expect(e.flags).toEqual({timeout:false,premature:true});expect(e.qualityEvents).toEqual(['visibility_lost','window_blur','runner_restart']);expect(e.payload).toEqual(core)})
 it('single-flight shares a delayed upload and receipt cleanup across consumers',async()=>{
  const {store,key}=await draft();await finishCognitiveCoreDraft(key,store)
  let enter!:()=>void,resolve!: (value:typeof receipt)=>void
  const entered=new Promise<void>(r=>{enter=r}),delayed=new Promise<typeof receipt>(r=>{resolve=r})
  const send=vi.fn(async()=>{enter();return delayed})
  const first=retryCognitiveRawArchive(key,send,store),second=retryCognitiveRawArchive(key,send,store)
  expect(second).toBe(first);await entered;expect(send).toHaveBeenCalledTimes(1)
  expect((await store.get(key))?.cognitiveRawArchive?.archiveConfirmed).toBe(false)
  resolve(receipt)
  const [a,b]=await Promise.all([first,second]);expect(a).toBe(b);expect(a.archiveConfirmed).toBe(true)
  expect(await store.get(key)).toBeNull()
  await expect(retryCognitiveRawArchive(key,send,store)).rejects.toThrow('尚未确认')
  expect(send).toHaveBeenCalledTimes(1)
 })
 it('single-flight releases a failed delayed upload so the same sealed package can retry',async()=>{
  const {store,key}=await draft();await finishCognitiveCoreDraft(key,store)
  let enter!:()=>void,reject!: (error:Error)=>void
  const entered=new Promise<void>(r=>{enter=r}),delayed=new Promise<typeof receipt>((_r,j)=>{reject=j})
  const failedSend=vi.fn(async()=>{enter();return delayed})
  const first=retryCognitiveRawArchive(key,failedSend,store),second=retryCognitiveRawArchive(key,failedSend,store)
  expect(second).toBe(first);await entered
  const results=Promise.allSettled([first,second]);reject(Error('synthetic delayed upload failure'))
  const rejected=await results;expect(rejected.every(r=>r.status==='rejected')).toBe(true);expect(failedSend).toHaveBeenCalledTimes(1)
  expect((await store.get(key))?.cognitiveRawArchive).toMatchObject({rawSha256,rawPayload,archiveState:'retry',archiveConfirmed:false})
  const retrySend=vi.fn(async(i,raw)=>{expect(i).toEqual(identity);expect(raw).toEqual({rawPayload,rawSha256});return receipt})
  const retried=retryCognitiveRawArchive(key,retrySend,store);expect(retried).not.toBe(first)
  expect((await retried).archiveConfirmed).toBe(true);expect(retrySend).toHaveBeenCalledTimes(1);expect(await store.get(key)).toBeNull()
 })

})
