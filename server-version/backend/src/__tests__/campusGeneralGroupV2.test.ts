import {describe,expect,it} from 'vitest'
import {STANDARD,ENHANCED} from '../modules/report-privacy/registry'
import {buildReportingArtifact} from '../modules/reporting/engine'
import type {ReportingAnalysisSpecRecord,ReportingCohortSnapshotRecord,
  ReportingResultBatchV1,ReportingGroupSpecV1} from '../modules/reporting/types'
import {projectCampusGeneralGroupV2} from '../modules/campus/generalGroupV2.projection'
import {exactGeneralContributors,unsafeComparableGeneralOverlap}
  from '../modules/campus/generalGroupV2.differencing'

const source={
  kind:'GROUP',state:'present',eligibleN:6,resultContributorN:5,
  metrics:{participation:{state:'present',validN:5,missingN:1,
    aggregations:{mean:3.225,median:3.2,sdPopulation:0.43,distribution:{
      state:'present',cells:[{value:1,count:1},{value:5,count:4}]}}}},
}
const calc=(projection:unknown,options=STANDARD,minimumN=5)=>
  projectCampusGeneralGroupV2({artifactId:'artifact-test',projection,options,
    minimumN,metricMinimums:{participation:5}})
describe('Huischool PR3 approved general group aggregate V2 projection',()=>{
  it('permits n=5 of N=6 when the reviewed science floor is 5, not personal responses',()=>{
    const p=calc(source)
    expect(p.state).toBe('READY')
    expect(p.metrics.participation).toMatchObject({mean:3.23,validN:5,
      missingN:1,median:3.2,sdPopulation:0.43})
    expect(p.participantN).toBe(6)
    expect(JSON.stringify(p)).not.toContain('distribution')
    expect(JSON.stringify(p)).not.toContain('"value":1')
  })
  it('enhanced/forced privacy and science floors override standard preference',()=>{
    expect(calc(source,ENHANCED).state).toBe('WITHHELD')
    expect(calc(source,STANDARD,10).state).toBe('WITHHELD')
    expect(calc(source,{...STANDARD,requireAllCompleted:true}).state).toBe('WITHHELD')
    expect(calc(source,{...STANDARD,protectSmallNonrespondentComplement:true}).state).toBe('WITHHELD')
  })
  it('aggregate-only restricted precision avoids exact counts and extra statistics',()=>{
    const p=calc({...source,eligibleN:7,resultContributorN:7,
      metrics:{participation:{state:'present',validN:7,missingN:0,
        aggregations:{mean:3.225,median:3,sdPopulation:1}}}},
      {...STANDARD,restrictedStatisticsProjection:true})
    expect(p).toMatchObject({state:'READY',participantN:null,completedN:null,
      metrics:{participation:{mean:3.2}}})
    expect(p.metrics.participation).not.toHaveProperty('validN')
    expect(p.metrics.participation).not.toHaveProperty('median')
  })
  it('never exposes metrics outside the published scientific spec',()=>{
    const compromised={...source,metrics:{...source.metrics,
      unreviewedSensitiveResult:{state:'present',validN:5,missingN:1,
        aggregations:{mean:99.5,median:99.5}},
    }}
    const p=calc(compromised)
    expect(p.state).toBe('READY')
    expect(Object.keys(p.metrics)).toEqual(['participation'])
    expect(JSON.stringify(p)).not.toContain('unreviewedSensitiveResult')
    expect(JSON.stringify(p)).not.toContain('99.5')
  })
  it('incomplete or inconsistent numbers and unapproved metrics are withheld',()=>{
    expect(calc({...source,resultContributorN:4}).state).toBe('WITHHELD')
    expect(calc({...source,kind:'STUDENT_PERSONAL'}).state).toBe('WITHHELD')
    expect(calc({...source,metrics:{participation:{state:'present',validN:9,
      missingN:0,aggregations:{mean:1}}}}).state).toBe('WITHHELD')
    expect(calc({...source,metrics:{participation:{state:'suppressed'}}}).state)
      .toBe('WITHHELD')
  })
})


describe('Huischool V2 opt-in actual-contributor differencing',()=>{
  const ids=(from:number,to:number)=>Array.from({length:to-from+1},(_,i)=>'student-'+(from+i))
  const manifest=(users:readonly string[])=>users.map(subjectUserId=>({subjectUserId}))
  it('binds only valid unique canonical FINAL contributors, never invited roster size',()=>{
    const actual=ids(1,5)
    expect(exactGeneralContributors(manifest(actual),5)).toEqual(actual)
    expect(()=>exactGeneralContributors(manifest(actual),6)).toThrow('CAMPUS_GENERAL_CONTRIBUTORS_INVALID')
    expect(()=>exactGeneralContributors(manifest(['student-1','student-1',...ids(2,4)]),5))
      .toThrow('CAMPUS_GENERAL_CONTRIBUTORS_INVALID')
    expect(()=>exactGeneralContributors([{subjectUserId:'student-1'},...Array(4).fill({})],5))
      .toThrow('CAMPUS_GENERAL_CONTRIBUTORS_INVALID')
  })
  it('blocks 5/6 and changed partial contributors despite the same six invited students',()=>{
    const first=ids(1,5)
    expect(unsafeComparableGeneralOverlap(first,ids(1,6))).toBe(true)
    expect(unsafeComparableGeneralOverlap(ids(2,6),first)).toBe(true)
    expect(unsafeComparableGeneralOverlap(first,first)).toBe(false)
  })
  it('permits disjoint or sufficiently large changes, rather than a lifetime one-report cap',()=>{
    expect(unsafeComparableGeneralOverlap(ids(1,5),ids(6,10))).toBe(false)
    expect(unsafeComparableGeneralOverlap(ids(1,10),ids(6,15))).toBe(false)
    expect(unsafeComparableGeneralOverlap(ids(1,5),ids(1,10))).toBe(false)
    expect(unsafeComparableGeneralOverlap(ids(1,10),ids(11,20))).toBe(false)
    expect(unsafeComparableGeneralOverlap(ids(1,5),ids(2,6))).toBe(true)
  })
})

describe('School V2 actual canonical scientific engine (without a mock scorer)',()=>{
  it('projects only approved metrics from real GROUP computation and exact FINAL manifest',()=>{
    const definition:ReportingGroupSpecV1={
      schemaVersion:1,analysisKind:'GROUP',engineKey:'ORG_GROUP_V1',
      engineVersion:'1.0.0',privacyUnit:'SUBJECT',
      selectionPolicy:'UNIQUE_OR_REJECT',minimumCohortN:5,
      minimumContributorN:5,reportEvidenceCeiling:'PILOT',
      metricRules:[{metricId:'score',sourceMetricKey:'score',
        acceptedResultQuality:['interpretable'],
        acceptedMetricQuality:'IGNORE_METRIC_QUALITY',
        aggregations:['MEAN','MEDIAN'],missingnessRule:'EXCLUDE',
        minimumMetricN:5,observationUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT'}],
    }
    const spec:ReportingAnalysisSpecRecord={
      id:'published-scientific-spec',specKey:'school-test',version:1,
      status:'PUBLISHED',definition,specHash:'signed-test-definition',
      createdByUserId:'review-author',createdAt:new Date(),
      reviewedByUserId:'independent-reviewer',reviewedAt:new Date(),
      publishedAt:new Date(),
    }
    const members=Array.from({length:5},(_,i)=>({
      userId:'student-'+i,membershipId:'member-'+i,
      actorSnapshotId:'actor-'+i,executionId:'execution-'+i,
    }))
    const cohort:ReportingCohortSnapshotRecord={
      id:'frozen-cohort',organizationId:'school-review',
      sourceRunId:'closed-school-run',sourceTrackId:'self-report-track',
      selector:{kind:'RUN_TRACK_SUBJECTS',runId:'closed-school-run',trackId:'self-report-track'},
      members,eligibleN:5,cohortIdentityHash:'signed-cohort',
      snapshotHash:'frozen-source',generatedByUserId:'school-reviewer',generatedAt:new Date(),
    }
    const batch:ReportingResultBatchV1={
      resourceFamily:'BUNDLE',resourceKey:'approved-education-resource',
      resourceVersion:'1.0.0',resourceMinimumN:5,unresolved:[],
      resolved:members.map((member,i)=>({
        executionId:member.executionId,subjectUserId:member.userId,
        membershipId:member.membershipId,trackId:'self-report-track',
        canonicalResultHash:'official-final-'+i,
        metrics:[{key:'score',value:i+1,resultQuality:'interpretable',metricQuality:null},
          {key:'unreviewed-secret',value:99,resultQuality:'interpretable',metricQuality:null}],
        scientificMaturity:'PILOT',provenanceState:'FROZEN',
        scientificProvenanceHash:'source-proof-'+i,
      })),
    }
    const output=buildReportingArtifact({
      artifactId:'immutable-analysis',generatedByUserId:'school-reviewer',
      generatedAt:new Date().toISOString(),spec,cohort,batch,
    })
    const safe=projectCampusGeneralGroupV2({
      artifactId:'immutable-analysis',projection:output.payload.projection,
      options:STANDARD,minimumN:5,metricMinimums:{score:5},
    })
    expect(safe).toMatchObject({state:'READY',participantN:5,completedN:5,
      metrics:{score:{mean:3}}})
    expect(JSON.stringify(safe)).not.toContain('unreviewed-secret')
    expect(exactGeneralContributors(output.payload.inputManifest,5))
      .toEqual(members.map(x=>x.userId).sort())
  })
})
