import {beforeEach,describe,expect,it,vi} from 'vitest'
import {writeFileSync} from 'node:fs'
const m=vi.hoisted(()=>({query:vi.fn(),context:vi.fn(),spec:vi.fn(),cohort:vi.fn(),batch:vi.fn(),
  create:vi.fn(),artifact:vi.fn(),read:vi.fn(),privacy:vi.fn(),allowed:vi.fn(),prior:[] as any[],current:null as any}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:m.query,educationReportPolicySnapshot:{findUnique:m.privacy}}}))
vi.mock('../../modules/campus/report-release-lock',()=>({withCampusReportReleaseLock:(_org:string,fn:()=>unknown)=>fn()}))
vi.mock('../../modules/organization/access',()=>({resolveOrganizationAccessContext:m.context,contextHasCapability:()=>false}))
vi.mock('../../modules/reporting/spec',async importOriginal=>({
  ...await importOriginal<typeof import('../../modules/reporting/spec')>(),getPublishedReportingSpec:m.spec,
}))
vi.mock('../../modules/reporting/cohort',()=>({freezeRunTrackCohort:m.cohort,readReportingCohort:m.cohort}))
vi.mock('../../modules/reporting/resultSource',()=>({resolveAuthoritativeRunResults:m.batch}))
vi.mock('../../modules/reporting/authorization',()=>({assertOrganizationGroupReportGenerateAccess:vi.fn(),assertOrganizationGroupArtifactReadAccess:vi.fn()}))
vi.mock('../../modules/reporting/subgroupPrivacy',()=>({assertReportingSubgroupsPrivacy:vi.fn()}))
vi.mock('../../modules/reporting/fixedPopulationPrivacy',()=>({assertFixedPopulationArtifactDisclosure:vi.fn()}))
vi.mock('../../modules/reporting/artifact',()=>({createOrReuseReportingArtifact:m.create,readReportingArtifactRecord:m.artifact}))
vi.mock('../../modules/reporting/pr4Service',()=>({readOrganizationReportingArtifact:m.read}))
vi.mock('../../modules/reporting/education-group-selection',()=>({educationGroupPresentation:async()=>({sourceLabel:'Synthetic school',populationLabel:'Frozen class'})}))
vi.mock('../../modules/reporting/governedDisclosure',()=>({
  reportingAudienceForContext:()=> 'ORGANIZATION',reportingLeafDisclosureContract:async()=>({minimumRespondents:10}),
  governedArtifactMetrics:m.allowed,narrowGovernedProjection:(projection:any,allowed:string[]|null)=>allowed===null?projection:{...projection,
    metrics:Object.fromEntries(Object.entries(projection.metrics??{}).filter(([key])=>allowed.includes(key)))},
}))
import {buildReportingArtifact} from '../../modules/reporting/engine'
import {generateCampusGroupReport,readCampusGroupReport} from '../../modules/campus/group-reports'
import {STANDARD,ENHANCED} from '../../modules/report-privacy/registry'
import {policyFingerprint} from '../../modules/report-privacy/schema'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {projectCampusGeneralGroupV2} from '../../modules/campus/generalGroupV2.projection'
import {validateReportingSpecDefinition,reportingSpecHash} from '../../modules/reporting/spec'
import type {ReportingGroupSpecV1,ReportingAnalysisSpecRecord,ReportingCohortSnapshotRecord,ReportingResultBatchV1,ReportingMetricRuleV1} from '../../modules/reporting/types'

const org='synthetic-school',run='current-run',track='current-track'
const actor={userId:'synthetic-admin',accountDomain:'SCHOOL',role:'ADMIN',platformRole:'STANDARD'} as any
const leaf={slotKey:'scale:synthetic',unitType:'SCALE' as const,instrumentKey:'synthetic-scale',instrumentVersion:'1',compiledRuntimeHash:'a'.repeat(64)}
const rule=(metricId='score'):ReportingMetricRuleV1=>({metricId,sourceMetricKey:'score',minimumMetricN:10,
  acceptedResultQuality:['interpretable'],acceptedMetricQuality:'IGNORE_METRIC_QUALITY',aggregations:['MEAN'],
  missingnessRule:'EXCLUDE',observationUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT'})
const spec=(metricId='score'):ReportingAnalysisSpecRecord<ReportingGroupSpecV1>=>({id:metricId+'-spec',specKey:metricId,version:1,
 status:'PUBLISHED',specHash:'',createdByUserId:actor.userId,createdAt:new Date('2026-10-30T00:00:00Z'),
 reviewedByUserId:'synthetic-reviewer',reviewedAt:new Date('2026-10-30T00:00:00Z'),publishedAt:new Date('2026-10-30T00:00:00Z'),
 definition:{schemaVersion:1,analysisKind:'GROUP',engineKey:'ORG_GROUP_V1',engineVersion:'1.0.0',privacyUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT',
 minimumCohortN:10,minimumContributorN:10,metricRules:[rule(metricId)],reportEvidenceCeiling:'PILOT'}})
function policy(options=STANDARD){
 const effective={schemaVersion:1,product:'HUISCHOOL',scenario:'SCHOOL_GENERAL_EDUCATION_GROUP',options,source:'APPROVED_REPORT_PREFERENCE_V1'}
 return {id:'synthetic-policy',product:'HUISCHOOL',scenario:'SCHOOL_GENERAL_EDUCATION_GROUP',policyVersion:1,effective,effectiveHash:policyFingerprint(effective),fingerprint:'synthetic'}
}
function sample(n:number,valid:number[],metricId='score',options=STANDARD,prefix='student',settings:{floor?:number;cohortFloor?:number;legacy?:boolean;sourceMetricKey?:string}={}){
 const floor=settings.floor??10
 const cohort:ReportingCohortSnapshotRecord={id:`cohort-${n}`,organizationId:org,sourceRunId:run,sourceTrackId:track,
  selector:{kind:'RUN_TRACK_SUBJECTS',runId:run,trackId:track},eligibleN:n,cohortIdentityHash:canonicalHash({n,prefix}),snapshotHash:canonicalHash({n,prefix}),
  generatedByUserId:actor.userId,generatedAt:new Date('2026-10-31T00:00:00Z'),
  members:Array.from({length:n},(_,i)=>({executionId:`execution-${n}-${i}`,actorSnapshotId:`actor-${n}-${i}`,userId:`${prefix}-${i}`,membershipId:`${prefix}-member-${i}`}))}
 const batch:ReportingResultBatchV1={resourceFamily:'SCALE',resourceKey:leaf.instrumentKey,resourceVersion:'1',resourceMinimumN:floor,unresolved:[],resolved:cohort.members.map((member,i)=>({
  executionId:member.executionId,subjectUserId:member.userId,membershipId:member.membershipId,trackId:track,canonicalResultHash:canonicalHash({n,prefix,i,valid:valid.includes(i)}),
  scientificMaturity:'PILOT',provenanceState:'FROZEN',scientificProvenanceHash:'b'.repeat(64),
  metrics:[{key:settings.sourceMetricKey??'score',value:valid.includes(i)?(i===20?2:0):null,resultQuality:'interpretable',metricQuality:'valid',unit:'score'}],
 }))}
 const definition=spec(metricId)
 definition.definition.minimumCohortN=settings.cohortFloor??floor
 definition.definition.minimumContributorN=floor
 definition.definition.metricRules[0].minimumMetricN=floor
 definition.definition.metricRules[0].sourceMetricKey=settings.sourceMetricKey??'score'
 validateReportingSpecDefinition(definition.definition)
 definition.specHash=reportingSpecHash(definition.definition)
 const payload=buildReportingArtifact({artifactId:`artifact-${n}`,generatedByUserId:actor.userId,generatedAt:'2026-10-31T00:00:00.000Z',
  spec:definition,cohort,batch,...(settings.legacy?{}:{leaf})}).payload
 return {cohort,batch,spec:definition,payload,metricRules:definition.definition.metricRules,minimumN:Math.max(floor,settings.cohortFloor??0),resourceMinimumN:floor,
  privacy:policy(options),members:cohort.members,releases:[] as any[],sourceRunId:run,sourceTrackId:track,
  cursorAt:'2026-10-31T00:00:00.000001Z',cursorId:payload.artifactId,waveId:''}
}
const range=(n:number)=>Array.from({length:n},(_,i)=>i)
function configure(current=sample(20,range(10)),prior=[sample(31,[...range(10),20],'old-alias')]){
 m.current=current;m.prior=prior
 m.cohort.mockResolvedValue(current.cohort);m.batch.mockResolvedValue(current.batch);m.spec.mockResolvedValue(current.spec)
 m.privacy.mockResolvedValue(current.privacy)
 m.allowed.mockResolvedValue(null)
 m.query.mockImplementation(async(strings:any,..._values:any[])=>{
  const sql=(strings.strings??strings).join('')
  if(sql.includes('AS payload'))return m.prior
  if(sql.includes('a.spec_id AS "specId"'))return [{specId:current.spec.id,runId:run,trackId:track,cohortSnapshotId:current.cohort.id}]
  if(sql.includes('COUNT(e.id)'))return [{total:current.cohort.eligibleN,respondents:current.cohort.eligibleN,allSelfStudents:true,runReady:true,activityReady:true}]
  if(sql.includes('AS "priorN"'))return m.prior.map(old=>({priorN:old.cohort.eligibleN,
   shared:old.members.filter((member:any)=>current.cohort.members.some(c=>c.userId===member.userId)).length,minimumN:10}))
  throw new Error('Unexpected synthetic query: '+sql.slice(0,100))
 })
 const record=(payload:any)=>({id:payload.artifactId,organizationId:org,specId:current.spec.id,analysisKind:'GROUP',policyDomain:'ORG_GROUP_REPORT_V1',
  cohortSnapshotId:current.cohort.id,generatedAt:new Date(payload.generatedAt),artifactPayload:payload})
 m.create.mockImplementation(async(input:any)=>record(input.artifactPayload))
 m.artifact.mockResolvedValue(record(current.payload))
 m.read.mockResolvedValue({artifactId:current.payload.artifactId,generatedAt:current.payload.generatedAt,
  projection:current.payload.projection,metricMetadata:current.payload.schemaVersion===2?current.payload.metricMetadata:{}})
}
beforeEach(()=>{vi.clearAllMocks();configure();m.context.mockResolvedValue({membershipId:'admin-membership',productDomain:'SCHOOL',organizationStatus:'ACTIVE',orgRole:'ORG_ADMIN',personas:[],explicitDenies:[]})})
const generate=()=>generateCampusGroupReport({actor,organizationId:org,runId:run,trackId:track,specId:m.current.spec.id,leaf})
describe('School leaf effective-contributor differencing',()=>{
 it('rejects 31/20 roster separation when aliased metric contributors are 11/10 with one-person difference before persistence',async()=>{
  expect(m.prior[0].payload.projection.metrics['old-alias'].validN).toBe(11)
  expect(m.current.payload.projection.metrics.score.validN).toBe(10)
  await expect(generate()).rejects.toMatchObject({code:'CAMPUS_GROUP_DIFFERENCING_WITHHELD',statusCode:409})
  expect(m.create).not.toHaveBeenCalled()
  if(process.env.SCHOOL_CONTRIBUTOR_SQL_CAPTURE){
   const [sql]=m.query.mock.calls.find(([sql])=>(sql.strings??sql).join('').includes('AS payload'))!
   writeFileSync(process.env.SCHOOL_CONTRIBUTOR_SQL_CAPTURE,JSON.stringify({text:sql.text,values:sql.values,current:m.current,prior:m.prior}))
  }
 })
 it('preserves a legal partial report with at least ten distinct effective contributors on one side',async()=>{
  configure(sample(20,range(10)),[sample(40,range(20),'old-alias')])
  const result=await generate()
  expect(result.projection.metrics[0]).toMatchObject({state:'present',validN:10,missingN:10,mean:0})
  expect(m.create).toHaveBeenCalledTimes(1)
 })
 it('also withholds the historical GET before returning a comparable metric',async()=>{
  await expect(readCampusGroupReport({actor,organizationId:org,artifactId:m.current.payload.artifactId}))
   .rejects.toMatchObject({code:'CAMPUS_GROUP_DIFFERENCING_WITHHELD',statusCode:409})
  expect(m.create).not.toHaveBeenCalled()
 })
 it('does not treat a legacy unknown subset as the precise roster, while retaining disjoint history',async()=>{
  delete m.prior[0].payload.metricContributorExecutionIds
  await expect(generate()).rejects.toMatchObject({code:'CAMPUS_GROUP_DIFFERENCING_WITHHELD'})
  configure(sample(20,range(10)),[sample(31,[...range(10),20],'old-alias',STANDARD,'unrelated')])
  delete m.prior[0].payload.metricContributorExecutionIds
  await expect(generate()).resolves.toMatchObject({projection:{metrics:[{state:'present',mean:0}]}})
 })
 it('keeps complete legacy manifests and the same immutable historical disclosure readable',async()=>{
  configure(sample(20,range(10)),[sample(40,range(40),'old-alias')])
  expect(m.prior[0].payload.metricContributorExecutionIds).toBeUndefined()
  await expect(generate()).resolves.toBeDefined()
  configure();delete m.current.payload.metricContributorExecutionIds;m.prior=[m.current]
  await expect(readCampusGroupReport({actor,organizationId:org,artifactId:m.current.payload.artifactId})).resolves.toBeDefined()
 })
 it('rejects corrupt duplicate, unknown and null subset references instead of falling back to a roster',async()=>{
  for(const subset of [Array(11).fill('execution-31-0'),[...range(10).map(i=>`execution-31-${i}`),'unrelated-execution'],null]){
   configure();m.prior[0].payload.metricContributorExecutionIds['old-alias']=subset
   await expect(generate()).rejects.toMatchObject({code:'REPORT_ARTIFACT_INTEGRITY',statusCode:500})
  }
 })
 it('retains frozen ENHANCED partial suppression and ignores metrics not approved by the current governed projection',async()=>{
  configure(sample(20,range(10),'score',ENHANCED))
  const enhanced=await generate()
  expect(enhanced.projection.metrics[0]).toMatchObject({state:'suppressed',mean:null,validN:null})
  expect(m.query.mock.calls.filter(([sql])=>(sql.strings??sql).join('').includes('AS payload'))).toHaveLength(0)
  configure();m.allowed.mockResolvedValue([])
  m.read.mockResolvedValue({artifactId:m.current.payload.artifactId,generatedAt:m.current.payload.generatedAt,
   projection:{...m.current.payload.projection,metrics:{}}})
  await expect(generate()).resolves.toMatchObject({projection:{metrics:[]}})
 })
 it('does not confuse a genuinely different source metric with a display alias',async()=>{
  configure(sample(20,range(10)),[sample(31,[...range(10),20],'old-alias',STANDARD,'student',{sourceMetricKey:'different-score'})])
  await expect(generate()).resolves.toBeDefined()
 })
 it.each(['REPEATED_COHORT','MATCHED_LONGITUDINAL'])('compares actual current contributors to a complete old %s wave',async(kind)=>{
  configure(sample(31,[...range(10),20]),[sample(20,range(20),'old-alias')])
  const old=m.prior[0],metric=old.payload.projection.metrics['old-alias']
  old.legacyKind=kind;old.waveId='w1'
  if(kind==='REPEATED_COHORT'){
   old.waveProjection={...old.payload.projection,waveId:'w1'}
   old.payload.projection={kind,state:'present',waves:[old.waveProjection,{...old.waveProjection,waveId:'w2'}]}
  }else{
   old.waveProjection={kind,state:'present',mode:'FULL_CASE',matchedEligibleN:20,metrics:{'old-alias':{state:'present',validCaseN:20,
    waveMeans:[{waveId:'w1',mean:metric.aggregations.mean},{waveId:'w2',mean:0}]}}}
   old.payload.projection=old.waveProjection
  }
  await expect(generate()).rejects.toMatchObject({code:'CAMPUS_GROUP_DIFFERENCING_WITHHELD'})
 })
 it('compares an older visible eleven-person leaf even when its cohort science floor was thirty',async()=>{
  const old=sample(31,[...range(10),20],'old-alias',STANDARD,'student',{cohortFloor:30})
  expect(projectCampusGeneralGroupV2({artifactId:old.payload.artifactId,projection:old.payload.projection,
   options:STANDARD,minimumN:10,metricMinimums:{'old-alias':10}}).metrics['old-alias'].validN).toBe(11)
  configure(sample(20,range(10)),[old])
  await expect(generate()).rejects.toMatchObject({code:'CAMPUS_GROUP_DIFFERENCING_WITHHELD'})
 })
 it('compares an immutable general-V2 publication with nine effective contributors under its own five-person floor',async()=>{
  const old=sample(31,range(9),'old-alias',STANDARD,'student',{floor:5,legacy:true})
  const projection=projectCampusGeneralGroupV2({artifactId:old.payload.artifactId,projection:old.payload.projection,
   options:STANDARD,minimumN:5,metricMinimums:{'old-alias':5}})
  expect(projection.metrics['old-alias'].validN).toBe(9)
  old.releases=[{projection,digest:canonicalHash(projection),scopeKey:canonicalHash({kind:'CAMPUS_GENERAL_GROUP_V2',
   organizationId:org,runId:run,trackId:track,specId:old.spec.id}),policySnapshotId:old.privacy.id}]
  configure(sample(20,range(10)),[old])
  await expect(generate()).rejects.toMatchObject({code:'CAMPUS_GROUP_DIFFERENCING_WITHHELD'})
 })
 it('does not treat an unpublished partial schema1 GROUP as a released general-V2 numeric report',async()=>{
  configure(sample(20,range(10)),[sample(31,[...range(10),20],'old-alias',STANDARD,'student',{legacy:true})])
  await expect(generate()).resolves.toBeDefined()
 })
 it('checks the next bounded history batch and retains the complete microsecond continuation key',async()=>{
  const safe=range(20).map(i=>{const old=sample(31,[...range(10),20],`alias-${i}`,STANDARD,`separate-${i}`)
   old.cursorId=`history-${String(i).padStart(3,'0')}`;return old})
  configure(sample(20,range(10)),[...safe,sample(31,[...range(10),20],'last-alias')])
  const original=m.query.getMockImplementation()!;let pages=0
  m.query.mockImplementation((sql:any,...values:any[])=>
   (sql.strings??sql).join('').includes('AS payload')?Promise.resolve(m.prior.slice((pages++)*20,pages*20)):original(sql,...values))
  await expect(generate()).rejects.toMatchObject({code:'CAMPUS_GROUP_DIFFERENCING_WITHHELD'})
  const calls=m.query.mock.calls.filter(([sql])=>(sql.strings??sql).join('').includes('AS payload'))
  expect(calls).toHaveLength(2)
  expect(calls[1][0].values).toContain('2026-10-31T00:00:00.000001Z')
  expect(calls[1][0].values).toContain('history-019')
  expect(m.create).not.toHaveBeenCalled()
  configure(sample(20,range(10)),[...safe,sample(31,[...range(10),20],'last-alias',STANDARD,'also-separate')])
  const legal=m.query.getMockImplementation()!;pages=0
  m.query.mockImplementation((sql:any,...values:any[])=>
   (sql.strings??sql).join('').includes('AS payload')?Promise.resolve(m.prior.slice((pages++)*20,pages*20)):legal(sql,...values))
  await expect(generate()).resolves.toBeDefined()
  expect(pages).toBe(2)
 })
 it('ignores old ENHANCED-suppressed partial metrics and validates frozen publication provenance',async()=>{
  configure(sample(20,range(10)),[sample(31,[...range(10),20],'old-alias',ENHANCED)])
  await expect(generate()).resolves.toBeDefined()
  const old=sample(31,range(9),'old-alias',STANDARD,'student',{floor:5,legacy:true})
  const projection=projectCampusGeneralGroupV2({artifactId:old.payload.artifactId,projection:old.payload.projection,
   options:STANDARD,minimumN:5,metricMinimums:{'old-alias':5}})
  const release={projection,digest:canonicalHash(projection),scopeKey:canonicalHash({kind:'CAMPUS_GENERAL_GROUP_V2',
   organizationId:org,runId:run,trackId:track,specId:old.spec.id}),policySnapshotId:old.privacy.id}
  for(const corrupt of [{...release,digest:'wrong'},{...release,scopeKey:'other-track'},{...release,policySnapshotId:'other-policy'}]){
   configure(sample(20,range(10)),[{...old,releases:[corrupt]}])
   await expect(generate()).rejects.toMatchObject({code:'CAMPUS_GENERAL_RELEASE_INTEGRITY'})
  }
  configure(sample(20,range(10)),[{...old,releases:[release],privacy:{...old.privacy,effectiveHash:'wrong'}}])
  await expect(generate()).rejects.toMatchObject({code:'PRIVACY_SNAPSHOT_INTEGRITY'})
 })
})
