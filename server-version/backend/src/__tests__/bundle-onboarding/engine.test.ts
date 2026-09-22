import { describe,it,expect } from 'vitest'
import { evaluateCondition, runDeclarativeEvidence } from '../../modules/assessment-bundle/onboarding/engine'
import { authoringFixture } from './fixtures'
const evidence=(value:any,quality:any='interpretable'):any=>[{evidenceKey:'score',quality,value}]
describe('bounded declarative engine',()=>{
  it('keeps negated missing and invalid comparisons unknown',()=>{
    for(const state of ['missing','invalid','not_applicable'])expect(evaluateCondition({op:'not',condition:{op:'gte',evidenceKey:'score',value:1}},evidence({state}))).toBe('unknown')
    expect(evaluateCondition({op:'not',condition:{op:'gt',evidenceKey:'score',value:1}},evidence({state:'present',value:2},'invalid'))).toBe('unknown')
  })
  it('recognizes invalid source quality even when a numeric value is retained', () => {
    const rows = evidence({state:'present',value:1},'invalid')
    expect(evaluateCondition({op:'invalid',evidenceKey:'score'}, rows)).toBe(true)
    expect(evaluateCondition({op:'present',evidenceKey:'score'}, rows)).toBe(false)
  })
  it('handles boundary comparisons and three-valued boolean composition',()=>{
    const yes:any={op:'gte',evidenceKey:'score',value:1},unknown:any={op:'eq',evidenceKey:'absent',value:1}
    expect(evaluateCondition(yes,evidence({state:'present',value:1}))).toBe(true)
    expect(evaluateCondition({op:'all',conditions:[yes,unknown]},evidence({state:'present',value:1}))).toBe('unknown')
    expect(evaluateCondition({op:'any',conditions:[yes,unknown]},evidence({state:'present',value:1}))).toBe(true)
  })
  it('suppresses unsupported quality and retains traceable rules',()=>{
    const p=authoringFixture(),input:any={declarativePackage:p,snapshot:{bundleKey:p.manifest.definition.bundleKey,bundleVersion:'1.0.0'},evidence:evidence({state:'present',value:1})}
    expect(runDeclarativeEvidence(input)).toMatchObject({kind:'COMPUTED',payload:{conclusions:[{ruleId:'observed',ruleVersion:'1.0.0',evidenceKeys:['score']}]}})
    input.evidence=evidence({state:'present',value:1},'limited')
    expect(runDeclarativeEvidence(input)).toMatchObject({payload:{conclusions:[]}})
  })
})
