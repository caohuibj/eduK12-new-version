import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({read:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{educationReportPolicySnapshot:{findUnique:m.read}}}))
import {projectCampusLeafGroupWithPolicy} from '../../modules/campus/group-reports'
import {readFrozenPrivacyForRun} from '../../modules/report-privacy/snapshot.service'
import {STANDARD,ENHANCED} from '../../modules/report-privacy/registry'
import {policyFingerprint} from '../../modules/report-privacy/schema'
const leaf={slotKey:'scale:a',unitType:'SCALE' as const,instrumentKey:'a',instrumentVersion:'1',compiledRuntimeHash:'a'.repeat(64)}
const input={organizationId:'org',runId:'run',artifactId:'artifact',generatedAt:'2026-10-30T00:00:00Z',metricMetadata:{score:{unit:'ms',minimumN:10}},projection:{kind:'GROUP',state:'present',eligibleN:20,resultContributorN:20,metrics:{score:{state:'present',validN:20,missingN:0,aggregations:{mean:3.456,sdSample:2.222,distribution:{state:'present',cells:[{value:3,count:20}]}}}}}}
const frozen=(scenario:string,options=STANDARD)=>{const effective={schemaVersion:1,product:'HUISCHOOL',scenario,options,source:'APPROVED_REPORT_PREFERENCE_V1'};return{id:'policy',product:'HUISCHOOL',scenario,policyVersion:1,effective,effectiveHash:policyFingerprint(effective),fingerprint:'policy-hash'}}
beforeEach(()=>vi.clearAllMocks())
describe('School selected leaf preserves the existing frozen privacy projection',()=>{
 it('keeps a legacy Run strict instead of exposing counts, SD or cells through the new path',async()=>{
  m.read.mockResolvedValue(null)
  const result=await projectCampusLeafGroupWithPolicy(input,leaf)
  expect(result.projection).toMatchObject({completedN:null,assignedN:null})
  expect(result.projection.metrics[0]).toMatchObject({mean:3.5,validN:null,missingN:null,sdSample:null,frequencies:[]})
 })
 it('uses the general frozen policy precision and numeric fields without adding item cells',async()=>{
  m.read.mockResolvedValue(frozen('SCHOOL_GENERAL_EDUCATION_GROUP'))
  const result=await projectCampusLeafGroupWithPolicy(input,leaf)
  expect(result.projection).toMatchObject({completedN:20,assignedN:20})
  expect(result.projection.metrics[0]).toMatchObject({mean:3.46,validN:20,missingN:0,sdSample:2.22,unit:'ms',frequencies:[]})
 })
 it('honors sensitive and require-all-completed options for subgroups',async()=>{
  m.read.mockResolvedValue(frozen('SCHOOL_SENSITIVE_WELLBEING_GROUP',ENHANCED))
  const complete=await projectCampusLeafGroupWithPolicy(input,leaf)
  expect(complete.projection.metrics[0]).toMatchObject({mean:3.5,validN:null,sdSample:null})
  const partial=await projectCampusLeafGroupWithPolicy({...input,projection:{...input.projection,resultContributorN:10,metrics:{score:{state:'present',validN:10,missingN:10,aggregations:{mean:3.456,sdSample:2.222,distribution:{state:'present',cells:[{value:3,count:10}]}}}}}},leaf)
  expect(partial.projection.metrics[0]).toMatchObject({state:'suppressed',mean:null,sdSample:null,validN:null})
 })
 it('retains exact single-scenario, product and frozen-hash rejection in the shared reader',async()=>{
  const row=frozen('SCHOOL_SENSITIVE_WELLBEING_GROUP',ENHANCED),db={educationReportPolicySnapshot:{findUnique:m.read}} as any
  m.read.mockResolvedValue(row)
  await expect(readFrozenPrivacyForRun(db,{organizationId:'org',runId:'run',product:'HUISCHOOL',scenario:'SCHOOL_GENERAL_EDUCATION_GROUP'})).rejects.toMatchObject({code:'PRIVACY_SNAPSHOT_INTEGRITY'})
  m.read.mockResolvedValue({...row,product:'HUITEACHER'})
  await expect(projectCampusLeafGroupWithPolicy(input,leaf)).rejects.toMatchObject({code:'PRIVACY_SNAPSHOT_INTEGRITY'})
  m.read.mockResolvedValue({...row,effectiveHash:'corrupt'})
  await expect(projectCampusLeafGroupWithPolicy(input,leaf)).rejects.toMatchObject({code:'PRIVACY_SNAPSHOT_INTEGRITY'})
 })
})
