import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({rows:vi.fn(),attempts:vi.fn(),snapshots:vi.fn(),load:vi.fn(),entry:vi.fn(),context:vi.fn(),spec:vi.fn()}))
vi.mock('../../config/database',()=>{const tx={$queryRaw:m.rows,compositeAssessmentAttempt:{findMany:m.attempts},assessmentUnitSnapshot:{findMany:m.snapshots}};return{prisma:{...tx,$transaction:(f:any)=>f(tx)}}})
vi.mock('../../modules/assessment-runtime/compact-assessment-storage',()=>({loadStoredCanonicalUnitResults:m.load}))
vi.mock('../../modules/assessment-run/registeredResources',()=>({resolveHistoricalRelationalEntry:m.entry}))
vi.mock('../../modules/organization/access',()=>({resolveOrganizationAccessContext:m.context}))
vi.mock('../../modules/reporting/spec',()=>({getPublishedReportingSpec:m.spec}))
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {governedArtifactMetrics} from '../../modules/reporting/governedDisclosure'
import {resolveAuthoritativeRunResults,listAuthoritativeRunLeafSources} from '../../modules/reporting/resultSource'
import type {ReportingCohortSnapshotRecord,ReportingLeafSourceV2} from '../../modules/reporting/types'
const leaf:ReportingLeafSourceV2={slotKey:'scale:a',unitType:'SCALE',instrumentKey:'a',instrumentVersion:'1',compiledRuntimeHash:'a'.repeat(64)}
const actor={userId:'u',membershipId:'m',actorSnapshotId:'actor',executionId:'e'}
const cohort={organizationId:'org',sourceRunId:'run',sourceTrackId:'track',selector:{kind:'RUN_TRACK_SUBJECTS'},members:[actor]} as ReportingCohortSnapshotRecord
const row={executionId:'e',executionStatus:'COMPLETED',trackId:'track',assignmentId:'assign',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'parent',subjectUserId:'u',respondentUserId:'u',subjectMembershipId:'m',respondentMembershipId:'m',subjectActorRole:'STUDENT',respondentActorRole:'STUDENT',subjectProvenanceKind:'ORG_MEMBER',respondentProvenanceKind:'ORG_MEMBER',relationshipKind:'SELF',perspective:'SELF_REPORT',policyDomain:'ORGANIZATION_RUN',resourceFamily:'BUNDLE',resourceKey:'bundle',resourceVersion:'1'}
const view=(key:string,value:number)=>({resultHash:key,core:{unitType:'SCALE',instrumentKey:key,instrumentVersion:'1',compiledRuntimeHash:key.repeat(64),quality:{status:'interpretable'},metrics:[{key:'score',value,unit:'score'}]}})
const contract=(minimumRespondents:number|null)=>({schemaVersion:1,policyKey:'synthetic-leaf-disclosure',minimumRespondents,audiences:Object.fromEntries(['RESPONDENT','SUBJECT','TEACHER','PARENT','PROFESSIONAL','ORGANIZATION','RESEARCH'].map(a=>[a,{mode:minimumRespondents?'AGGREGATE_ONLY':'NONE',metricKeys:minimumRespondents?['score']:[],longitudinalMetricKeys:[]}]))})
let snapshots:any[]=[]
beforeEach(()=>{
 vi.clearAllMocks()
 m.entry.mockResolvedValue({releaseStatus:'PUBLISHED',resultDisclosure:contract(null)})
 m.rows.mockResolvedValue([row]);m.attempts.mockResolvedValue([{id:'parent',status:'COMPLETED',userId:'u',subjectUserId:'u',respondentUserId:'u',assignmentRef:'assign',attemptEpoch:2}])
 snapshots=[{id:'new-a',compositeAttemptId:'parent',attemptEpoch:2,slotKey:'scale:a',compiledRuntimeHash:leaf.compiledRuntimeHash,canonicalResultEncrypted:'a'},
 {id:'new-b',compositeAttemptId:'parent',attemptEpoch:2,slotKey:'scale:b',compiledRuntimeHash:'b'.repeat(64),canonicalResultEncrypted:'b'},
 {id:'old-a',compositeAttemptId:'parent',attemptEpoch:1,slotKey:'scale:a',compiledRuntimeHash:leaf.compiledRuntimeHash,canonicalResultEncrypted:'old'}]
 m.snapshots.mockImplementation(async({where}:any)=>snapshots.filter(s=>(!where.slotKey||s.slotKey===where.slotKey)&&(!where.id||where.id.in.includes(s.id))&&(!where.OR||where.OR.some((pair:any)=>pair.compositeAttemptId===s.compositeAttemptId&&pair.attemptEpoch===s.attemptEpoch))))
 m.load.mockImplementation(async(ciphers:string[])=>ciphers.map(cipher=>cipher==='old'?view('a',100):view(cipher,cipher==='a'?0:999)))
})
describe('selected Organization Run leaf observations',()=>{
 it('isolates equal metric names in different tools and uses only the current completed epoch',async()=>{
  const result=await resolveAuthoritativeRunResults(cohort,leaf)
  expect(result.resolved[0].metrics).toEqual([{key:'score',value:0,unit:'score',resultQuality:'interpretable',metricQuality:null}])
  expect(result.resourceKey).toBe('a')
  expect(m.load).toHaveBeenCalledWith(['a'])
  expect(m.snapshots.mock.calls[0][0].where.slotKey).toBe('scale:a')
 })
 it('keeps a missing latest leaf missing instead of borrowing its prior high score',async()=>{
  snapshots=snapshots.filter(s=>s.id!=='new-a')
  const result=await resolveAuthoritativeRunResults(cohort,leaf)
  expect(result.resolved[0].metrics).toEqual([])
 })
 it('rejects another measurement definition at the selected slot',async()=>{
  await expect(resolveAuthoritativeRunResults(cohort,{...leaf,compiledRuntimeHash:'c'.repeat(64)})).rejects.toMatchObject({code:'REPORT_MEASUREMENT_MISMATCH'})
 })
 it('does not turn a new unfinished execution into a completed contribution',async()=>{
  m.rows.mockResolvedValue([{...row,executionStatus:'STARTED',runtimeBindingRef:null}]);m.attempts.mockResolvedValue([])
  const result=await resolveAuthoritativeRunResults(cohort,leaf)
  expect(result.resolved).toEqual([]);expect(result.unresolved).toHaveLength(1)
 })
 it('discovers current leaf definitions without returning participant values or decrypting every parent',async()=>{
  const result=await listAuthoritativeRunLeafSources({organizationId:'org',runId:'run',trackId:'track'})
  expect(result.map(t=>t.leaf.instrumentKey)).toEqual(['a','b'])
  expect(JSON.stringify(result)).not.toMatch(/999|resultHash|subjectUserId|canonicalResultEncrypted/)
  expect(m.load).toHaveBeenCalledWith(['a','b'])
  expect(m.snapshots.mock.calls[0][0].select.canonicalResultEncrypted).toBe(false)
 })
})

import {buildReportingArtifact} from '../../modules/reporting/engine'
describe('leaf artifact identity and measurement metadata',()=>{
 it('retains the V1 payload shape and binds V2 identity to the selected leaf, unit and source floor',()=>{
  const cohort3={...cohort,id:'cohort',eligibleN:3,cohortIdentityHash:'c',members:[0,1,2].map(i=>({...actor,userId:`u${i}`,membershipId:`m${i}`,executionId:`e${i}`}))}
  const spec:any={id:'spec',status:'PUBLISHED',specHash:'s',definition:{analysisKind:'GROUP',engineKey:'ORG_GROUP_V1',engineVersion:'1.0.0',minimumCohortN:3,minimumContributorN:3,reportEvidenceCeiling:'PILOT',metricRules:[{metricId:'score',sourceMetricKey:'score',acceptedResultQuality:['interpretable'],acceptedMetricQuality:'IGNORE_METRIC_QUALITY',minimumMetricN:3,aggregations:['MEAN']}]}}
  const batch:any={resourceFamily:'SCALE',resourceKey:'a',resourceVersion:'1',resourceMinimumN:10,unresolved:[],resolved:cohort3.members.map(member=>({executionId:member.executionId,subjectUserId:member.userId,membershipId:member.membershipId,canonicalResultHash:'hash',scientificMaturity:'PILOT',provenanceState:'FROZEN',scientificProvenanceHash:'p',metrics:[{key:'score',value:0,resultQuality:'interpretable',metricQuality:null,unit:'ms'}]}))}
  const args={artifactId:'artifact',generatedByUserId:'owner',generatedAt:'2026-10-30T00:00:00Z',cohort:cohort3,spec,batch}
  const old=buildReportingArtifact(args),selected=buildReportingArtifact({...args,leaf})
  expect(old.payload.schemaVersion).toBe(1);expect(old.payload).not.toHaveProperty('metricMetadata');expect(old.payload.source).not.toHaveProperty('leaf')
  expect(selected.payload).toMatchObject({schemaVersion:2,source:{leaf},metricMetadata:{score:{unit:'ms',minimumN:10}}})
  expect(selected.analysisIdentityHash).not.toBe(buildReportingArtifact({...args,leaf:{...leaf,slotKey:'another-slot'}}).analysisIdentityHash)
  batch.resolved[1].metrics[0].unit='seconds'
  expect(()=>buildReportingArtifact({...args,leaf})).toThrow('mixed units')
 })
})

describe('content-owned leaf minimum',()=>{
 it('enforces parent10 leaf20 spec10 cohort12 for generation and retained snapshot reads',async()=>{
  const n=12,parentContract=contract(10),leafContract=contract(20)
  m.entry.mockImplementation(async(input:any)=>({releaseStatus:'PUBLISHED',resultDisclosure:input.resourceKind==='BUNDLE'?parentContract:leafContract}))
  const members=Array.from({length:n},(_,i)=>({...actor,userId:`u${i}`,membershipId:`m${i}`,executionId:`e${i}`}))
  const c={...cohort,id:'cohort',eligibleN:n,cohortIdentityHash:canonicalHash(members),members}
  m.rows.mockResolvedValue(members.map((member,i)=>({...row,executionId:member.executionId,subjectUserId:member.userId,respondentUserId:member.userId,subjectMembershipId:member.membershipId,respondentMembershipId:member.membershipId,runtimeBindingRef:`parent${i}`,assignmentId:`assignment${i}`,scientificMaturity:null,scientificProvenanceHash:null,requestedPolicy:{minimumRespondents:10},frozenResourcePolicy:{minimumRespondents:10}})))
  m.attempts.mockResolvedValue(members.map((member,i)=>({id:`parent${i}`,status:'COMPLETED',userId:member.userId,subjectUserId:member.userId,respondentUserId:member.userId,assignmentRef:`assignment${i}`,attemptEpoch:2})))
  snapshots=members.map((_member,i)=>({id:`unit${i}`,compositeAttemptId:`parent${i}`,attemptEpoch:2,slotKey:leaf.slotKey,compiledRuntimeHash:leaf.compiledRuntimeHash,canonicalResultEncrypted:'a'}))
  const batch=await resolveAuthoritativeRunResults(c,leaf)
  const definition={analysisKind:'GROUP',engineKey:'ORG_GROUP_V1',engineVersion:'1.0.0',minimumCohortN:10,minimumContributorN:10,reportEvidenceCeiling:'PILOT',metricRules:[{metricId:'score',sourceMetricKey:'score',acceptedResultQuality:['interpretable'],acceptedMetricQuality:'IGNORE_METRIC_QUALITY',minimumMetricN:10,aggregations:['MEAN','DISTRIBUTION']}]}
  const spec:any={id:'spec',status:'PUBLISHED',specHash:'s',definition}
  const args={artifactId:'artifact',generatedByUserId:'owner',generatedAt:'2026-10-30T00:00:00Z',cohort:c,spec,batch,leaf}
  const generated=buildReportingArtifact(args)
  const stored=(count:number,split=false)=>{
   const savedMembers=Array.from({length:count},(_,i)=>({...actor,userId:`u${i}`,membershipId:`m${i}`,executionId:`e${i}`}))
   const savedBatch={...batch,resourceMinimumN:10,resolved:savedMembers.map((member,i)=>({...batch.resolved[i%n],executionId:member.executionId,subjectUserId:member.userId,membershipId:member.membershipId,metrics:[{...batch.resolved[0].metrics[0],value:split&&i>=count/2?1:0}]}))}
   const built=buildReportingArtifact({...args,cohort:{...c,members:savedMembers,eligibleN:count,cohortIdentityHash:canonicalHash(savedMembers)},batch:savedBatch})
   return {id:'artifact',organizationId:'org',specId:'spec',analysisKind:'GROUP',artifactPayload:built.payload} as any
  }
  const policy={minimumRespondents:10,resultDisclosure:parentContract}
  const track={family:'BUNDLE',key:'bundle',version:'1',policy,hash:canonicalHash(policy),closedAt:new Date('2026-01-01'),productDomain:'SCHOOL'}
  m.rows.mockResolvedValue([track]);m.context.mockResolvedValue({membershipId:'admin',organizationStatus:'ACTIVE',orgRole:'ORG_ADMIN',productDomain:'SCHOOL',personas:[],capabilities:[],explicitDenies:[]});m.spec.mockResolvedValue(spec)
  const input={principal:{userId:'owner',platformRole:'STANDARD' as const}}
  const unsafe=stored(12)
  const blocked=await governedArtifactMetrics({...input,artifact:unsafe}).then(()=>false,()=>true)
  expect({effectiveFloor:batch.resourceMinimumN,retainedTwelveBlocked:blocked}).toEqual({effectiveFloor:20,retainedTwelveBlocked:true})
  expect(generated.payload.projection.state).toBe('suppressed')
  expect(generated.analysisIdentityHash).not.toBe(unsafe.artifactPayload.analysisIdentityHash)
  await expect(governedArtifactMetrics({...input,artifact:stored(20)})).resolves.toEqual(['score'])
  await expect(governedArtifactMetrics({...input,artifact:stored(20,true)})).rejects.toMatchObject({code:'REPORT_NOT_FOUND'})
  m.rows.mockResolvedValue([{...track,policy:{minimumRespondents:10},productDomain:'LEGACY'}])
  m.context.mockResolvedValue({membershipId:'admin',organizationStatus:'ACTIVE',orgRole:'ORG_ADMIN',productDomain:'LEGACY',personas:[],capabilities:[],explicitDenies:[]})
  await expect(governedArtifactMetrics({...input,artifact:unsafe})).rejects.toMatchObject({code:'REPORT_NOT_FOUND'})
  m.context.mockResolvedValue({membershipId:'admin',organizationStatus:'SUSPENDED',orgRole:'ORG_ADMIN',productDomain:'LEGACY',personas:[],capabilities:[],explicitDenies:[]})
  await expect(governedArtifactMetrics({principal:{userId:'owner',platformRole:'SYSTEM_ADMIN'},artifact:stored(20)})).resolves.toEqual(['score'])
  const legacy=stored(20);legacy.artifactPayload={...legacy.artifactPayload,schemaVersion:1}
  await expect(governedArtifactMetrics({...input,artifact:legacy})).resolves.toBeNull()
 })
})
