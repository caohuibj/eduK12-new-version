import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({rows:vi.fn(),attempts:vi.fn(),snapshots:vi.fn(),load:vi.fn()}))
vi.mock('../../config/database',()=>{const tx={$queryRaw:m.rows,compositeAssessmentAttempt:{findMany:m.attempts},assessmentUnitSnapshot:{findMany:m.snapshots}};return{prisma:{...tx,$transaction:(f:any)=>f(tx)}}})
vi.mock('../../modules/assessment-runtime/compact-assessment-storage',()=>({loadStoredCanonicalUnitResults:m.load}))
import {resolveAuthoritativeRunResults,listAuthoritativeRunLeafSources} from '../../modules/reporting/resultSource'
import type {ReportingCohortSnapshotRecord,ReportingLeafSourceV2} from '../../modules/reporting/types'
const leaf:ReportingLeafSourceV2={slotKey:'scale:a',unitType:'SCALE',instrumentKey:'a',instrumentVersion:'1',compiledRuntimeHash:'a'.repeat(64)}
const actor={userId:'u',membershipId:'m',actorSnapshotId:'actor',executionId:'e'}
const cohort={organizationId:'org',sourceRunId:'run',sourceTrackId:'track',selector:{kind:'RUN_TRACK_SUBJECTS'},members:[actor]} as ReportingCohortSnapshotRecord
const row={executionId:'e',executionStatus:'COMPLETED',trackId:'track',assignmentId:'assign',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'parent',subjectUserId:'u',respondentUserId:'u',subjectMembershipId:'m',respondentMembershipId:'m',subjectActorRole:'STUDENT',respondentActorRole:'STUDENT',subjectProvenanceKind:'ORG_MEMBER',respondentProvenanceKind:'ORG_MEMBER',relationshipKind:'SELF',perspective:'SELF_REPORT',policyDomain:'ORGANIZATION_RUN',resourceFamily:'BUNDLE',resourceKey:'bundle',resourceVersion:'1'}
const view=(key:string,value:number)=>({resultHash:key,core:{unitType:'SCALE',instrumentKey:key,instrumentVersion:'1',compiledRuntimeHash:key.repeat(64),quality:{status:'interpretable'},metrics:[{key:'score',value,unit:'score'}]}})
let snapshots:any[]=[]
beforeEach(()=>{
 vi.clearAllMocks()
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
