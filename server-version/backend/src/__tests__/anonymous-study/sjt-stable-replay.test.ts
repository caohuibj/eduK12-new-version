import {describe,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({runtime:null as any,queries:[] as string[],currentHash:'2'.repeat(64),rawCreate:vi.fn(),update:vi.fn(),transaction:vi.fn(),query:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:(...args:any[])=>state.query(...args)}}))
vi.mock('../../services/unitSubmitAdmission',()=>({withUnitSubmitAdmission:(run:()=>unknown)=>run()}))
vi.mock('../../services/questionnaireProgressService',()=>({withFinalOnlyCompletionTransaction:(run:(tx:any)=>unknown)=>state.transaction(run)}))
vi.mock('../../modules/composite/composite.service',()=>({finalizeCompositeAttemptIfReady:vi.fn()}))
vi.mock('../../modules/situational/situational-runtime.service',()=>({
 loadSituationalAttemptRuntime:async()=>state.runtime,loadEmbeddedSituationalAttemptRuntime:async()=>state.runtime,
 assertSituationalAttemptOwner:vi.fn(),assertRowMatchesSnapshot:vi.fn(),assertEmbeddedSituationalAttemptBinding:vi.fn(),SITUATIONAL_ATTEMPT_COMMIT_SELECT:{},
 situationalAttemptForResponse:(row:any,_snapshot:any,options:any)=>({attemptId:row.id,status:row.status,...options}),
}))
import fixture from '../../modules/situational/authoring/examples/online-hand-calculated.json'
import {compileSjtOnlineDocument} from '../../modules/situational/authoring/online'
import {freezeSituationalRuntimeAtAttemptStart} from '../../modules/assessment-runtime/situational-runtime-snapshot'
import {submitSituationalAttemptFinal} from '../../modules/situational/situational-final-submit.service'
// Real SJT service + real study principal helper; only persistence/runtime loading
// is a test double. This is precise replay wiring coverage, not end-to-end PG.
describe('SJT stable study completed replay wiring',()=>{
 it('checks the actual fresh-parent helper before returning old completed facts',async()=>{
  process.env.DATA_ENCRYPTION_KEY='a'.repeat(64)
  const doc=structuredClone(fixture);doc.goldenCases=[]
  for(const scene of doc.display.scenes)for(const q of scene.questions){q.required=false;q.allowRefusal=true}
  const compiled=compileSjtOnlineDocument(doc),snapshot=freezeSituationalRuntimeAtAttemptStart({instrumentKey:compiled.package.key,instrumentVersion:compiled.package.instrumentVersion,definition:compiled.package.definition,online:compiled.package.online})
  const row:any={id:'attempt',userId:'owner',compositeAttemptId:null,status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',attemptEpoch:1,definitionHash:snapshot.definitionHash,instrumentVersion:snapshot.instrumentVersion,compiledRuntimeHash:snapshot.compiledRuntimeHash,scoringVersion:snapshot.scoringVersion,startedAt:new Date(),submissionId:null,submissionPayloadHash:null}
  state.runtime={row,snapshot}
  state.query.mockImplementation(async(q:any)=>{
   const text=Array.from(q.strings??q).join('');state.queries.push(text)
   return text.includes('FROM anonymous_study_attempts')?[{scopeValid:true,attemptId:'parent',hash:'1'.repeat(64),epoch:1,currentEpoch:1,currentHash:state.currentHash,userId:null,participantStatus:'ACTIVE',slotSetHash:'slot',contextHash:null}]:[{id:'parent'}]
  })
  state.update.mockImplementation(async({data}:any)=>{Object.assign(row,data);return {count:1}})
  state.transaction.mockImplementation((run:(tx:any)=>unknown)=>run({$queryRaw:state.query,situationalAttempt:{findUnique:async()=>row,updateMany:state.update},situationalRawSubmission:{create:state.rawCreate}}))
  const body={attemptId:row.id,userId:'owner',submissionId:'sjt-stable-replay-0001',attemptEpoch:1,definitionHash:snapshot.definitionHash,responseProtocol:'sjt-online-response-v1' as const,responses:[]}
  await submitSituationalAttemptFinal(body)
  expect(state.rawCreate).toHaveBeenCalledTimes(1)
  const committedHash=row.submissionPayloadHash,committedResult=row.resultEncrypted
  expect(typeof committedHash).toBe('string');expect(typeof committedResult).toBe('string')
  // The completed service fact is now presented as a synthetic study-bound
  // runtime row; the new helper itself is NOT mocked or replaced with success.
  row.userId=null;row.compositeAttemptId='parent';row.compositeItemId='item'
  row.compositeAttempt={id:'parent',trainingContentBindingHash:null,trainingReferenceBindingHash:null,trainingFlowSnapshotEncrypted:null,trainingFlowSnapshotHash:null,trainingFlowPathEncrypted:null,trainingFlowPathHash:null,trainingVariantAllocationEncrypted:null,trainingVariantAllocationHash:null,compositeAssessment:{trainingFlowDraft:null,trainingFlowFrozen:null,trainingFlowDigest:null,trainingVariantDraft:null,trainingVariantFrozen:null,trainingVariantDigest:null}}
  const {userId:_,...anonymous}=body
  const input={...anonymous,embedded:{compositeAttemptId:'parent',compositeItemId:'item',compositeSlotKey:'situational:item',recoveryTokenHash:'1'.repeat(64)}}
  await expect(submitSituationalAttemptFinal(input)).rejects.toMatchObject({statusCode:403})
  state.queries=[]
  const replay:any=await submitSituationalAttemptFinal({...input,embedded:{...input.embedded,recoveryTokenHash:state.currentHash}})
  expect(replay.replayed).toBe(true)
  const lock=state.queries.findIndex(q=>q.includes('composite_assessment_attempts')&&q.includes('FOR UPDATE'))
  expect(lock).toBeGreaterThanOrEqual(0)
  expect(state.queries.slice(lock+1).some(q=>q.includes('FROM anonymous_study_attempts'))).toBe(true)
  expect(state.rawCreate).toHaveBeenCalledTimes(1);expect(state.update).toHaveBeenCalledTimes(1)
  expect(row.submissionPayloadHash).toBe(committedHash);expect(row.resultEncrypted).toBe(committedResult)
 })
})
