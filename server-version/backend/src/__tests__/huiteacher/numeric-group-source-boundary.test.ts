import {buildReportingArtifact} from '../../modules/reporting/engine'
import {expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
const {db,resolve}=vi.hoisted(()=>({db:{$queryRaw:vi.fn()},resolve:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:db}))
vi.mock('../../modules/huiteacher/groupReportAuthority',()=>({assertTeacherGroupAuthority:vi.fn(async()=>({productAdmin:true}))}))
vi.mock('../../modules/assessment-run/registeredResources',()=>({resolveHistoricalRelationalEntry:resolve}))
import {generateTeacherNumericGroup,teacherAggregateReady,assertTeacherNumericDisclosure,listTeacherNumericVersionPointers} from '../../modules/huiteacher/numericGroupReport.service'
it('rejects an unimplemented native family before generic leaf resolution, despite an explicit GROUP parent',async()=>{
 const policy={subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],analysisMode:'COHORT_AGGREGATE',resultDisclosure:{policyKey:'EDUCATION_SELF_GROUP_V2'}}
 db.$queryRaw.mockResolvedValueOnce([{runId:'run',name:'Synthetic',eventClosed:true,runClosed:true}])
  .mockResolvedValueOnce([{family:'COGNITIVE',key:'education-assessment:TEACHER:org:source',version:'2.0.0',policy,hash:canonicalHash(policy)}])
 await expect(generateTeacherNumericGroup({organizationId:'org',eventId:'event',actorUserId:'manager',trackId:'track',specId:'spec',selection:{kind:'ALL'},leaf:{unitType:'COGNITIVE',slotKey:'cognitive:item',instrumentKey:'reaction',instrumentVersion:'1.0.0',compiledRuntimeHash:'a'.repeat(64)}})).rejects.toMatchObject({statusCode:404})
 expect(resolve).not.toHaveBeenCalled()
})

it('only honors the actual aggregate contract delay rather than inventing a universal close requirement',()=>{
 expect(teacherAggregateReady({mode:'AGGREGATE_ONLY'},null,1000)).toBe(true)
 expect(teacherAggregateReady({mode:'DELAYED_AGGREGATE',delaySeconds:10},null,10000)).toBe(false)
 expect(teacherAggregateReady({mode:'DELAYED_AGGREGATE',delaySeconds:10},new Date(0),9999)).toBe(false)
 expect(teacherAggregateReady({mode:'DELAYED_AGGREGATE',delaySeconds:10},new Date(0),10000)).toBe(true)
})
it('freezes only per-metric contributor subsets and rejects a one-person swap despite unchanged overall N',async()=>{
 const members=Array.from({length:20},(_,i)=>({executionId:'e'+i,userId:'u'+i,membershipId:'m'+i,actorSnapshotId:'a'+i}))
 const cohort={id:'cohort',organizationId:'org',sourceRunId:'run',sourceTrackId:'track',eligibleN:20,members,cohortIdentityHash:'a'.repeat(64)} as any
 const spec={id:'spec',status:'PUBLISHED',specHash:'b'.repeat(64),definition:{schemaVersion:1,analysisKind:'GROUP',engineKey:'ORG_GROUP_V1',engineVersion:'1.0.0',privacyUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT',minimumCohortN:10,minimumContributorN:10,reportEvidenceCeiling:'PILOT',metricRules:[{metricId:'score',sourceMetricKey:'score',acceptedResultQuality:['interpretable'],acceptedMetricQuality:'IGNORE_METRIC_QUALITY',aggregations:['MEAN'],missingnessRule:'EXCLUDE',minimumMetricN:10,observationUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT'}]}} as any
 const leaf={unitType:'SCALE',slotKey:'scale:item',instrumentKey:'actual-scale',instrumentVersion:'1.0.0',compiledRuntimeHash:'c'.repeat(64)} as const
 const make=(offset:number)=>buildReportingArtifact({artifactId:'artifact'+offset,generatedByUserId:'manager',generatedAt:'2026-10-31T00:00:00Z',cohort,spec,leaf,batch:{organizationId:'org',runId:'run',trackId:'track',resourceFamily:'SCALE',resourceKey:'source',resourceVersion:'1.0.0',resourceMinimumN:10,unresolved:[],resolved:members.map((m,i)=>({...m,subjectUserId:m.userId,canonicalResultHash:'d'.repeat(64),scientificMaturity:'PILOT',provenanceState:'FROZEN',scientificProvenanceHash:null,metrics:[{key:'score',value:i>=offset&&i<offset+10?1:null,resultQuality:'interpretable'}]}))}} as any).payload
 const old=make(0),candidate=make(1)
 expect(old.schemaVersion===2&&old.metricContributorExecutionIds?.score).toEqual(members.slice(0,10).map(m=>m.executionId))
 expect(candidate.schemaVersion===2&&candidate.metricContributorExecutionIds?.score).toEqual(members.slice(1,11).map(m=>m.executionId))
 expect(JSON.stringify(candidate.projection)).not.toContain('executionId')
 db.$queryRaw.mockReset().mockResolvedValueOnce([{hash:'e'.repeat(64)}]).mockResolvedValueOnce([{payload:old,minimumN:10,metricRules:spec.definition.metricRules}])
 await expect(assertTeacherNumericDisclosure({organizationId:'org',cohort,leaf,minimumN:10,payload:candidate,metricRules:spec.definition.metricRules})).rejects.toMatchObject({code:'TEACHER_REPORT_EFFECTIVE_DIFFERENCING_BLOCKED'})
 // The same source metric can have a different presentation id in another spec.
 const renamed=structuredClone(candidate) as any
 renamed.projection.metrics.renamed=renamed.projection.metrics.score;delete renamed.projection.metrics.score
 renamed.metricMetadata.renamed=renamed.metricMetadata.score;delete renamed.metricMetadata.score
 renamed.metricContributorExecutionIds.renamed=renamed.metricContributorExecutionIds.score;delete renamed.metricContributorExecutionIds.score
 db.$queryRaw.mockResolvedValueOnce([{hash:'e'.repeat(64)}]).mockResolvedValueOnce([{payload:old,minimumN:10,metricRules:spec.definition.metricRules}])
 await expect(assertTeacherNumericDisclosure({organizationId:'org',cohort,leaf,minimumN:10,payload:renamed,metricRules:[{metricId:'renamed',sourceMetricKey:'score'}]})).rejects.toMatchObject({code:'TEACHER_REPORT_EFFECTIVE_DIFFERENCING_BLOCKED'})
})

it('seeks26 same-time version pointers with the full timestamp and id, without selecting saved report payloads',async()=>{
 const at='2026-10-31T00:00:00.123456Z',rows=Array.from({length:26},(_,i)=>({artifactId:'10000000-0000-4000-8000-'+String(26-i).padStart(12,'0'),generatedAt:new Date(at),cursorAt:at}))
 db.$queryRaw.mockReset().mockResolvedValueOnce(rows).mockResolvedValueOnce([rows[25]])
 const first=await listTeacherNumericVersionPointers({organizationId:'org',runId:'run'})
 expect(first.versions).toHaveLength(25);expect(first.nextCursor).toEqual({generatedAt:at,artifactId:rows[24].artifactId})
 const second=await listTeacherNumericVersionPointers({organizationId:'org',runId:'run',before:first.nextCursor!})
 expect(second.versions).toEqual([{artifactId:rows[25].artifactId,generatedAt:rows[25].generatedAt.toISOString()}]);expect(second.nextCursor).toBeNull()
 const query=db.$queryRaw.mock.calls[1][0]
 expect(query.sql).toContain('(a.generated_at,a.id)<');expect(query.values).toContain(at);expect(query.values).toContain(rows[24].artifactId)
 expect(query.sql.split('FROM reporting_analysis_artifacts')[0]).not.toContain('artifact_payload')
})
