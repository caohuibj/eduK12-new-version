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
describe('adult reference population identity',()=>{
  const adult=():AssessmentReferenceEntry=>({...fixture(),population:{match:{minAgeMonthsInclusive:216,maxAgeMonthsExclusive:1440},language:'zh-CN'},governance:{...fixture().governance!,schoolStage:'adult'}})
  it('accepts an explicit adult age window without any grade identity',()=>expect(validateReferenceGovernance(adult())).toEqual([]))
  it('rejects adult entries that fake school grades',()=>{
    const bad=adult();bad.population={...bad.population!,match:{...bad.population!.match!,gradeLevels:['10','11','12']}}
    expect(validateReferenceGovernance(bad)).toContain('REFERENCE_POPULATION_IDENTITY_INVALID')
  })
  it('rejects adult entries without an explicit 18+ age window',()=>{
    const none=adult();none.population={language:'zh-CN'}
    expect(validateReferenceGovernance(none)).toContain('REFERENCE_POPULATION_IDENTITY_INVALID')
    const under=adult();under.population={match:{minAgeMonthsInclusive:144,maxAgeMonthsExclusive:720},language:'zh-CN'}
    expect(validateReferenceGovernance(under)).toContain('REFERENCE_POPULATION_IDENTITY_INVALID')
    const openEnded=adult();openEnded.population={match:{minAgeMonthsInclusive:216},language:'zh-CN'}
    expect(validateReferenceGovernance(openEnded)).toContain('REFERENCE_POPULATION_IDENTITY_INVALID')
  })
  it('rejects cross-stage re-reference claims on adult entries',()=>{
    const bad=adult();bad.governance!.crossStageReReferenceAllowed=true
    expect(validateReferenceGovernance(bad)).toContain('ADULT_CROSS_STAGE_FORBIDDEN')
  })
  it('keeps school-stage grade identity unchanged',()=>{
    const school=fixture()
    expect(validateReferenceGovernance(school)).toEqual([])
    const wrongGrades=fixture();wrongGrades.governance!.schoolStage='upper_secondary'
    expect(validateReferenceGovernance(wrongGrades)).toContain('REFERENCE_POPULATION_IDENTITY_INVALID')
    const withAgeWindow=fixture();withAgeWindow.population={...withAgeWindow.population!,match:{...withAgeWindow.population!.match!,minAgeMonthsInclusive:144,maxAgeMonthsExclusive:216}}
    expect(validateReferenceGovernance(withAgeWindow)).toEqual([])
  })
})
