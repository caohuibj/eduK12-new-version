import {it,expect,vi} from 'vitest'
import {createFinalDraftMeta,createFinalDraftStore} from '../../../../services/persistence/finalDraftStore'
import {createNativeContentPort,retainedNativeContentContext} from '../native-content-port'
import {nativeCoreReceipt} from '../native-session-contract'
import {nativeContentCases} from '../../../../../../backend/src/__tests__/cognitive/native-content-fixtures.test-support'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
vi.mock('../raw-archive',async()=>({...await vi.importActual<typeof import('../raw-archive')>('../raw-archive'),requireCognitiveDurability:vi.fn()}))
it('keeps the frozen administration on reload and rejects an alternate claim while the original FINAL is in flight',async()=>{
 const f=nativeContentCases.find(f=>f.name==='hearts-flowers')!,store=createFinalDraftStore(),meta=createFinalDraftMeta({draftKey:'native-recovery',instrument:'cognitive',attemptId:f.authority.sessionId,attemptEpoch:1,definitionHash:f.authority.configHash,submissionId:'recovery',contextSnapshotHash:null,deliveryMode:'final_only'})
 await store.ensure(meta)
 const old={...f.context,administration:{viewportCss:{width:390,height:844}}},fresh={...old,administration:{viewportCss:{width:820,height:1180}}}
 let release!:()=>void;const hold=new Promise<void>(resolve=>{release=resolve}),host={appendEnvelope:vi.fn(async()=>true),sealRaw:vi.fn(async()=>{await hold}),complete:vi.fn(async()=>({coreSaved:true as const,sessionId:meta.attemptId,attemptEpoch:1,definitionHash:meta.definitionHash,submissionId:meta.submissionId,payloadHash:'b'.repeat(64),nativeReport:f.publicReport}))}
 const port=createNativeContentPort(meta,old,{manifest:()=>f.detail.manifest,envelope:r=>f.adapter.envelope(r) as unknown as Record<string,unknown>,isReport:(v:unknown):v is unknown=>f.adapter.isReport(v)},host,store)
 await port.prepareLocalAttempt(old,f.detail.manifest,f.detail.realm);await port.persistLocalDraft(f.record)
 expect(await retainedNativeContentContext(meta,fresh,store)).toEqual(old)
 const first=port.finalize(f.claim),retry=port.finalize(structuredClone(f.claim));expect(first).toBe(retry)
 await expect(port.finalize({...f.claim,terminationReason:'alternate'})).rejects.toThrow('不能更换')
 release();expect((await first).report).toEqual(f.publicReport.report)
 const session={nativeTask:true,deliveryMode:'FINAL_ONLY',sessionId:meta.attemptId,attemptNo:1,attemptEpoch:1,testType:f.name,engineVersion:f.authority.engineVersion,scoringVersion:f.authority.scoringVersion,configVersion:f.authority.configVersion,definitionHash:meta.definitionHash,protocolSignature:f.authority.protocolSignature,protocol:f.context.snapshot.protocol,config:f.input.config,sessionSnapshot:f.context.snapshot} as any
 const receipt={...await host.complete(),response:{sessionId:meta.attemptId,status:'COMPLETED',result:{report:{qualityState:f.publicReport.state,nativeReport:f.publicReport}}}}
 expect(nativeCoreReceipt(session,meta,receipt).nativeReport).toEqual(f.publicReport)
 expect(()=>nativeCoreReceipt(session,meta,{...receipt,response:{...receipt.response,result:{report:{qualityState:'invalid',nativeReport:f.publicReport}}}})).toThrow('不一致')
})
