import {describe,it,expect} from 'vitest'
import { STANDARD,ENHANCED,recognizePreset,presetOptions,reportPrivacyCatalog } from '../../modules/report-privacy/registry'
import { resolvePrivacyLayers,requestedOptions } from '../../modules/report-privacy/effective.service'
import { policyFingerprint,privacyOptionsSchema } from '../../modules/report-privacy/schema'

describe('report privacy PR1 option registry and effective preference resolution',()=>{
  it('starts with standard feedback without loosening product data boundaries',()=>{
    const p=resolvePrivacyLayers({scenario:'TEACHER_STUDENT_EVALUATION'})
    expect(p.selected).toEqual(STANDARD)
    expect(p.origin).toBe('PRODUCT_DEFAULT')
    expect(reportPrivacyCatalog('HUITEACHER','TEACHER_STUDENT_EVALUATION').reportConsumerActive).toBe(false)
    expect(()=>reportPrivacyCatalog('HUISCHOOL','TEACHER_STUDENT_EVALUATION')).toThrow()
  })
  it('publisher wins over school default, but cannot lower mandatory school minimum',()=>{
    const p=resolvePrivacyLayers({scenario:'TEACHER_ADULT_FORM_GROUP',
      schoolDefault:ENHANCED,publisher:{...STANDARD,withholdSmallCells:true},
      schoolMinimum:{requireAllCompleted:true,releaseDelayHours:24}})
    expect(p.origin).toBe('MY')
    expect(p.effective.requireAllCompleted).toBe(true)
    expect(p.effective.releaseDelayHours).toBe(24)
    expect(p.effective.withholdSmallCells).toBe(true)
    expect(p.effective.minRespondentsProfile).toBe('BASELINE')
    expect(p.locks.requireAllCompleted).toBe('SCHOOL_MINIMUM')
  })
  it('locks all sensitive school psychology report options regardless of publisher choices',()=>{
    const p=resolvePrivacyLayers({scenario:'SCHOOL_SENSITIVE_WELLBEING_GROUP',publisher:STANDARD})
    expect(p.effective).toEqual(ENHANCED)
    expect(p.effectivePreset).toBe('ENHANCED')
    expect(Object.keys(p.locks)).toHaveLength(Object.keys(STANDARD).length)
  })
  it('accepts only exact preset or strict custom schemas',()=>{
    expect(requestedOptions({scope:'MY',preset:'STANDARD'})).toEqual(STANDARD)
    expect(recognizePreset(presetOptions('ENHANCED'))).toBe('ENHANCED')
    expect(()=>requestedOptions({scope:'MY',preset:'STANDARD',options:STANDARD})).toThrow()
    expect(()=>privacyOptionsSchema.parse({...STANDARD,allowRawAnswers:true})).toThrow()
    expect(()=>requestedOptions({scope:'SCHOOL_MINIMUM',options:{releaseDelayHours:0}})).toThrow()
    expect(()=>requestedOptions({scope:'MY',preset:'CUSTOM',options:{...STANDARD,releaseDelayHours:8}})).toThrow()
  })
  it('fingerprints are deterministic, input-bound and order-independent',()=>{
    const a=policyFingerprint({options:{a:1,b:2},revision:1})
    expect(a).toBe(policyFingerprint({revision:1,options:{b:2,a:1}}))
    expect(a).not.toBe(policyFingerprint({revision:2,options:{a:1,b:2}}))
  })
})
