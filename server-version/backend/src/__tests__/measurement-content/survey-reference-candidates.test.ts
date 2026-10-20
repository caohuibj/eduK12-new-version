import {beforeEach,describe,expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {prepareReferenceCandidate} from '../../modules/measurement-content/reference-candidate'
import type {SurveySourceProjection} from '../../modules/survey/analytics.source'
const mocks=vi.hoisted(()=>({transaction:vi.fn(),owner:vi.fn(),authority:vi.fn(),release:vi.fn(),load:vi.fn(),store:vi.fn(),
  tx:{$queryRaw:vi.fn(),surveyProject:{findUnique:vi.fn()},surveyWaveFinal:{count:vi.fn()}}}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
vi.mock('../../modules/survey/builder.service',()=>({authorizedProject:mocks.owner}))
vi.mock('../../modules/measurement-content/content-authority.repository',()=>({assertContentAuthority:mocks.authority}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.release}))
vi.mock('../../modules/survey/analytics.source',()=>({loadSurveySource:mocks.load}))
vi.mock('../../modules/measurement-content/reference-candidate.repository',()=>({storeReferenceCandidate:mocks.store}))
import {createSurveyReferenceCandidate} from '../../modules/survey/reference-candidates.service'
const pid='11111111-1111-4111-8111-111111111111',wid='22222222-2222-4222-8222-222222222222'
const mid='33333333-3333-4333-8333-333333333333',gid='44444444-4444-4444-8444-444444444444'
const binding={releaseId:mid,contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64)}
const input=()=>({projectId:pid,waveId:wid,grantId:gid,instrumentKey:'instrument',scoreKey:'effort',referenceVersion:'1',
  evidence:{methodRationale:'Project exploratory sample description',inclusionRule:'Included complete FINAL only',missingness:'Exclude missing numeric scores',
    repeatResponses:'One completed attempt per wave',organizationClustering:'One project sample',administrationDifferences:'Same frozen protocol',
    uncertainty:'Descriptive only',applicability:'Project sample only',sampleAdequacy:'Exploratory, not population inference'}})
const release=()=>({releaseId:mid,layer:'MEASUREMENT',family:'SCALE',status:'PUBLISHED',contentHash:binding.contentHash,
  scope:{kind:'PRIVATE',product:'SURVEY',resourceId:pid,ownerId:'actor'},provenance:{},
  content:{instrumentVersion:'1',scoringVersion:'score1',measurementHash:binding.measurementHash,metrics:[{metricKey:'effort',unit:'points'}]}})
const source=():SurveySourceProjection=>({projectId:pid,collectionMode:'SINGLE_UNLINKED',sourceRevision:7,cutOff:'2026-10-20T04:00:00.001Z',
  sourceFinalCount:2,completeAttempts:2,nextFinalCursor:null,
  sourceVersions:[{waveId:wid,instrumentKey:'instrument',publicationVersion:1,instrumentRevision:1,definitionDigest:'d',scoringDigest:'s',measurementRelease:binding}],
  raw:[],codebook:[],scoreColumns:[],attendance:[],scores:[1,3].map((value,i)=>({projectId:pid,waveId:wid,waveOrdinal:1,attemptId:'attempt'+i,
    researchCode:null,sourceFinalHash:String(i+1).repeat(64),sourceVerified:true,completedAt:'2026-10-20T03:00:00Z',value,missingReason:null,status:'calculated',quality:{status:'interpretable',flags:{}},
    measurement:{instrumentKey:'instrument',scoreKey:'effort',scoringDigest:'s',responseSignature:'r',respondentType:'research',unit:'points'}}))})
beforeEach(()=>{
  vi.resetAllMocks();mocks.transaction.mockImplementation((fn:(tx:typeof mocks.tx)=>unknown)=>fn(mocks.tx))
  mocks.owner.mockResolvedValue({id:pid,status:'CLOSED'});mocks.authority.mockResolvedValue({grantId:gid,version:1})
  mocks.tx.$queryRaw.mockResolvedValue([{measurement:binding,source_revision:7}]);mocks.release.mockResolvedValue(release())
  mocks.load.mockResolvedValue(source());mocks.tx.surveyProject.findUnique.mockResolvedValue({revision:7});mocks.tx.surveyWaveFinal.count.mockResolvedValue(2)
  mocks.store.mockImplementation(async(_tx,candidate,facts)=>({candidateId:'candidate',candidate:prepareReferenceCandidate(candidate,facts)}))
})
describe('internal Survey observed reference candidates',()=>{
  it('uses existing bounded source/statistics and stores a private general descriptive sample with exact trusted identity',async()=>{
    const result=await createSurveyReferenceCandidate('actor',input()),candidate=result.candidate
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith({actorUserId:'actor',projectId:pid,waveIds:[wid],maxFinals:250,pageMode:true,
      stableIdCursor:true,selectRaw:false,selectScore:{instrumentKey:'instrument',scoreKey:'effort'},includeAttendance:false,expectedSourceRevision:7})
    expect(candidate.definition.entries[0]).toMatchObject({referenceKind:'descriptive_sample',evidenceLevel:'local_pilot',provenanceType:'local_observed',
      source:{sampleSize:2},statistics:{mean:2,sd:Math.sqrt(2)}})
    expect(candidate.definition.entries[0].population.match).toBeUndefined()
    expect(candidate.measurement).toEqual({...binding,instrumentVersion:'1',scoringVersion:'score1'})
    expect(candidate.sourceBinding).toEqual({kind:'SURVEY_VERIFIED_SOURCE_V1',projectId:pid,waveId:wid,instrumentKey:'instrument',scoreKey:'effort',sourceRevision:7,sourceFinalCount:2,cutOff:source().cutOff})
    expect(candidate.sampleManifest[0].factId).toBe('attempt0')
    expect(candidate.sampleManifest[0].factVersion).toBe(canonicalHash({sourceFinalHash:'1'.repeat(64),sourceResultHash:null,epoch:null,waveId:wid,instrumentKey:'instrument',scoreKey:'effort'}))
    expect(mocks.owner).toHaveBeenCalledTimes(2);expect(mocks.authority).toHaveBeenCalledTimes(2)
    expect(mocks.authority).toHaveBeenCalledWith(mocks.tx,{actorId:'actor',grantId:gid,capability:'reference.analyze',scope:{product:'SURVEY',scopeKind:'PROJECT',scopeId:pid,resourceKind:'reference',resourceKeys:[mid]}})
    expect(mocks.owner.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.$queryRaw.mock.invocationCallOrder[0])
    expect(mocks.authority.mock.invocationCallOrder[0]).toBeLessThan(mocks.load.mock.invocationCallOrder[0])
    expect(mocks.authority.mock.invocationCallOrder[1]).toBeLessThan(mocks.store.mock.invocationCallOrder[0])
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function),expect.objectContaining({isolationLevel:'ReadCommitted'}))
  })
  it.each(['statistics','population','sampleManifest','measurementReleaseId'])('rejects client supplied %s before any transaction',async field=>{
    await expect(createSurveyReferenceCandidate('actor',{...input(),[field]:{forged:true}})).rejects.toThrow()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('denies owner/data access before reading publication or samples',async()=>{
    mocks.owner.mockRejectedValueOnce(new Error('OWNER_DENIED'))
    await expect(createSurveyReferenceCandidate('actor',input())).rejects.toThrow('OWNER_DENIED')
    expect(mocks.tx.$queryRaw).not.toHaveBeenCalled();expect(mocks.load).not.toHaveBeenCalled()
  })
  it('denies missing reference.analyze before reading any samples',async()=>{
    mocks.authority.mockRejectedValueOnce(new Error('CAPABILITY_DENIED'))
    await expect(createSurveyReferenceCandidate('actor',input())).rejects.toThrow('CAPABILITY_DENIED')
    expect(mocks.load).not.toHaveBeenCalled();expect(mocks.store).not.toHaveBeenCalled()
  })
  it('rechecks expiring authority after source computation',async()=>{
    mocks.authority.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('EXPIRED'))
    await expect(createSurveyReferenceCandidate('actor',input())).rejects.toThrow('EXPIRED')
    expect(mocks.store).not.toHaveBeenCalled()
  })
  it.each(['foreign-project','revoked','catalog'])('rejects %s measurement before reading samples',async variant=>{
    const value=release();if(variant==='foreign-project')value.scope.resourceId='other'
    if(variant==='revoked')value.status='REVOKED'
    if(variant==='catalog')value.provenance={source:{sourceId:'licensed'}}
    mocks.release.mockResolvedValueOnce(value)
    await expect(createSurveyReferenceCandidate('actor',input())).rejects.toThrow('REFERENCE_SURVEY_MEASUREMENT_MISMATCH')
    expect(mocks.load).not.toHaveBeenCalled()
  })
  it('fails missing frozen publication binding rather than guessing a release',async()=>{
    mocks.tx.$queryRaw.mockResolvedValueOnce([{measurement:null,source_revision:7}])
    await expect(createSurveyReferenceCandidate('actor',input())).rejects.toThrow('REFERENCE_SURVEY_MEASUREMENT_BINDING_REQUIRED')
    expect(mocks.load).not.toHaveBeenCalled()
  })
  it('rejects reader identity mismatch and partial sample truncation',async()=>{
    const mismatch=source();mismatch.sourceVersions![0].measurementRelease={...binding,releaseId:'different'}
    mocks.load.mockResolvedValueOnce(mismatch)
    await expect(createSurveyReferenceCandidate('actor',input())).rejects.toThrow('REFERENCE_SURVEY_MEASUREMENT_MISMATCH')
    mocks.load.mockResolvedValueOnce({...source(),nextFinalCursor:{id:'next',completedAt:'2026-10-20T03:30:00Z'}})
    await expect(createSurveyReferenceCandidate('actor',input())).rejects.toMatchObject({statusCode:413})
    expect(mocks.store).not.toHaveBeenCalled()
  })
  it('rejects changed revision or cohort count at the final write fence',async()=>{
    mocks.tx.$queryRaw.mockResolvedValueOnce([{measurement:binding,source_revision:7}]).mockResolvedValueOnce([{measurement:binding,source_revision:8}])
    await expect(createSurveyReferenceCandidate('actor',input())).rejects.toThrow('REFERENCE_SURVEY_SOURCE_CHANGED')
    mocks.tx.surveyWaveFinal.count.mockResolvedValueOnce(3)
    await expect(createSurveyReferenceCandidate('actor',input())).rejects.toThrow('REFERENCE_SURVEY_SOURCE_CHANGED')
    expect(mocks.store).not.toHaveBeenCalled()
  })
  it('omits non-estimable/zero SD while retaining legitimate descriptive mean',async()=>{
    const one=source();one.scores=one.scores.slice(0,1);one.sourceFinalCount=1;one.completeAttempts=1
    mocks.load.mockResolvedValueOnce(one);mocks.tx.surveyWaveFinal.count.mockResolvedValueOnce(1)
    expect((await createSurveyReferenceCandidate('actor',input())).candidate.definition.entries[0].statistics).toEqual({mean:1})
    const zero=source();zero.scores[1].value=1;mocks.load.mockResolvedValueOnce(zero)
    expect((await createSurveyReferenceCandidate('actor',input())).candidate.definition.entries[0].statistics).toEqual({mean:1})
  })
  it('excludes numeric limited/invalid and missing quality using the same statistics and manifest cohort',async()=>{
    for(const quality of [{status:'limited',flags:{}},{status:'invalid',flags:{}},undefined]){
      const value=source();value.scores[1].quality=quality;mocks.load.mockResolvedValueOnce(value)
      const result=await createSurveyReferenceCandidate('actor',input()),entry=result.candidate.definition.entries[0]
      expect(entry.statistics).toEqual({mean:1});expect(entry.source.sampleSize).toBe(1)
      expect(result.candidate.sampleManifest).toHaveLength(1)
      expect(Object.values(result.exclusionCounts).reduce((a:number,b:unknown)=>a+Number(b),0)).toBe(1)
      expect(entry.limitations.join(' ')).toContain('互斥排除计数')
    }
  })
  it('reports mutually exclusive exclusion reasons and accepts only cognitive OK/interpretable',async()=>{
    const value=source(),base=value.scores[0]
    value.scores.push(...[
      {quality:undefined,status:'limited',value:null},
      {quality:{status:'limited',flags:{}},status:'limited',value:null},
      {quality:{status:'invalid',flags:{}},status:'not_calculable',value:null},
      {status:'limited'}, {value:null,missingReason:'SHOWN_MISSING' as const},
    ].map((change,i)=>({...base,...change,attemptId:'excluded'+i})))
    value.sourceFinalCount=7;mocks.tx.surveyWaveFinal.count.mockResolvedValueOnce(7)
    mocks.load.mockResolvedValueOnce(value)
    const result=await createSurveyReferenceCandidate('actor',input())
    expect(result.exclusionCounts).toEqual({qualityMissing:1,qualityLimited:1,qualityInvalid:1,metricNotCalculated:1,missingValue:1})
    expect(result.candidate.sampleManifest).toHaveLength(2)
    const cognitive=source();cognitive.scores.forEach(score=>{score.status='OK'})
    cognitive.scores[1].quality!.status='limited'
    mocks.release.mockResolvedValueOnce({...release(),family:'COGNITIVE'});mocks.load.mockResolvedValueOnce(cognitive)
    expect((await createSurveyReferenceCandidate('actor',input())).candidate.definition.entries[0].statistics).toEqual({mean:1})
  })
  it('does not hold a transaction while loading samples and counts the exact cutoff cohort',async()=>{
    let active=false
    mocks.transaction.mockImplementation(async fn=>{expect(active).toBe(false);active=true;try{return await fn(mocks.tx)}finally{active=false}})
    mocks.load.mockImplementation(async()=>{expect(active).toBe(false);return source()})
    await createSurveyReferenceCandidate('actor',input())
    expect(mocks.tx.surveyWaveFinal.count).toHaveBeenCalledWith({where:{projectId:pid,waveId:wid,completedAt:{lt:new Date(source().cutOff)},
      attempt:{status:'COMPLETED',excludedAt:null,OR:[{sampleReview:{is:null}},{sampleReview:{is:{verdict:'INCLUDED'}}}]}}})
  })
  it('rejects nonfinite values, duplicate facts and mixed scoring identities',async()=>{
    const invalid=source();invalid.scores[0].value=Infinity;mocks.load.mockResolvedValueOnce(invalid)
    await expect(createSurveyReferenceCandidate('actor',input())).rejects.toThrow('REFERENCE_SURVEY_SCORE_INVALID')
    const duplicate=source();duplicate.scores[1].attemptId=duplicate.scores[0].attemptId;mocks.load.mockResolvedValueOnce(duplicate)
    await expect(createSurveyReferenceCandidate('actor',input())).rejects.toThrow('REFERENCE_SURVEY_SAMPLE_INVALID')
    const mixed=source();mixed.scores[1].measurement.scoringDigest='other';mocks.load.mockResolvedValueOnce(mixed)
    await expect(createSurveyReferenceCandidate('actor',input())).rejects.toThrow('REFERENCE_SURVEY_STATISTICS_INVALID')
    expect(mocks.store).not.toHaveBeenCalled()
  })
  it('binds cognitive epoch/result hash into fact versions and source binding into candidate identity',async()=>{
    const changed=source();changed.scores[0].sourceResultHash='c'.repeat(64);changed.scores[0].epoch=2
    const first=await createSurveyReferenceCandidate('actor',input());mocks.load.mockResolvedValueOnce(changed)
    const second=await createSurveyReferenceCandidate('actor',input())
    expect(second.candidate.sampleManifest[0].factVersion).not.toBe(first.candidate.sampleManifest[0].factVersion)
    expect(second.candidate.candidateHash).not.toBe(first.candidate.candidateHash)
    const stored=mocks.store.mock.calls[0],candidate=stored[1],facts=stored[2]
    for(const sourceBinding of [{...candidate.sourceBinding,sourceRevision:-1},{...candidate.sourceBinding,cutOff:'invalid'},
      {...candidate.sourceBinding,projectId:wid},{...candidate.sourceBinding,scoreKey:'other'},
      {...candidate.sourceBinding,cutOff:'2026-10-20T04:00:01Z'},{...candidate.sourceBinding,arbitraryPolicy:{allow:true}}])
      expect(()=>prepareReferenceCandidate({...candidate,sourceBinding},facts)).toThrow('REFERENCE_SOURCE_BINDING_INVALID')
  })
})
