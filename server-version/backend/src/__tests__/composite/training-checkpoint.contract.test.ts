import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({tx:{} as any,transaction:vi.fn(),slots:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
vi.mock('../../utils/encryption',()=>({encryptSerializedField:(s:string)=>`encrypted:${s}`,decryptField:(s:string)=>JSON.parse(s.slice(10))}))
vi.mock('../../modules/assessment-runtime/slot-set',()=>({loadFrozenActiveSlotSet:mocks.slots}))
vi.mock('../../modules/assessment-runtime/runtime-snapshot',()=>({loadFrozenScaleRuntimeSnapshot:vi.fn()}))
vi.mock('../../modules/assessment-runtime/situational-runtime-snapshot',()=>({decryptFrozenSituationalRuntimeSnapshot:vi.fn()}))
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { freezeTrainingPersistenceSnapshot } from '../../modules/composite/training-persistence.policy'
import { assertTrainingCheckpointBounds, clearTrainingCheckpoint, readTrainingCheckpoint, saveTrainingCheckpoint,cleanupExpiredTrainingCheckpoints } from '../../modules/composite/training-checkpoint.service'
const policy={schemaVersion:1 as const,checkpoint:{enabled:true as const,ttlHours:1},localCognitive:null}
const publication={id:'parent',publishedAt:new Date('2026-01-01'),status:'PUBLISHED',productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',trainingFlowDigest:null,trainingVariantDigest:null,expiresAt:null,trainingPersistencePolicyHash:canonicalHash(policy)}
const identity={schemaVersion:1,compositeId:'parent',courseId:'course',publishedAt:publication.publishedAt.toISOString(),productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',trainingFlowDigest:null,trainingVariantDigest:null}
const snapshot=freezeTrainingPersistenceSnapshot({policy,policyHash:canonicalHash(policy),publicationIdentity:identity,attemptId:'attempt',attemptEpoch:1,compositeId:'parent',courseId:'course',cutoffs:[]})!
const definitionHash='a'.repeat(64),snapshotHash=canonicalHash(snapshot)
const input=()=>({expectedRevision:0,attemptEpoch:1,envelope:{schemaVersion:1 as const,snapshotHash,definitionHash,drafts:[],cognitiveResults:[]}})
let row:any,attempt:any,course:any
beforeEach(()=>{
 row=null;course={courseType:'TRAINING_COURSE',status:'PUBLISHED',isLibrary:false,endedAt:null}
 attempt={id:'attempt',compositeAssessmentId:'parent',deliveryCourseId:'course',userId:'user',recoveryTokenHash:null,attemptEpoch:1,status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',trainingPersistenceSnapshot:snapshot,trainingPersistenceSnapshotHash:snapshotHash,frozenActiveSlotSetHash:definitionHash,compositeAssessment:publication,accessToken:null}
 const update=(data:any)=>{row={...row,...data,revision:typeof data.revision==='object'?row.revision+data.revision.increment:data.revision??row.revision};return row}
 mocks.tx={$executeRawUnsafe:vi.fn(),$queryRaw:vi.fn().mockResolvedValue([]),
  compositeAssessmentAttempt:{findUnique:vi.fn().mockImplementation(()=>attempt),findUniqueOrThrow:vi.fn().mockResolvedValue({frozenActiveSlotSetEncrypted:'slot-cipher'})},
  course:{findUnique:vi.fn().mockImplementation(()=>course)},
  assessmentUnitSnapshot:{findMany:vi.fn().mockResolvedValue([])},
  trainingAttemptCheckpoint:{findUnique:vi.fn().mockImplementation(()=>row),create:vi.fn().mockImplementation(({data})=>row={successfulSaveCount:0,...data}),update:vi.fn().mockImplementation(({data})=>update(data)),updateMany:vi.fn().mockImplementation(({data})=>{if(row?.payloadEncrypted){update(data);return {count:1}}return {count:0}})},
 }
 mocks.transaction.mockReset().mockImplementation((fn:any)=>fn(mocks.tx))
 mocks.slots.mockReset().mockResolvedValue({snapshotHash:definitionHash,attemptEpoch:1,slots:[]})
})
describe('Training checkpoint service contracts (mock transaction; PG races separate)',()=>{
 it('allows authenticated no-token and anonymous null-round through same bounded header',async()=>{
  await saveTrainingCheckpoint('attempt',{userId:'user'},input())
  expect(row.successfulSaveCount).toBe(1)
  expect(row.payloadEncrypted).toMatch(/^encrypted:/)
  expect(mocks.tx.compositeAssessmentAttempt.findUnique).toHaveBeenCalledTimes(2)
  expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(3)
  expect(mocks.tx.course.findUnique).toHaveBeenCalledTimes(1)
  expect(mocks.tx.$executeRawUnsafe.mock.calls).toEqual([["SET LOCAL lock_timeout = '500ms'"],["SET LOCAL statement_timeout = '2000ms'"]])
  expect(mocks.transaction.mock.calls[0][1]).toEqual({maxWait:1000,timeout:5000})
  attempt.userId=null;attempt.recoveryTokenHash='credential';row=null
  await saveTrainingCheckpoint('attempt',{recoveryTokenHash:'credential'},input())
  expect(row.roundId).toBeNull()
 })
 it('rejects cross-owner and stale epoch before decrypting definitions',async()=>{
  await expect(saveTrainingCheckpoint('attempt',{userId:'other'},input())).rejects.toMatchObject({statusCode:403})
  await expect(saveTrainingCheckpoint('attempt',{userId:'user'},{...input(),attemptEpoch:2})).rejects.toMatchObject({statusCode:409})
  expect(mocks.slots).not.toHaveBeenCalled()
 })
 it('legacy null policy exits after one compact query and no locks or runtime loads',async()=>{
  attempt.trainingPersistenceSnapshotHash=null
  await expect(readTrainingCheckpoint('attempt',{userId:'user'})).rejects.toMatchObject({statusCode:403})
  expect(mocks.tx.compositeAssessmentAttempt.findUnique).toHaveBeenCalledTimes(1)
  expect(mocks.tx.$queryRaw).not.toHaveBeenCalled()
  expect(mocks.slots).not.toHaveBeenCalled()
 })
 it('clear establishes retained revision even before first save, and invalidates stale CAS',async()=>{
  await clearTrainingCheckpoint('attempt',{userId:'user'},{expectedRevision:0,attemptEpoch:1})
  expect(row).toMatchObject({revision:1,successfulSaveCount:0})
  await expect(saveTrainingCheckpoint('attempt',{userId:'user'},input())).rejects.toMatchObject({statusCode:409})
 })
 it('100 cumulative saves survives clear and expiry without budget reset',async()=>{
  for(let i=0;i<100;i++)await saveTrainingCheckpoint('attempt',{userId:'user'},{...input(),expectedRevision:i})
  await clearTrainingCheckpoint('attempt',{userId:'user'},{expectedRevision:100,attemptEpoch:1})
  expect(row).toMatchObject({revision:101,successfulSaveCount:100,payloadEncrypted:null,payloadHash:null})
  await expect(saveTrainingCheckpoint('attempt',{userId:'user'},{...input(),expectedRevision:101})).rejects.toMatchObject({statusCode:429})
 })
 it('expiry commits payload erasure and stale CAS result, retains identity and count',async()=>{
  await saveTrainingCheckpoint('attempt',{userId:'user'},input());row.expiresAt=new Date(0)
  expect(await saveTrainingCheckpoint('attempt',{userId:'user'},{...input(),expectedRevision:1})).toMatchObject({conflict:true,revision:2,successfulSaveCount:1})
  expect(row.payloadEncrypted).toBeNull();expect(row.snapshotHash).toBe(snapshotHash)
 })
 it('course closure erases payload without exception rollback',async()=>{
  await saveTrainingCheckpoint('attempt',{userId:'user'},input());course.status='COMPLETED'
  expect(await readTrainingCheckpoint('attempt',{userId:'user'})).toEqual({closed:true})
  expect(row.payloadEncrypted).toBeNull();expect(row.successfulSaveCount).toBe(1)
 })
 it('a newly earlier course cutoff tightens retained expiry without spending a save',async()=>{
  await saveTrainingCheckpoint('attempt',{userId:'user'},input())
  course.endedAt=new Date(Date.now()+30_000)
  const result:any=await readTrainingCheckpoint('attempt',{userId:'user'})
  expect(result.expiresAt).toEqual(course.endedAt)
  expect(row.successfulSaveCount).toBe(1)
  expect(row.revision).toBe(2)
 })
 it('recovery filters accepted FINAL slots but preserves other unfinished drafts',async()=>{
  const envelope={...input().envelope,drafts:[{slotKey:'scale:accepted',answers:{x:1}},{slotKey:'scale:pending',answers:{y:2}}]}
  row={revision:2,successfulSaveCount:1,snapshotHash,definitionHash,payloadHash:canonicalHash(envelope),payloadEncrypted:`encrypted:${JSON.stringify(envelope)}`,expiresAt:new Date(Date.now()+60000)}
  mocks.tx.assessmentUnitSnapshot.findMany.mockResolvedValue([{slotKey:'scale:accepted'}])
  const result:any=await readTrainingCheckpoint('attempt',{userId:'user'})
  expect(result.envelope.drafts).toEqual([envelope.drafts[1]])
  expect(result.discardedTerminalSlotKeys).toEqual(['scale:accepted'])
  expect(row.payloadEncrypted).toContain('scale:pending')
 })
 it('maintenance is one bounded SKIP LOCKED update under timeouts',async()=>{
  await cleanupExpiredTrainingCheckpoints()
  const text=mocks.tx.$queryRaw.mock.calls[0][0].join('')
  expect(text).toContain('LIMIT 100 FOR UPDATE SKIP LOCKED')
  expect(text).toContain('payload_encrypted IS NOT NULL')
  expect(text).not.toContain('DELETE')
 })
 it('rejects excessive nesting/nodes/UTF8 before canonical encoding',()=>{
  let nested:any=0;for(let i=0;i<20;i++)nested={a:nested}
  expect(()=>assertTrainingCheckpointBounds(nested)).toThrow('嵌套')
  expect(()=>assertTrainingCheckpointBounds('中'.repeat(22000))).toThrow('64KB')
  expect(()=>assertTrainingCheckpointBounds({score:Infinity})).toThrow('数值')
 })
})
