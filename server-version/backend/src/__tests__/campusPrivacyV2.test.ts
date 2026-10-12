import {afterEach,describe,expect,it} from 'vitest'
import {STANDARD} from '../modules/report-privacy/registry'
import {
  schoolPrivacyV2Enabled,reviewedGeneralResources,generalRunApproved,parseFrozenSchoolOptions,
  reviewedMinimumFloor
} from '../modules/campus/privacyV2'

const old={prefs:process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED,
  school:process.env.REPORT_PRIVACY_SCHOOL_V2_ENABLED}
afterEach(()=>{
  if(old.prefs===undefined)delete process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED
  else process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED=old.prefs
  if(old.school===undefined)delete process.env.REPORT_PRIVACY_SCHOOL_V2_ENABLED
  else process.env.REPORT_PRIVACY_SCHOOL_V2_ENABLED=old.school
})
const allowed={family:'SCALE' as const,key:'reviewed-general-scale',version:'1.0'}
const track={...allowed,subjectRoles:['STUDENT'],respondentRoles:['STUDENT'],
  relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],analysisMode:'COHORT_AGGREGATE'}
describe('Huischool PR3 general reporting admission',()=>{
  it('never enables reporting via preferences flag alone',()=>{
    process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED='true'
    delete process.env.REPORT_PRIVACY_SCHOOL_V2_ENABLED
    expect(schoolPrivacyV2Enabled()).toBe(false)
    process.env.REPORT_PRIVACY_SCHOOL_V2_ENABLED='true'
    expect(schoolPrivacyV2Enabled()).toBe(true)
  })
  it('operator manifest requires exact resources; no broad family, duplicate or wildcard',()=>{
    expect(reviewedGeneralResources()).toEqual([])
    expect(reviewedGeneralResources(JSON.stringify([allowed]))).toEqual([allowed])
    expect(()=>reviewedGeneralResources(JSON.stringify([{...allowed,key:'*'}]))).toThrow()
    expect(()=>reviewedGeneralResources(JSON.stringify([allowed,allowed]))).toThrow()
    expect(()=>reviewedGeneralResources('malformed')).toThrow()
    expect(()=>reviewedGeneralResources(JSON.stringify([{family:'FORM',key:'x',version:'v1'}]))).toThrow()
  })
  it('rejects sensitivity-by-label laundering and every mixed or non-self track',()=>{
    const opts={purpose:'SCHOOL_CLIMATE' as const,tracks:[track],approved:[allowed]}
    expect(generalRunApproved(opts)).toBe(true)
    expect(generalRunApproved({...opts,purpose:'STUDENT_WELLBEING'})).toBe(false)
    expect(generalRunApproved({...opts,purpose:'FAMILY_SUPPORT'})).toBe(false)
    expect(generalRunApproved({...opts,tracks:[{...track,key:'depression'}]})).toBe(false)
    expect(generalRunApproved({...opts,tracks:[track,{...track,key:'depression'}]})).toBe(false)
    expect(generalRunApproved({...opts,tracks:[{...track,respondentRoles:['TEACHER']}]})).toBe(false)
    expect(generalRunApproved({...opts,tracks:[{...track,analysisMode:'INDIVIDUAL_ONLY'}]})).toBe(false)
  })
  it('rejects corrupt or oversized frozen tool minima rather than lowering the floor',()=>{
    expect(reviewedMinimumFloor(null)).toBe(0)
    expect(reviewedMinimumFloor(5)).toBe(5)
    expect(reviewedMinimumFloor(10)).toBe(10)
    expect(()=>reviewedMinimumFloor(0)).toThrow()
    expect(()=>reviewedMinimumFloor('10')).toThrow()
    expect(()=>reviewedMinimumFloor(10_001)).toThrow()
  })
  it('rejects malformed or cross-product policy snapshots',()=>{
    const frozen={schemaVersion:1,product:'HUISCHOOL',scenario:'SCHOOL_GENERAL_EDUCATION_GROUP',
      source:'APPROVED_REPORT_PREFERENCE_V1',options:STANDARD}
    expect(parseFrozenSchoolOptions(frozen)).toEqual(STANDARD)
    expect(()=>parseFrozenSchoolOptions({...frozen,product:'HUITEACHER'})).toThrow()
    expect(()=>parseFrozenSchoolOptions({...frozen,options:{...STANDARD,allowRaw:true}})).toThrow()
  })
})
