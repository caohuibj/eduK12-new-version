import { describe,expect,it } from 'vitest'
import { validateReferenceGovernance } from '../../modules/assessment-reference/governance'
import type { AssessmentReferenceEntry } from '../../modules/assessment-reference/reference'
const fixture=():AssessmentReferenceEntry=>({scoreKey:'total',referenceKind:'descriptive_sample',evidenceLevel:'local_pilot',provenanceType:'local_observed',instrumentVersion:'1',scoringVersion:'1',population:{match:{gradeLevels:['7','8','9']},language:'zh-CN'},source:{citation:'Authorized local sample',sampleSize:2},statistics:{mean:1},governance:{schemaVersion:1,kind:'LOCAL_PILOT',measurementHash:'a'.repeat(64),subjectKey:'student',schoolStage:'junior_secondary',locale:'zh-CN',populationKey:'project',effectiveFrom:'2026-10-20T00:00:00Z',scoreRange:{min:0,max:10},bandSource:'EMPIRICAL_DISTRIBUTION',bands:[],sampleN:2,sourceDataset:'project',sourceSnapshot:'b'.repeat(64),crossStageReReferenceAllowed:false,calibration:{method:'Mean only',missingness:0,floor:0,ceiling:0,skew:0,subgroupReview:'Exploratory only, not a norm'}}})
describe('method-based empirical candidate governance',()=>{
  it('does not impose universal N or mandatory empirical bands',()=>expect(validateReferenceGovernance(fixture())).toEqual([]))
  it('keeps exact sample allocation and computational lower bounds',()=>{
    const bad=fixture();bad.governance!.bands=[{key:'all',label:'All',lower:0,upper:10,sampleN:1}]
    expect(validateReferenceGovernance(bad)).toContain('EMPIRICAL_BAND_ALLOCATION_INVALID')
    const one=fixture();one.governance!.sampleN=1;one.source.sampleSize=1;one.statistics.sd=1
    expect(validateReferenceGovernance(one)).toContain('EMPIRICAL_ESTIMATE_NOT_COMPUTABLE')
  })
  it('retains finite, source, and quality checks regardless of a review statement',()=>{
    const bad=fixture();bad.governance!.calibration!.missingness=NaN
    expect(validateReferenceGovernance(bad)).toContain('EMPIRICAL_QC_INVALID')
    const missing=fixture();delete missing.governance!.calibration
    expect(validateReferenceGovernance(missing)).toContain('EMPIRICAL_REVIEW_REQUIRED')
  })
})
