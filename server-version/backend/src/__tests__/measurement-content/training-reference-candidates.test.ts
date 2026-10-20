import {beforeEach,describe,expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {prepareReferenceCandidate} from '../../modules/measurement-content/reference-candidate'
const mocks=vi.hoisted(()=>({transaction:vi.fn(),authority:vi.fn(),source:vi.fn(),store:vi.fn(),review:vi.fn(),publish:vi.fn(),release:vi.fn(),query:vi.fn(),execute:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
vi.mock('../../modules/training-analysis/reference-source',async load=>({...await load<object>(),assertTrainingReferenceAuthority:mocks.authority,readTrainingReferenceSource:mocks.source}))
vi.mock('../../modules/measurement-content/reference-candidate.repository',()=>({storeReferenceCandidate:mocks.store,storeReferenceReview:mocks.review,publishReviewedReferenceCandidate:mocks.publish}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.release}))
import {createTrainingReferenceCandidate,readTrainingReferenceCandidate,reviewTrainingReferenceCandidate,publishTrainingReferenceCandidate,readTrainingReferenceRequest} from '../../modules/training-analysis/reference-candidates.service'
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const context={actorId:id(1),courseId:id(2),compositeId:id(3),grantId:id(4)}
const selector={itemId:id(5),scoreKey:'total',publication:'2026-10-20T01:00:00.000Z',configDigest:null,variantKey:null}
const body=()=>({requestId:id(7),selector,referenceVersion:'1',evidence:{methodRationale:'Description only',inclusionRule:'All valid',missingness:'Exclude missing',
 repeatResponses:'Distinct people',organizationClustering:'One course',administrationDifferences:'Same protocol',uncertainty:'Exploratory',applicability:'Course only',sampleAdequacy:'Description only'}})
const measurement={releaseId:id(6),layer:'MEASUREMENT',family:'SCALE',status:'PUBLISHED',contentHash:'a'.repeat(64),
 content:{measurementHash:'b'.repeat(64),instrumentVersion:'1',scoringVersion:'score1',metrics:[{metricKey:'total'}]}}
const source=()=>({measurement,instrumentKey:'scale',eligible:Array.from({length:5},(_,i)=>({factId:id(20+i),factVersion:String(i).repeat(64),value:i+1,measurementReleaseId:id(6)})),
 binding:{kind:'TRAINING_VERIFIED_SOURCE_V1',courseId:context.courseId,compositeId:context.compositeId,selector,cutOff:'2026-10-20T05:00:00.000Z',sourceHash:'d'.repeat(64),
 sourceIds:Array.from({length:5},(_,i)=>({attemptId:id(20+i),attemptEpoch:1}))},exclusionCounts:{invalidOrMissing:0}})
const tx={$queryRaw:mocks.query,$executeRaw:mocks.execute} as any
let stored:any,request:any
beforeEach(()=>{vi.resetAllMocks();stored=null;request=null;mocks.transaction.mockImplementation(async fn=>fn(tx));mocks.source.mockImplementation(async()=>source());
 mocks.release.mockResolvedValue(measurement);mocks.review.mockResolvedValue(id(9));mocks.publish.mockResolvedValue({releaseId:id(10),contentHash:'e'.repeat(64),version:'1',status:'PUBLISHED'});
 mocks.query.mockImplementation(async q=>{const sql=q.strings.join(' ');if(sql.includes('FROM training_reference_requests'))return request?[request]:[]
 if(sql.includes('FROM measurement_reference_candidates'))return stored?[{payload:stored}]:[];throw new Error('Unexpected SQL '+sql)})
 mocks.store.mockImplementation(async(_tx,input,facts)=>{stored=prepareReferenceCandidate(input,facts);return {candidateId:id(8),candidate:stored}})
})
async function create(){return createTrainingReferenceCandidate(context,body())}
describe('Training trusted candidate operations',()=>{
 it('creates computed private candidate and returns only aggregate source view',async()=>{
  const result:any=await create()
  expect(result.definition.entries[0]).toMatchObject({referenceKind:'descriptive_sample',evidenceLevel:'local_pilot',source:{sampleSize:5},statistics:{mean:3,sd:Math.sqrt(2.5)}})
  expect(stored.analyzerId).toBe(context.actorId);expect(stored.scope).toEqual({kind:'PRIVATE',product:'TRAINING',ownerId:context.actorId,resourceId:context.compositeId})
  expect(result.sampleSize).toBe(5);expect(JSON.stringify(result)).not.toContain(id(20));expect(result.source).not.toHaveProperty('sourceIds')
  expect(mocks.authority.mock.invocationCallOrder[0]).toBeLessThan(mocks.source.mock.invocationCallOrder[0]);expect(mocks.authority).toHaveBeenCalledTimes(2)
  expect(mocks.execute.mock.calls[0][0].strings.join(' ')).toContain('pg_advisory_xact_lock')
  expect(mocks.execute.mock.calls[1][0].strings.join(' ')).toContain('INSERT INTO training_reference_requests')
 })
 it.each(['actorId','statistics','sampleManifest','measurement','formalNorm','scope'])('rejects caller supplied %s before transactions',async key=>{
  await expect(createTrainingReferenceCandidate(context,{...body(),[key]:{forged:true}})).rejects.toThrow();expect(mocks.transaction).not.toHaveBeenCalled()
 })
 it('denies samples before read when owner/science capability is absent',async()=>{
  mocks.authority.mockRejectedValueOnce(new Error('DENIED'));await expect(create()).rejects.toThrow('DENIED');expect(mocks.source).not.toHaveBeenCalled()
 })
 it('rechecks expiry after every source/write wait, rolling back candidate and receipt together',async()=>{
  mocks.authority.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('EXPIRED'))
  await expect(create()).rejects.toThrow('EXPIRED');expect(mocks.store).toHaveBeenCalledTimes(1)
 })
 it('omits zero standard deviation instead of emitting invalid comparisons',async()=>{
  const value=source();value.eligible.forEach(row=>row.value=3);mocks.source.mockResolvedValue(value)
  const result:any=await create();expect(result.definition.entries[0].statistics).toEqual({mean:3})
 })
 it('reads only under review capability and verifies frozen source',async()=>{
  await create();mocks.authority.mockClear();mocks.source.mockClear()
  const result=await readTrainingReferenceCandidate(context,{candidateId:id(8)})
  expect(result.exclusionCounts).toEqual({invalidOrMissing:0});expect(result.candidateHash).toBe(stored.candidateHash);expect(mocks.authority).toHaveBeenCalledWith(tx,context,'reference.review')
  expect(mocks.source).toHaveBeenCalledWith(tx,context,selector,stored.sourceBinding)
 })
 it('review requires current separate review capability and exact hash; no supplied reviewer',async()=>{
  await create();mocks.authority.mockClear()
  const input={requestId:id(11),candidateId:id(8),candidateHash:stored.candidateHash,decision:'APPROVED',statement:'Reviewed source limitations'}
  expect(await reviewTrainingReferenceCandidate(context,input)).toEqual({reviewId:id(9)})
  expect(mocks.review).toHaveBeenCalledWith(tx,id(8),expect.objectContaining({reviewerId:context.actorId,candidateHash:stored.candidateHash}))
  expect(mocks.authority).toHaveBeenCalledWith(tx,context,'reference.review')
  await expect(reviewTrainingReferenceCandidate(context,{...input,reviewerId:'forged'})).rejects.toThrow()
  await expect(reviewTrainingReferenceCandidate(context,{...input,candidateHash:'f'.repeat(64)})).rejects.toThrow('REFERENCE_REVIEW_STALE')
 })
 it('blocks changed facts and foreign candidate scope before review/publish',async()=>{
  await create();const altered=source();altered.eligible[0].factVersion='f'.repeat(64);mocks.source.mockResolvedValue(altered)
  const publish={requestId:id(12),candidateId:id(8),reviewId:id(9),localKey:'course',version:'1'}
  await expect(publishTrainingReferenceCandidate(context,publish)).rejects.toThrow('REFERENCE_SAMPLE_NOT_AUTHORIZED')
  expect(mocks.publish).not.toHaveBeenCalled()
  await expect(readTrainingReferenceCandidate({...context,courseId:id(99)},{candidateId:id(8)})).rejects.toThrow('REFERENCE_TRAINING_CANDIDATE_REQUIRED')
 })
 it('publishes through stored review only, fixed purpose and safe release DTO',async()=>{
  await create();mocks.authority.mockClear()
  const result=await publishTrainingReferenceCandidate(context,{requestId:id(12),candidateId:id(8),reviewId:id(9),localKey:'course',version:'1'})
  expect(result).toEqual({releaseId:id(10),contentHash:'e'.repeat(64),version:'1',status:'PUBLISHED'})
  expect(mocks.publish).toHaveBeenCalledWith(tx,expect.objectContaining({actorId:context.actorId,purpose:'HISTORICAL_INTERPRETATION',reviewId:id(9)}),expect.any(Map))
  expect(mocks.authority).toHaveBeenCalledWith(tx,context,'reference.publish')
 })
 it('recovers exact create only after revalidating frozen sources, rejects UUID/body and actor drift',async()=>{
  await create();mocks.source.mockClear();mocks.store.mockClear()
  request={request_id:id(7),actor_id:context.actorId,course_id:context.courseId,composite_id:context.compositeId,operation:'CREATE',
   input_hash:canonicalHash({context,operation:'CREATE',input:body()}),candidate_id:id(8),review_id:null,release_id:null,exclusion_counts:{invalidOrMissing:0}}
  expect((await readTrainingReferenceRequest(context,'CREATE',body())).status).toBe('COMPLETED')
  expect((await create() as any).candidateId).toBe(id(8));expect(mocks.source).toHaveBeenCalledTimes(2);expect(mocks.source).toHaveBeenCalledWith(tx,context,selector,stored.sourceBinding);expect(mocks.store).not.toHaveBeenCalled()
  await expect(createTrainingReferenceCandidate(context,{...body(),referenceVersion:'2'})).rejects.toThrow('REFERENCE_REQUEST_INPUT_MISMATCH')
  await expect(createTrainingReferenceCandidate({...context,actorId:id(99)},body())).rejects.toThrow('REFERENCE_REQUEST_INPUT_MISMATCH')
 })
 it.each(['POST','STATUS'])('refuses %s recovery after committed source withdrawal without replacing saved statistics',async mode=>{
  await create();const original=JSON.stringify(stored);mocks.store.mockClear()
  request={request_id:id(7),actor_id:context.actorId,course_id:context.courseId,composite_id:context.compositeId,operation:'CREATE',
   input_hash:canonicalHash({context,operation:'CREATE',input:body()}),candidate_id:id(8),review_id:null,release_id:null,exclusion_counts:{invalidOrMissing:0}}
  mocks.source.mockRejectedValue(new Error('REFERENCE_TRAINING_CONSENT_WITHDRAWN'))
  await expect(mode==='POST'?create():readTrainingReferenceRequest(context,'CREATE',body())).rejects.toThrow('REFERENCE_TRAINING_CONSENT_WITHDRAWN')
  expect(JSON.stringify(stored)).toBe(original);expect(mocks.store).not.toHaveBeenCalled()
 })
 it('rejects recovery when a frozen fact becomes ineligible instead of returning the old aggregate',async()=>{
  await create();const original=JSON.stringify(stored);mocks.store.mockClear()
  request={request_id:id(7),actor_id:context.actorId,course_id:context.courseId,composite_id:context.compositeId,operation:'CREATE',
   input_hash:canonicalHash({context,operation:'CREATE',input:body()}),candidate_id:id(8),review_id:null,release_id:null,exclusion_counts:{invalidOrMissing:0}}
  const changed=source();changed.eligible.pop();mocks.source.mockResolvedValue(changed)
  await expect(readTrainingReferenceRequest(context,'CREATE',body())).rejects.toThrow('REFERENCE_SAMPLE_NOT_AUTHORIZED')
  expect(JSON.stringify(stored)).toBe(original);expect(mocks.store).not.toHaveBeenCalled()
 })
 it('unknown status is not cancellation and is returned only after current authorization',async()=>{
  expect(await readTrainingReferenceRequest(context,'CREATE',body())).toEqual({status:'MISSING',requestId:id(7)})
  expect(mocks.authority).toHaveBeenCalledTimes(2);expect(mocks.source).not.toHaveBeenCalled()
 })
})
