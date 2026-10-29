import React from 'react'
import {afterEach,describe,it,expect,vi} from 'vitest'
import {render,cleanup,waitFor} from '@testing-library/react'
import {createFinalDraftMeta,createFinalDraftStore} from '../../../../services/persistence/finalDraftStore'
import {createNativeContentPort} from '../native-content-port'
import {cognitiveRawDigest as digest,finishCognitiveCoreDraft} from '../raw-archive'
import CognitiveV2ReportCard from '../../CognitiveV2ReportCard'
import {nativeContentCases} from '../../../../../../backend/src/__tests__/cognitive/native-content-fixtures.test-support'
import {validateNativeContentArchive} from '../../../../../../backend/src/modules/cognitive/content-candidates/native-registry/archive-detail'
import type {CognitiveNativeHost} from '../runner.types'
import type {CognitiveV2Report} from '../../types'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
// Explicit Memory contract fixture only. Production ports still require IndexedDbFinalDraftStore.
vi.mock('../raw-archive',async()=>({...await vi.importActual<typeof import('../raw-archive')>('../raw-archive'),requireCognitiveDurability:vi.fn()}))
afterEach(()=>{cleanup();vi.restoreAllMocks()})
describe('real native content host adapters',()=>{
 it.each(nativeContentCases)('$name persists immutable records, retries the same final and reads the stored public report',async f=>{
  const store=createFinalDraftStore(),meta=createFinalDraftMeta({draftKey:'bridge:'+f.name,instrument:'cognitive',attemptId:f.authority.sessionId,attemptEpoch:1,definitionHash:f.authority.configHash,submissionId:'submit-'+f.name,contextSnapshotHash:null,deliveryMode:'final_only'})
  await store.ensure(meta)
  let loseAck=true
  const coreReceipt={coreSaved:true as const,sessionId:meta.attemptId,attemptEpoch:1,definitionHash:meta.definitionHash,submissionId:meta.submissionId,payloadHash:'a'.repeat(64),nativeReport:f.publicReport}
  const host:CognitiveNativeHost={appendEnvelope:vi.fn(async envelope=>{expect(envelope).toEqual(f.input.trials[0]);return true}),
   sealRaw:vi.fn(async payload=>{validateNativeContentArchive(payload,f.authority);await store.mutateCognitiveArchive(meta.draftKey,{sessionId:meta.attemptId,attemptEpoch:1,definitionHash:meta.definitionHash,submissionId:meta.submissionId},{kind:'seal',rawPayload:payload,rawSha256:digest(payload)})}),
   complete:vi.fn(async()=>{if(loseAck){loseAck=false;throw Error('synthetic lost ACK')}
    await store.sealForSubmission(meta.draftKey,()=>({submissionId:meta.submissionId,trials:f.input.trials}),meta)
    await finishCognitiveCoreDraft(meta.draftKey,store,meta);return coreReceipt})}
  const adapter={manifest:()=>f.detail.manifest,envelope:(raw:unknown)=>f.adapter.envelope(raw) as unknown as Record<string,unknown>,isReport:(v:unknown):v is unknown=>f.adapter.isReport(v)}
  const port=createNativeContentPort(meta,f.context,adapter,host,store)
  const open=await port.prepareLocalAttempt(f.context,f.detail.manifest,f.detail.realm);expect(open.fresh).toBe(true)
  await expect(port.prepareLocalAttempt(f.context,f.detail.manifest,{...f.detail.realm,pageInstanceId:'other-tab'})).rejects.toThrow()
  expect(await port.persistLocalDraft(f.record)).toMatchObject({retained:true,recordDigest:f.record.recordDigest})
  await expect(port.persistLocalDraft({...f.record,raw:{bad:'replacement'}})).rejects.toThrow()
  await expect(port.finalize(f.claim)).rejects.toThrow('lost ACK')
  expect((await store.get(meta.draftKey))?.cognitiveRawArchive?.archiveConfirmed).toBe(false)
  const receipt=await port.finalize(f.claim)
  expect(receipt.report).toEqual(f.publicReport.report);expect(receipt.receiptId).toBe(meta.submissionId)
  const calls=vi.mocked(host.sealRaw).mock.calls;expect(calls[1][0]).toEqual(calls[0][0])
  expect((await store.get(meta.draftKey))?.cognitiveRawArchive).toMatchObject({coreSaved:true,archiveConfirmed:false})
  const report:CognitiveV2Report={title:'stored frozen result',qualityState:f.score.quality.state,conclusion:'',headline:[],user:[],detail:[],quality:[],disclaimer:'',practicalTips:[],nativeReport:f.publicReport,
   method:{testType:f.name,engineVersion:f.authority.engineVersion,scoringVersion:f.authority.scoringVersion,configVersion:f.authority.configVersion,protocolSignature:f.authority.protocolSignature,profile:'experience'}}
  const view=render(<CognitiveV2ReportCard report={report}/>)
  await waitFor(()=>expect(view.container.querySelector('article')).not.toBeNull())
  expect(view.container.textContent).toContain('EDUK12.TOP')
  view.rerender(<CognitiveV2ReportCard report={{...report,nativeReport:{...f.publicReport,configHash:'f'.repeat(64)}}}/>)
  expect(view.container.querySelector('article')).toBeNull()
 })
})
