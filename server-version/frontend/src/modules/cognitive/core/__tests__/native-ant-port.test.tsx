import React from 'react'
import {it,expect,vi,afterEach} from 'vitest'
import {render,fireEvent,waitFor,cleanup} from '@testing-library/react'
import {createFinalDraftMeta,createFinalDraftStore,finalDraftStore} from '../../../../services/persistence/finalDraftStore'
import {createNativeContentPort} from '../native-content-port'
import {cognitiveRawDigest as digest} from '../raw-archive'
import {antNativePorts,type NativeAntContext,type NativeAntRecord,type NativeAntClaim} from '../../tasks/ant/native-ports'
import {antNativeManifest,antNativeEnvelope,type AntNativeRawRecord} from '../../tasks/ant/generated/native-protocol'
import {isNativeAntReport,type NativeAntReport} from '../../tasks/ant/generated/native-report'
import {nativeAntFixture} from '../../../../../../backend/src/__tests__/cognitive/native-ant-fixtures.test-support'
import {validateNativeContentArchive} from '../../../../../../backend/src/modules/cognitive/content-candidates/native-registry/archive-detail'
import {resolveRunner} from '../../registry'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
vi.mock('../raw-archive',async()=>({...await vi.importActual<typeof import('../raw-archive')>('../raw-archive'),requireCognitiveDurability:vi.fn()}))
afterEach(cleanup)
it('maps ANT local receipts to the shared frozen final, retains originals on a lost ACK and returns the exact stored public report',async()=>{
 const f=nativeAntFixture(),store=createFinalDraftStore(),meta=createFinalDraftMeta({draftKey:'ant-port-unit',instrument:'cognitive',attemptId:f.authority.sessionId,attemptEpoch:1,definitionHash:f.authority.configHash,submissionId:'ant-unit',contextSnapshotHash:null,deliveryMode:'final_only'});await store.ensure(meta)
 let lose=true
 const host={appendEnvelope:vi.fn(async e=>{expect(e).toEqual(f.input.trials[0]);return true}),sealRaw:vi.fn(async raw=>{expect(validateNativeContentArchive(raw,f.authority)).toEqual(raw)}),complete:vi.fn(async()=>{if(lose){lose=false;throw Error('lost ANT ACK')};return {coreSaved:true as const,sessionId:meta.attemptId,attemptEpoch:1,submissionId:meta.submissionId,definitionHash:meta.definitionHash,payloadHash:'c'.repeat(64),nativeReport:f.publicReport}})}
 const context=f.context as NativeAntContext,port=createNativeContentPort<NativeAntContext,NativeAntRecord,NativeAntClaim,AntNativeRawRecord,NativeAntReport>(meta,context,{manifest:c=>antNativeManifest(c.snapshot.config as never,c.randomSeed),envelope:r=>antNativeEnvelope(r,digest(r.raw.display)),isReport:isNativeAntReport},host,store),ports=antNativePorts(context,port)
 await ports.claimAttemptExposure({contextId:context.contextKey,configHash:context.snapshot.configHash,protocolSignature:context.snapshot.protocolSignature})
 await ports.persistLocalDraft(f.record.raw,{contextId:context.contextKey,key:f.record.raw.key,recordDigest:digest(f.record.raw)})
 const sealed=[{key:f.record.raw.key,recordDigest:digest(f.record.raw)}],body={contextId:context.contextKey,configHash:context.snapshot.configHash,protocolSignature:context.snapshot.protocolSignature,localRecordKeys:sealed.map(r=>r.key),localDurableCount:1,status:'limited' as const,reason:'synthetic-boundary-stop',fixture:false,localRecordSetDigest:digest(sealed)},completion={...body,requestDigest:digest(body)}
 await expect(ports.onTaskComplete(completion)).rejects.toThrow('lost ANT ACK')
 expect((await port.inventory()).records).toHaveLength(1)
 expect(await ports.onTaskComplete(completion)).toMatchObject({serverSaved:true,requestDigest:completion.requestDigest,localRecordSetDigest:completion.localRecordSetDigest})
 expect(vi.mocked(host.sealRaw).mock.calls[1][0]).toEqual(vi.mocked(host.sealRaw).mock.calls[0][0])
})
it('mounts the actual ANT native runner, requires the measured calibration checkbox and durably freezes it before first exposure',async()=>{
 const f=nativeAntFixture(),meta=createFinalDraftMeta({draftKey:'ant-native-readiness',instrument:'cognitive',attemptId:f.authority.sessionId,attemptEpoch:1,definitionHash:f.authority.configHash,submissionId:'ant-native-ready',contextSnapshotHash:null,deliveryMode:'final_only'});await finalDraftStore.ensure(meta)
 const host={getDraftIdentity:vi.fn(async()=>meta),appendEnvelope:vi.fn(),sealRaw:vi.fn(),complete:vi.fn()},entry=resolveRunner('ant','1.1.0')!;await entry.prepareRunner!();const Runner=entry.RunnerComponent
 const view=render(<Runner trialIndex={0} onTrialComplete={async()=>true} nativeHost={host} taskContext={{nativeTask:true,sessionId:meta.attemptId,attemptNo:1,attemptEpoch:1,definitionHash:meta.definitionHash,testType:'ant',engineVersion:'1.1.0',scoringVersion:'1.1.0',configVersion:'1.1.0',config:f.input.config as any,randomSeed:f.input.randomSeed,sessionSnapshot:f.context.snapshot as any}}/>)
 await waitFor(()=>expect(view.getByRole('button',{name:'校准屏幕'})).toBeDefined());fireEvent.click(view.getByRole('button',{name:'校准屏幕'}))
 expect((view.getByRole('button',{name:'确认校准'}) as HTMLButtonElement).disabled).toBe(true)
 fireEvent.click(view.getByRole('checkbox'));fireEvent.click(view.getByRole('button',{name:'确认校准'}))
 await waitFor(()=>expect(view.getByRole('button',{name:'开始练习'})).toBeDefined());fireEvent.click(view.getByRole('button',{name:'开始练习'}))
 await waitFor(async()=>expect((await finalDraftStore.get(meta.draftKey))?.frozenInstrumentArtifacts?.['cognitive.native-content.open.v1']).toBeDefined())
 const opened=(await finalDraftStore.get(meta.draftKey))!.frozenInstrumentArtifacts!['cognitive.native-content.open.v1'] as any
 expect(opened.context.administration).toMatchObject({origin:'host_physical_calibration',geometryVersion:'ant-calibrated-geometry-v1',referenceMm:50,viewingDistanceMm:350})
 expect(host.complete).not.toHaveBeenCalled();view.unmount()
 await waitFor(()=>expect(document.querySelector('[data-ant-view]')).toBeNull());await finalDraftStore.delete(meta.draftKey,meta)
})
