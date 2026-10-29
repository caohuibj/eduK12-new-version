import React from 'react'
import {afterEach,describe,it,expect,vi} from 'vitest'
import {render,cleanup,waitFor} from '@testing-library/react'
import {finalDraftStore,createFinalDraftMeta} from '../../../../services/persistence/finalDraftStore'
import {resolveCognitiveReadinessProfile} from '../readiness'
import {blinkManifest} from '../../tasks/attentional-blink/contracts'
import {effortManifest} from '../../tasks/balloon-effort/contracts'
import {dualManifest} from '../../tasks/dual-arrow/contracts'
import {gradManifest} from '../../tasks/gradcpt/contracts'
import {hfManifest} from '../../tasks/hearts-flowers/contracts'
import {horizonManifest} from '../../tasks/horizon-exploration/contracts'
import {spatialPlan} from '../../tasks/precision-working-memory/generated/protocol'
import {searchManifest} from '../../tasks/visual-search/contracts'
import {resolveRunner} from '../../registry'
import {nativeContentCases} from '../../../../../../backend/src/__tests__/cognitive/native-content-fixtures.test-support'
import {blinkEnvelope} from '../../tasks/attentional-blink/generated/envelope'
import {effortEnvelope} from '../../tasks/balloon-effort/generated/envelope'
import {dualEnvelope} from '../../tasks/dual-arrow/generated/envelope'
import {gradEnvelope} from '../../tasks/gradcpt/generated/envelope'
import {hfEnvelope} from '../../tasks/hearts-flowers/generated/envelope'
import {horizonEnvelope} from '../../tasks/horizon-exploration/generated/envelope'
import {spatialEnvelope} from '../../tasks/precision-working-memory/generated/envelope'
import {searchEnvelope} from '../../tasks/visual-search/generated/envelope'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
vi.mock('../raw-archive',async()=>({...await vi.importActual<typeof import('../raw-archive')>('../raw-archive'),requireCognitiveDurability:vi.fn()}))
afterEach(()=>{cleanup();vi.restoreAllMocks()})
const envelopes:Record<string,(raw:any)=>unknown>={'attentional-blink':blinkEnvelope,'balloon-effort':effortEnvelope,'dual-arrow':dualEnvelope,gradcpt:gradEnvelope,'hearts-flowers':hfEnvelope,'horizon-exploration':horizonEnvelope,'precision-working-memory':spatialEnvelope,'visual-search-two-stage':searchEnvelope}
describe('task-owned native runner readiness',()=>{
 it.each(nativeContentCases)('$name mounts the real instructions with the frozen context and its generated envelope matches the backend',async f=>{
  expect(envelopes[f.name](f.input.trials[0].payload)).toEqual(f.input.trials[0])
  const meta=createFinalDraftMeta({draftKey:'ready:'+f.name,instrument:'cognitive',attemptId:f.authority.sessionId,attemptEpoch:1,definitionHash:f.authority.configHash,submissionId:'ready-submit',contextSnapshotHash:null,deliveryMode:'final_only'})
  await finalDraftStore.ensure(meta)
  const host={getDraftIdentity:vi.fn(async()=>meta),appendEnvelope:vi.fn(async()=>true),sealRaw:vi.fn(async()=>{}),complete:vi.fn()}
  const entry=resolveRunner(f.name,f.authority.engineVersion)!
  expect(entry).toBeDefined();expect(entry.NativeReportComponent).toBeDefined()
  await entry.prepareRunner!()
  const Runner=entry.RunnerComponent,view=render(<Runner trialIndex={0} onTrialComplete={async()=>true} nativeHost={host} taskContext={{nativeTask:true,sessionId:meta.attemptId,attemptNo:1,attemptEpoch:1,definitionHash:meta.definitionHash,
   testType:f.name,engineVersion:f.authority.engineVersion,scoringVersion:f.authority.scoringVersion,configVersion:f.authority.configVersion,config:f.input.config,randomSeed:f.input.randomSeed,sessionSnapshot:f.context.snapshot}}/>)
  await waitFor(()=>expect(view.container.querySelector('h1')).not.toBeNull())
  expect(view.container.querySelector('[role="alert"]')).toBeNull()
  expect(host.appendEnvelope).not.toHaveBeenCalled();expect(host.complete).not.toHaveBeenCalled()
  expect((await finalDraftStore.get(meta.draftKey))?.frozenInstrumentArtifacts).toBeUndefined()
  view.unmount();await finalDraftStore.delete(meta.draftKey,meta)
 })
})

const manifests:Record<string,(context:any)=>unknown>={'attentional-blink':blinkManifest,'balloon-effort':effortManifest,'dual-arrow':dualManifest,gradcpt:gradManifest,'hearts-flowers':hfManifest,'horizon-exploration':horizonManifest,'precision-working-memory':c=>[...spatialPlan(c.snapshot.config,c.randomSeed),...[0,1,2].flatMap(round=>spatialPlan(c.snapshot.config,c.randomSeed,'practice',round))],'visual-search-two-stage':searchManifest}
it.each(nativeContentCases)('$name has the exact host readiness and task-owned formal/practice/quiz manifest',f=>{
 expect(resolveCognitiveReadinessProfile(f.name,f.authority.engineVersion)).toMatchObject({retainedRecordRecovery:true,resumeDisposition:'restart-required'})
 expect(manifests[f.name](f.context)).toEqual(f.adapter.manifest(f.input.config,f.input.randomSeed))
})
