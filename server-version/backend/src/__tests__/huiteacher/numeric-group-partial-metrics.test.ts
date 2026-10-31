import {expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {buildSelfGroupCohortAnalysisPolicy} from '../../modules/assessment-policy/self-group-contract'
import {testDisclosure} from '../assessment-policy/result-disclosure.fixture'
const mocks=vi.hoisted(()=>({db:{$queryRaw:vi.fn(),$transaction:vi.fn()},resolve:vi.fn(),spec:vi.fn(),generate:vi.fn(),read:vi.fn(),stored:vi.fn(),selector:vi.fn(),presentation:vi.fn(),lock:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:mocks.db}))
vi.mock('../../modules/huiteacher/groupReportAuthority',()=>({assertTeacherGroupAuthority:vi.fn(async()=>({productAdmin:true}))}))
vi.mock('../../modules/assessment-run/registeredResources',()=>({resolveHistoricalRelationalEntry:mocks.resolve}))
vi.mock('../../modules/reporting/spec',()=>({getPublishedReportingSpec:mocks.spec}))
vi.mock('../../modules/reporting/service',()=>({generateOrganizationGroupAnalysis:mocks.generate,readOrganizationGroupArtifact:mocks.read}))
vi.mock('../../modules/reporting/artifact',()=>({readReportingArtifactRecord:mocks.stored}))
vi.mock('../../modules/reporting/education-group-selection',()=>({educationGroupSelector:mocks.selector,educationGroupPresentation:mocks.presentation,listEducationGroupSelections:vi.fn()}))
vi.mock('../../modules/huiteacher/privacyReleaseV2.service',()=>({lockTeacherDisclosure:mocks.lock}))
import {generateTeacherNumericGroup} from '../../modules/huiteacher/numericGroupReport.service'

it('keeps allowed A when withheld B has a small contributor change, through the same producer transaction',async()=>{
 const contract=testDisclosure(10);contract.policyKey='EDUCATION_SELF_GROUP_V2'
 contract.audiences.ORGANIZATION={mode:'AGGREGATE_ONLY',metricKeys:['A'],longitudinalMetricKeys:[]}
 const policy={subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],minimumRespondents:10,resultDisclosure:contract}
 const entry={applicability:{...policy,analysisMode:'COHORT_AGGREGATE',relationshipKinds:['SELF'],perspectives:['SELF_REPORT']},
  resultDisclosure:contract,cohortAnalysisPolicy:buildSelfGroupCohortAnalysisPolicy(contract)}
 mocks.resolve.mockResolvedValue(entry)
 let privateLeaf=false
 const leafContract=structuredClone(contract)
 mocks.db.$queryRaw.mockImplementation(async(strings:TemplateStringsArray)=>{
  const frozen=privateLeaf?{...policy,educationComposition:{unitReports:[{blockId:'fixed-block',groupDisclosure:leafContract}]}}:policy
  return strings.join('').includes('resource_family')?
   [{family:privateLeaf?'BUNDLE':'SCALE',key:privateLeaf?'education-composition:TEACHER:source:TEACHER:SELF:1.0.0':'teacher-scale:fixed:GROUP',version:privateLeaf?'1.0.0':'2.0.0',policy:frozen,hash:canonicalHash(frozen),blockId:'fixed-block'}]:
   [{runId:'run',eventStatus:'OPEN',runStatus:'PUBLISHED',closedAt:null}]
 })
 mocks.spec.mockResolvedValue({definition:{analysisKind:'GROUP',minimumCohortN:10,minimumContributorN:10,
  metricRules:['A','B'].map(sourceMetricKey=>({metricId:sourceMetricKey,sourceMetricKey,minimumMetricN:10}))}})
 const leaf={slotKey:'scale:item',unitType:'SCALE' as const,instrumentKey:'same-C',instrumentVersion:'1.0.0',compiledRuntimeHash:'a'.repeat(64)}
 const input={organizationId:'org',actorUserId:'admin',eventId:'event',trackId:'track',specId:'spec',selection:{kind:'ALL' as const},leaf}
 await expect(generateTeacherNumericGroup(input)).rejects.toMatchObject({code:'REPORT_SPEC_SCOPE'})
 expect(mocks.generate).not.toHaveBeenCalled()
 const tx={id:'caller-lock-transaction',$queryRaw:vi.fn()}
 mocks.db.$transaction.mockImplementation(async callback=>callback(tx))
 const manifest=Array.from({length:20},(_,i)=>({executionId:'e'+i,subjectUserId:'u'+i}))
 const rawProjection={state:'present',eligibleN:20,resultContributorN:20,metrics:{A:{state:'present',validN:20,missingN:0,aggregations:{mean:2}},B:{state:'present',validN:10,missingN:10,aggregations:{mean:99}}}}
 const payload={schemaVersion:2,inputManifest:manifest,projection:rawProjection,metricMetadata:{A:{minimumN:10},B:{minimumN:10}},metricContributorExecutionIds:{B:manifest.slice(1,11).map(row=>row.executionId)}}
 const previous={...payload,metricContributorExecutionIds:{B:manifest.slice(0,10).map(row=>row.executionId)}}
 tx.$queryRaw.mockResolvedValueOnce([{hash:'e'.repeat(64)}]).mockResolvedValueOnce([{payload:previous,minimumN:10,metricRules:['A','B'].map(key=>({metricId:key,sourceMetricKey:key}))}])
 mocks.generate.mockImplementation(async request=>{
  await request.beforePersist({cohort:{sourceRunId:'run',sourceTrackId:'track'},payload})
  return {artifactId:'saved'}
 })
 const visible={...rawProjection,metrics:{A:rawProjection.metrics.A}}
 mocks.stored.mockResolvedValue({id:'saved',specId:'spec',organizationId:'org',analysisKind:'GROUP',generatedAt:new Date('2026-10-31'),
  artifactPayload:{schemaVersion:2,source:{runId:'run',trackId:'track',leaf},projection:{...visible,metrics:{...visible.metrics,B:{state:'present',validN:10,aggregations:{mean:99}}}},metricMetadata:{A:{minimumN:10},B:{minimumN:10}}}})
 mocks.read.mockResolvedValue({projection:visible})
 const result=await generateTeacherNumericGroup(input,{allowPartialSourceMetrics:true})
 expect(mocks.lock).toHaveBeenCalledWith(tx,'org')
 expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({tx,leaf,specId:'spec',beforePersist:expect.any(Function)}))
 expect(result.projection.metrics).toEqual([expect.objectContaining({key:'A',mean:2,validN:20})])
 expect(JSON.stringify(result)).not.toContain('99')
 expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({artifactId:'saved'}))
 // A sibling leaf keeps B in the parent union. This selected leaf still
 // permits only A, so its withheld B must not consume a disclosure budget.
 privateLeaf=true;contract.audiences.ORGANIZATION.metricKeys=['A','B']
 entry.cohortAnalysisPolicy=buildSelfGroupCohortAnalysisPolicy(contract)
 tx.$queryRaw.mockResolvedValueOnce([{hash:'e'.repeat(64)}]).mockResolvedValueOnce([{payload:previous,minimumN:10,metricRules:['A','B'].map(key=>({metricId:key,sourceMetricKey:key}))}])
 expect((await generateTeacherNumericGroup(input,{allowPartialSourceMetrics:true})).projection.metrics).toEqual(result.projection.metrics)
 contract.audiences.ORGANIZATION.metricKeys=['unplanned']
 await expect(generateTeacherNumericGroup(input,{allowPartialSourceMetrics:true})).rejects.toMatchObject({code:'REPORT_SPEC_SCOPE'})
 expect(mocks.generate).toHaveBeenCalledTimes(2)
})
