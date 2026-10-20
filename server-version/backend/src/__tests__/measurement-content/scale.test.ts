import { describe, expect, it } from 'vitest'
import { compileResearchScale } from '../../modules/survey/builder.compiler'
import { prepareRelease } from '../../modules/measurement-content/release'
import { scaleMeasurementRelease, scopedScaleKey, type ScaleReleaseSource } from '../../modules/measurement-content/scale'
const definition=()=>compileResearchScale('私有工具',{
  schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',
  responseOptions:[{optionKey:'low',label:'较少',score:1},{optionKey:'high',label:'较多',score:2}],
  dimensions:[{dimensionKey:'effort',label:'投入',direction:'descriptive'}],
  items:[{itemKey:'one',prompt:'我愿意尝试',required:true,reverse:false,dimensionKeys:['effort']}],
})
const input=():ScaleReleaseSource=>({localId:'stress',version:'1',instrumentVersion:'1',definition:definition(),
  instrumentClass:'CUSTOM_DESCRIPTIVE',scope:{kind:'PRIVATE',ownerId:'researcher',product:'SURVEY',resourceId:'project-one'}})
describe('shared Scale publication adapter',()=>{
  it('publishes no-reference private Survey content through the existing Scale validator',()=>{
    const release=prepareRelease(scaleMeasurementRelease(input()))
    expect(release.layer).toBe('MEASUREMENT')
    expect(release.scope.kind).toBe('PRIVATE')
    expect(release.content).not.toHaveProperty('catalogStatus')
  })
  it('does not include embedded report/reference/source/license in executable identity',()=>{
    const original=input(),d=definition()
    d.report.disclaimer='新的报告措辞'
    d.source.title='新的目录标题'
    const changed={...original,definition:d}
    const a=prepareRelease(scaleMeasurementRelease(original)),b=prepareRelease(scaleMeasurementRelease(changed))
    expect(a.contentHash).toBe(b.contentHash)
    if(a.layer!=='MEASUREMENT')throw new Error('wrong layer')
    expect(a.content.executable).not.toHaveProperty('report')
    expect(a.content.executable).not.toHaveProperty('referencePolicy')
    expect(a.content.executable).not.toHaveProperty('license')
    const reversed=definition();reversed.scoring.itemRules[0].transform={type:'reverse'}
    expect(prepareRelease(scaleMeasurementRelease({...original,definition:reversed})).contentHash).not.toBe(a.contentHash)
  })
  it('isolates identical local keys across projects without contaminating the scientific hash',()=>{
    const one=input(),two={...input(),scope:{kind:'PRIVATE' as const,ownerId:'other',product:'SURVEY' as const,resourceId:'project-two'}}
    expect(scopedScaleKey(one.scope,'stress')).not.toBe(scopedScaleKey(two.scope,'stress'))
    expect(prepareRelease(scaleMeasurementRelease(one)).contentHash).toBe(prepareRelease(scaleMeasurementRelease(two)).contentHash)
  })
  it('keeps the existing runner readiness gate',()=>{
    const d=definition();d.display.randomizeItems=true
    expect(()=>scaleMeasurementRelease({...input(),definition:d})).toThrow('CONTENT_SCALE_DEFINITION_INVALID')
  })
})
