import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({tx:{} as any,transaction:vi.fn(),slots:vi.fn(),scale:vi.fn(),sjt:vi.fn(),guard:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
vi.mock('../../utils/encryption',()=>({encryptSerializedField:(s:string)=>`encrypted:${s}`,decryptField:(s:string)=>JSON.parse(s.slice(10))}))
vi.mock('../../modules/assessment-runtime/slot-set',()=>({loadFrozenActiveSlotSet:mocks.slots}))
vi.mock('../../modules/assessment-runtime/runtime-snapshot',()=>({loadFrozenScaleRuntimeSnapshot:mocks.scale}))
vi.mock('../../modules/assessment-runtime/situational-runtime-snapshot',()=>({decryptFrozenSituationalRuntimeSnapshot:mocks.sjt}))
vi.mock('../../modules/scale/scale-collection-guard',()=>({assertTrainingScaleCollectionAllowed:mocks.guard}))
vi.mock('../../modules/composite/composite.service',()=>({compositeFormSectionRuntimeDefinition:(section:any)=>section}))
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
 attempt={id:'attempt',compositeAssessmentId:'parent',deliveryCourseId:'course',userId:'user',recoveryTokenHash:null,attemptEpoch:1,status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',trainingPersistenceSnapshot:snapshot,trainingPersistenceSnapshotHash:snapshotHash,frozenActiveSlotSetHash:definitionHash,frozenActiveSlotSetEncrypted:'slot-cipher',compositeAssessment:publication,accessToken:null}
 const project=(value:any,select:any)=>!value||!select?value:Object.fromEntries(Object.keys(select).map(key=>[key,value[key]]))
 const update=(data:any)=>{row={...row,...data,revision:typeof data.revision==='object'?row.revision+data.revision.increment:data.revision??row.revision};return row}
 mocks.tx={$executeRawUnsafe:vi.fn(),$queryRaw:vi.fn().mockResolvedValue([]),
  compositeAssessmentAttempt:{findUnique:vi.fn().mockImplementation(({select})=>Object.fromEntries(Object.keys(select).map(key=>[key,attempt[key]]))),findUniqueOrThrow:vi.fn(()=>{throw new Error('Unexpected separate slot carrier read')})},
  course:{findUnique:vi.fn().mockImplementation(()=>course)},
  assessmentUnitSnapshot:{findMany:vi.fn().mockResolvedValue([])},
  trainingAttemptCheckpoint:{findUnique:vi.fn().mockImplementation(({select})=>project(row,select)),create:vi.fn().mockImplementation(({data,select})=>project(row={successfulSaveCount:0,...data},select)),update:vi.fn().mockImplementation(({data,select})=>project(update(data),select)),updateMany:vi.fn().mockImplementation(({data})=>{if(row?.payloadEncrypted){update(data);return {count:1}}return {count:0}})},
 }
 mocks.guard.mockReset().mockResolvedValue(undefined)
 mocks.scale.mockReset();mocks.sjt.mockReset()
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
 it('SAVE loads its carrier once in the locked parent projection, with no separate query',async()=>{
  await saveTrainingCheckpoint('attempt',{userId:'user'},input())
  const reads=mocks.tx.compositeAssessmentAttempt.findUnique.mock.calls
  expect(reads).toHaveLength(2)
  expect(reads[0][0].select).not.toHaveProperty('frozenActiveSlotSetEncrypted')
  expect(reads[1][0].select.frozenActiveSlotSetEncrypted).toBe(true)
  expect(mocks.tx.compositeAssessmentAttempt.findUniqueOrThrow).not.toHaveBeenCalled()
  expect(mocks.slots).toHaveBeenCalledExactlyOnceWith('slot-cipher')
 })
 it('GET and CLEAR retain compact projections and never load the slot carrier',async()=>{
  await readTrainingCheckpoint('attempt',{userId:'user'})
  await clearTrainingCheckpoint('attempt',{userId:'user'},{expectedRevision:0,attemptEpoch:1})
  for(const [args] of mocks.tx.compositeAssessmentAttempt.findUnique.mock.calls)expect(args.select).not.toHaveProperty('frozenActiveSlotSetEncrypted')
  expect(mocks.tx.compositeAssessmentAttempt.findUniqueOrThrow).not.toHaveBeenCalled()
  expect(mocks.slots).not.toHaveBeenCalled()
 })
 it.each(['missing carrier','slot hash','slot epoch','envelope hash'] as const)('keeps the %s SAVE boundary',async boundary=>{
  const data=input()
  if(boundary==='missing carrier')attempt.frozenActiveSlotSetEncrypted=null
  if(boundary==='slot hash')mocks.slots.mockResolvedValue({snapshotHash:'wrong',attemptEpoch:1,slots:[]})
  if(boundary==='slot epoch')mocks.slots.mockResolvedValue({snapshotHash:definitionHash,attemptEpoch:2,slots:[]})
  if(boundary==='envelope hash')data.envelope.definitionHash='b'.repeat(64)
  await expect(saveTrainingCheckpoint('attempt',{userId:'user'},data)).rejects.toMatchObject({statusCode:409})
  expect(mocks.tx.trainingAttemptCheckpoint.create).not.toHaveBeenCalled()
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

describe('checkpoint bounded allocation and lookup regressions',()=>{
 it('returns only metadata from SAVE/CLEAR writes, retaining SAVE/GET payload reads',async()=>{
  const metadata={revision:true,successfulSaveCount:true,expiresAt:true}
  await saveTrainingCheckpoint('attempt',{userId:'user'},input())
  expect(mocks.tx.trainingAttemptCheckpoint.create.mock.calls[0][0].select).toEqual(metadata)
  await saveTrainingCheckpoint('attempt',{userId:'user'},{...input(),expectedRevision:1})
  expect(mocks.tx.trainingAttemptCheckpoint.update.mock.calls[0][0].select).toEqual(metadata)
  await readTrainingCheckpoint('attempt',{userId:'user'})
  for(const [args] of mocks.tx.trainingAttemptCheckpoint.findUnique.mock.calls)expect(args.select).toBeUndefined()
  await clearTrainingCheckpoint('attempt',{userId:'user'},{expectedRevision:2,attemptEpoch:1})
  expect(mocks.tx.trainingAttemptCheckpoint.findUnique.mock.lastCall[0].select).toEqual(metadata)
  expect(mocks.tx.trainingAttemptCheckpoint.update.mock.lastCall[0].select).toEqual(metadata)
  expect(row.payloadEncrypted).toBeNull()
 })
 function mixed(count=1){
  const slots:any[]=[],drafts:any[]=[],cognitiveResults:any[]=[],forms:any[]=[],scales:any[]=[],sjts:any[]=[],facts:any[]=[]
  let keyReads=0
  const key=(row:any,name:string,value:string)=>{Object.defineProperty(row,name,{enumerable:true,get:()=>{keyReads++;return value}});return row}
  for(let i=0;i<count;i++){
   const section={items:[{id:`q${i}`}]}
   for(const [kind,id,h] of [['FORM_SECTION',`f${i}`,canonicalHash(section)],['SCALE',`s${i}`,definitionHash],['SITUATIONAL',`j${i}`,definitionHash],['COGNITIVE',`c${i}`,definitionHash]]){
    slots.push({slotKey:id,unitType:kind,sourceBinding:kind==='FORM_SECTION'?{sectionId:id}:{compositeItemId:id},sourceDefinitionIdentity:{hash:h}})
    if(kind==='COGNITIVE')cognitiveResults.push({slotKey:id,resultId:`result${i}`,sessionId:`session${i}`,submissionId:`submit${i}`})
    else drafts.push({slotKey:id,answers:kind==='SITUATIONAL'?{'scene:channel':1}:{[`q${i}`]:1}})
   }
   forms.push(key({section},'sectionId',`f${i}`))
   scales.push(key({scaleId:`scale${i}`,runtimeSnapshotEncrypted:`scale:${i}`},'compositeItemId',`s${i}`))
   sjts.push(key({runtimeSnapshotEncrypted:`sjt:${i}`},'compositeItemId',`j${i}`))
   facts.push(key({slotKey:`c${i}`,sourceAttemptId:`session${i}`,sourceSubmissionId:`submit${i}`,sourceDefinitionHash:definitionHash,terminalState:'COMPLETED'},'id',`result${i}`))
  }
  mocks.slots.mockResolvedValue({snapshotHash:definitionHash,attemptEpoch:1,slots})
  mocks.scale.mockImplementation(async(cipher:string)=>({sourceDefinitionHash:definitionHash,definition:{items:[{itemCode:`q${cipher.split(':')[1]}`}]}}))
  mocks.sjt.mockReturnValue({definitionHash,runnerDefinition:{scenes:[{sceneKey:'scene',channels:[{channelKey:'channel'}]}]}})
  mocks.tx.compositeFormSectionAttempt={findMany:vi.fn().mockResolvedValue(forms.reverse())}
  mocks.tx.assessment={findMany:vi.fn().mockResolvedValue(scales.reverse())}
  mocks.tx.situationalAttempt={findMany:vi.fn().mockResolvedValue(sjts.reverse())}
  mocks.tx.assessmentUnitSnapshot.findMany.mockResolvedValue(facts.reverse())
  return {data:{...input(),envelope:{...input().envelope,drafts,cognitiveResults}},slots,facts,keyReads:()=>keyReads}
 }
 it('indexes four shuffled tool batches once instead of scanning per draft/reference',async()=>{
  const f=mixed(25)
  await saveTrainingCheckpoint('attempt',{userId:'user'},f.data)
  // Before: 4 * (25 * 26 / 2) = 1300 identity reads. Now: 4 * 25 = 100.
  expect(f.keyReads()).toBe(100)
  for(const model of ['compositeFormSectionAttempt','assessment','situationalAttempt','assessmentUnitSnapshot'])expect(mocks.tx[model].findMany).toHaveBeenCalledOnce()
  expect(mocks.scale).toHaveBeenCalledTimes(25);expect(mocks.sjt).toHaveBeenCalledTimes(25)
  expect(mocks.guard).not.toHaveBeenCalled()
  expect(JSON.parse(row.payloadEncrypted.slice(10)).drafts).toEqual(f.data.envelope.drafts)
 })
 it.each(['FORM_SECTION','SCALE','SITUATIONAL','COGNITIVE'])('rejects %s frozen mismatch in mixed batches',async kind=>{
  const f=mixed();f.slots.find(s=>s.unitType===kind).sourceDefinitionIdentity.hash='b'.repeat(64)
  await expect(saveTrainingCheckpoint('attempt',{userId:'user'},f.data)).rejects.toMatchObject({statusCode:409})
  expect(mocks.tx.trainingAttemptCheckpoint.create).not.toHaveBeenCalled()
 })
 it.each(['draft','cognitive slot','cognitive result'])('rejects duplicate %s before persistence',async kind=>{
  const f=mixed(2)
  if(kind==='draft')f.data.envelope.drafts.push(f.data.envelope.drafts[0])
  else if(kind==='cognitive slot')f.data.envelope.cognitiveResults[1].slotKey=f.data.envelope.cognitiveResults[0].slotKey
  else f.data.envelope.cognitiveResults[1].resultId=f.data.envelope.cognitiveResults[0].resultId
  await expect(saveTrainingCheckpoint('attempt',{userId:'user'},f.data)).rejects.toMatchObject({statusCode:400})
  expect(mocks.tx.trainingAttemptCheckpoint.create).not.toHaveBeenCalled()
 })
 it('preserves first-match semantics for historical duplicate scale children',async()=>{
  const f=mixed()
  mocks.tx.assessment.findMany.mockResolvedValue([
   {compositeItemId:'s0',scaleId:'scale0',runtimeSnapshotEncrypted:'scale:0'},
   {compositeItemId:'s0',scaleId:'scale0',runtimeSnapshotEncrypted:'scale:wrong'},
  ])
  await saveTrainingCheckpoint('attempt',{userId:'user'},f.data)
  expect(mocks.scale).toHaveBeenCalledExactlyOnceWith('scale:0',mocks.tx)
 })
 it('saves admitted frozen drafts after a later scale stop without rerunning admission',async()=>{
  const f=mixed();mocks.guard.mockRejectedValue(new Error('emergency stop'))
  await expect(saveTrainingCheckpoint('attempt',{userId:'user'},f.data)).resolves.toMatchObject({revision:1})
  expect(mocks.guard).not.toHaveBeenCalled()
  expect(mocks.scale).toHaveBeenCalled();expect(mocks.sjt).toHaveBeenCalled()
  expect(mocks.tx.trainingAttemptCheckpoint.create).toHaveBeenCalledOnce()
 })
})
