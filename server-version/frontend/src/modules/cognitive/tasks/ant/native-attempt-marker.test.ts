import {it,expect,vi} from 'vitest'
import archive from '../../../../../../../docs/cognitive-library/onboarding-content-20261028/batch-3/ant-browser/archived-fixture.json'
import {createFinalDraftMeta,createFinalDraftStore} from '../../../../services/persistence/finalDraftStore'
import {createNativeContentPort} from '../../core/native-content-port'
import {cognitiveRawDigest as digest} from '../../core/raw-archive'
import {antNativeManifest,antNativeEnvelope,type AntNativeRawRecord} from './generated/native-protocol'
import {isNativeAntReport,type NativeAntReport} from './generated/native-report'
import {antNativePorts,type NativeAntContext,type NativeAntRecord,type NativeAntClaim} from './native-ports'

vi.mock('../../core/raw-archive',async()=>({...await vi.importActual<typeof import('../../core/raw-archive')>('../../core/raw-archive'),requireCognitiveDurability:vi.fn()}))
it('refuses a reopened ANT exposure and keeps the first sealed original available for saving',async()=>{
 const original=archive[0],context=structuredClone(original.detail.context) as unknown as NativeAntContext
 const store=createFinalDraftStore(),meta=createFinalDraftMeta({draftKey:'ant-independent-reopen-marker',instrument:'cognitive',attemptId:original.authority.session.id,attemptEpoch:1,definitionHash:context.snapshot.configHash,submissionId:'synthetic-reopen-review',contextSnapshotHash:null,deliveryMode:'final_only'})
 await store.ensure(meta)
 const host={appendEnvelope:vi.fn(),sealRaw:vi.fn(),complete:vi.fn()}
 const create=()=>createNativeContentPort<NativeAntContext,NativeAntRecord,NativeAntClaim,AntNativeRawRecord,NativeAntReport>(meta,context,{manifest:c=>antNativeManifest(c.snapshot.config as never,c.randomSeed),envelope:r=>antNativeEnvelope(r,digest(r.raw.display)),isReport:isNativeAntReport},host,store)
 const first=create(),ports=antNativePorts(context,first),identity={contextId:context.contextKey,configHash:context.snapshot.configHash,protocolSignature:context.snapshot.protocolSignature}
 const marker=await ports.claimAttemptExposure(identity);expect(marker).toMatchObject({fresh:true,durable:true,contextId:context.contextKey})
 const raw=structuredClone(original.detail.records.find(r=>r.phase==='test')!.raw) as unknown as AntNativeRawRecord
 await ports.persistLocalDraft(raw,{contextId:context.contextKey,key:raw.key,recordDigest:digest(raw)})
 const inventory=await first.inventory()
 expect(inventory.binding?.context.administration).toEqual(raw.raw.display)
 expect(inventory.records).toHaveLength(1)
 const reopened=create()
 await expect(antNativePorts(context,reopened).claimAttemptExposure(identity)).rejects.toThrow()
 expect(await reopened.inventory()).toEqual(inventory)
 expect(host.appendEnvelope).not.toHaveBeenCalled();expect(host.complete).not.toHaveBeenCalled()
 await store.delete(meta.draftKey,meta)
})
