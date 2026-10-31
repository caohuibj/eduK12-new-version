import {expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {relationalEntryToRunPolicy} from '../../modules/assessment-run/resourceAuthority'
import {buildSelfGroupCohortAnalysisPolicy} from '../../modules/assessment-policy/self-group-contract'
import {testDisclosure} from '../assessment-policy/result-disclosure.fixture'
const {readIdentity}=vi.hoisted(()=>({readIdentity:vi.fn()}))
vi.mock('../../modules/education-tools/assessment-resource.repository',()=>({readEducationAssessmentDeliveryIdentity:readIdentity}))
import {teacherNativeLeafContract} from '../../modules/huiteacher/nativeGroupSource'

it('binds native leaves to their frozen C and separate GROUP ceilings without decoding participant results',async()=>{
 const parent=testDisclosure(10);parent.policyKey='EDUCATION_SELF_GROUP_V2'
 parent.audiences.ORGANIZATION={mode:'AGGREGATE_ONLY',metricKeys:['rt','sjt','blocked'],longitudinalMetricKeys:[]}
 const cog=testDisclosure(20);cog.policyKey=parent.policyKey;cog.audiences.ORGANIZATION={mode:'AGGREGATE_ONLY',metricKeys:['rt'],longitudinalMetricKeys:[]}
 const sjt=testDisclosure(10);sjt.policyKey=parent.policyKey;sjt.audiences.ORGANIZATION={mode:'AGGREGATE_ONLY',metricKeys:['sjt'],longitudinalMetricKeys:[]}
 const key='education-assessment:TEACHER:org:resource'
 const entry={releaseStatus:'PUBLISHED',initiationModes:['ORG_ASSIGN'],applicability:{schemaVersion:1,resourceKind:'BUNDLE',resourceKey:key,resourceVersion:'2.0.0',subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],analysisMode:'COHORT_AGGREGATE',visibilityPolicyKey:parent.policyKey,minimumRespondents:10},resultDisclosure:parent,cohortAnalysisPolicy:buildSelfGroupCohortAnalysisPolicy(parent),scienceMaturity:'PILOT',launchTarget:{runtime:'COMPOSITE',compositeAssessmentId:'runtime'}} as any
 const policy=relationalEntryToRunPolicy(entry),track={key,version:'2.0.0',family:'BUNDLE',policy,hash:canonicalHash(policy)}
 readIdentity.mockResolvedValue({entry,origin:{product:'TEACHER',organizationId:'org',family:'BUNDLE',runtimeCompositeId:'runtime',units:[
  {itemId:'cog',family:'COGNITIVE',measurement:{releaseId:'c'},groupDisclosure:cog},
  {itemId:'sjt',family:'SJT',measurement:{releaseId:'s'},groupDisclosure:sjt}]},
  runtime:{items:[{id:'cog'},{id:'sjt',situationalInstrumentKey:'exact-sjt',situationalInstrumentVersion:'3.0.0'}]},
  releases:new Map([['c',{layer:'MEASUREMENT',content:{runnerKey:'reaction',runnerVersion:'1.0.0',instrumentVersion:'config-not-engine'}}],['s',{layer:'MEASUREMENT',content:{}}]])})
 const db={$queryRaw:vi.fn().mockResolvedValue([{id:'header'}])} as any
 const source={organizationId:'org',runId:'run',trackId:'track'},leaf={slotKey:'cognitive:cog',unitType:'COGNITIVE' as const,instrumentKey:'reaction',instrumentVersion:'1.0.0',compiledRuntimeHash:'a'.repeat(64)}
 expect(await teacherNativeLeafContract(source,track,leaf,db)).toEqual(cog)
 expect(await teacherNativeLeafContract(source,track,{...leaf,slotKey:'situational:sjt',unitType:'SITUATIONAL',instrumentKey:'exact-sjt',instrumentVersion:'3.0.0'},db)).toEqual(sjt)
 expect(db.$queryRaw.mock.calls[0][0].sql).toContain('snap.attempt_epoch=p.attempt_epoch')
 expect(db.$queryRaw.mock.calls[0][0].sql).not.toContain('canonical_result_encrypted')
 await expect(teacherNativeLeafContract(source,track,{...leaf,instrumentVersion:'config-not-engine'},db)).rejects.toMatchObject({statusCode:404})
 db.$queryRaw.mockResolvedValueOnce([])
 await expect(teacherNativeLeafContract(source,track,{...leaf,compiledRuntimeHash:'b'.repeat(64)},db)).rejects.toMatchObject({statusCode:404})
 expect(await teacherNativeLeafContract(source,{...track,version:'1.0.0'},leaf,db)).toBeNull()
})
