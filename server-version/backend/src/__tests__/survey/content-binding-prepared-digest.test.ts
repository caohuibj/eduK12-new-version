import {beforeEach,describe,expect,it,vi} from 'vitest'
import {decryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {referenceEntryKey} from '../../modules/measurement-content/reference-candidate'
import type {AssessmentReferenceEntry} from '../../modules/assessment-reference/reference'
import {bindSurveyAttemptContent,surveyAttemptContentBindingSchema,type PreparedSurveyPublicationDigest} from '../../modules/survey/content-binding.service'
const hashProbe=vi.hoisted(()=>({snapshotHashes:0,real:undefined as undefined|((value:unknown)=>string)}))
vi.mock('../../modules/assessment-runtime/canonical',async(importOriginal)=>{
  const actual=await importOriginal<typeof import('../../modules/assessment-runtime/canonical')>()
  hashProbe.real=actual.canonicalHash as (value:unknown)=>string
  return {...actual,canonicalHash:(value:unknown)=>{
    if(value&&typeof value==='object'&&(value as {runtimeStatus?:string}).runtimeStatus==='SURVEY_FINAL_V1')hashProbe.snapshotHashes+=1
    return actual.canonicalHash(value as never)
  }}
})
const mocks=vi.hoisted(()=>({release:vi.fn(),assigned:vi.fn(),collection:vi.fn()}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.release,prefetchContentReleases:async(db:any,cache:Map<string,any>,ids:string[],lock?:boolean)=>{for(const id of new Set(ids)){const r=await mocks.release(db,id,lock);if(r)cache.set(id,r)}}}))
vi.mock('../../modules/survey/flow.assignment',()=>({assignedSurveySnapshot:mocks.assigned}))
vi.mock('../../modules/survey/scale-collection-guard',()=>({assertSurveyScaleCollectionAllowed:mocks.collection}))
const scope={projectId:'project',waveId:'wave',attemptId:'attempt',publicationId:'publication'}
const exact={releaseId:'measurement',contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64)}
const entry={scoreKey:'metric',referenceKind:'descriptive_sample',evidenceLevel:'local_pilot',provenanceType:'local_observed',
  population:{description:'General sample'},source:{citation:'Synthetic'},statistics:{mean:1},instrumentVersion:'1',scoringVersion:'1'} as AssessmentReferenceEntry
const referenceHash='c'.repeat(64),reportHash='d'.repeat(64)
const choice={releaseId:'reference',contentHash:referenceHash,entryKey:referenceEntryKey(entry),metricKey:'metric',referenceKind:'descriptive_sample',priority:1}
function honestHash(value:unknown){
  const hash=hashProbe.real
  if(!hash)throw new Error('real canonicalHash was not captured')
  return hash(value)
}
function snapshot(){return {schemaVersion:1,projectId:'project',waveId:'wave',runtimeStatus:'SURVEY_FINAL_V1' as const,units:[{
  kind:'SCALE',instrumentKey:'scale',measurementRelease:exact,contentSelection:{referencePolicy:{policyVersion:'EXACT_POPULATION_PRIORITY_V1',
    measurementReleaseId:'measurement',choices:[choice]},reportRelease:{releaseId:'report',contentHash:reportHash}}}]}}
function fixture(definitionDigest?:string){
  const frozen=snapshot()
  const digest=definitionDigest??honestHash(frozen)
  const row={content_binding_cipher:null as string|null,content_binding_hash:null as string|null,flow_assignment_cipher:null as string|null,
    owner_id:'owner',definition_digest:digest,compiled_snapshot:frozen}
  const tx={$queryRaw:vi.fn(async()=>[row]),$executeRaw:vi.fn(async()=>1)}
  const run=(prepared?:{preparedDigest?:PreparedSurveyPublicationDigest;preparedSnapshot?:ReturnType<typeof snapshot>})=>
    bindSurveyAttemptContent(tx as never,{...scope,newAttempt:true,...prepared})
  const saved=()=>{const args=tx.$executeRaw.mock.calls[0] as unknown as [{values:unknown[]}]
    return surveyAttemptContentBindingSchema.parse(decryptUnifiedRuntimePayload(args[0].values[0] as string))}
  return {frozen,row,tx,run,saved,digest}
}
let releases:Record<string,any>
beforeEach(()=>{
  hashProbe.snapshotHashes=0
  vi.resetAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','ab'.repeat(32))
  const privateScope={kind:'PRIVATE',product:'SURVEY',resourceId:'project',ownerId:'owner'}
  releases={measurement:{releaseId:'measurement',layer:'MEASUREMENT',family:'SCALE',status:'PUBLISHED',scope:privateScope,
      contentHash:exact.contentHash,content:{measurementHash:exact.measurementHash}},
    reference:{releaseId:'reference',layer:'REFERENCE',family:'SCALE',status:'PUBLISHED',scope:privateScope,contentHash:referenceHash,
      content:{measurement:{releaseId:'measurement',contentHash:exact.contentHash},entries:[{definition:entry}]}},
    report:{releaseId:'report',layer:'REPORT',family:'SCALE',status:'PUBLISHED',scope:privateScope,contentHash:reportHash,
      content:{measurements:[{releaseId:'measurement',contentHash:exact.contentHash}],template:{secret:'private template'}}}}
  mocks.release.mockImplementation(async(_tx,id)=>releases[id]);mocks.assigned.mockImplementation(value=>value)
})
describe('prepared publication digest skips the locked snapshot rehash',()=>{
  it('binds without hashing the snapshot when preparedDigest and preparedSnapshot match the locked definition_digest',async()=>{
    const f=fixture()
    const preparedDigest:PreparedSurveyPublicationDigest={publicationId:scope.publicationId,snapshotDigest:f.row.definition_digest}
    expect(preparedDigest.snapshotDigest).toBe(honestHash(f.frozen))
    await expect(f.run({preparedDigest,preparedSnapshot:f.frozen})).resolves.toBeUndefined()
    expect(hashProbe.snapshotHashes).toBe(0)
    expect(f.saved().definitionDigest).toBe(f.row.definition_digest)
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(1)
    expect(f.tx.$executeRaw).toHaveBeenCalledTimes(1)
  })
  it('rejects a locked digest that does not match the snapshot when preparedDigest is stale or unequal',async()=>{
    const honest=honestHash(snapshot())
    const locked='f'.repeat(64)
    const stale:PreparedSurveyPublicationDigest={publicationId:scope.publicationId,snapshotDigest:honest}
    const unequal:PreparedSurveyPublicationDigest={publicationId:scope.publicationId,snapshotDigest:'e'.repeat(64)}
    for(const preparedDigest of [stale,unequal]){
      const f=fixture(locked)
      hashProbe.snapshotHashes=0
      await expect(f.run({preparedDigest,preparedSnapshot:f.frozen})).rejects.toMatchObject({statusCode:409,message:'研究作答的冻结内容绑定缺失、变更或已不可用'})
      expect(hashProbe.snapshotHashes).toBe(1)
      expect(f.tx.$queryRaw).toHaveBeenCalledTimes(2)
      expect(f.tx.$executeRaw).not.toHaveBeenCalled()
    }
  })
  it('hashes the snapshot once and binds when preparedDigest is omitted',async()=>{
    const f=fixture()
    await expect(f.run()).resolves.toBeUndefined()
    expect(hashProbe.snapshotHashes).toBe(1)
    expect(f.saved().definitionDigest).toBe(f.row.definition_digest)
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(1)
    expect(f.tx.$executeRaw).toHaveBeenCalledTimes(1)
  })
})
