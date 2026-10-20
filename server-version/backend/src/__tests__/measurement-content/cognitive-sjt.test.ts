import { describe, expect, it, vi } from 'vitest'
vi.hoisted(() => { process.env.COGNITIVE_MODULE_ENABLED = 'true' })
import { cognitiveMeasurementRelease } from '../../modules/measurement-content/cognitive'
import { sjtMeasurementRelease } from '../../modules/measurement-content/sjt'
import { prepareRelease } from '../../modules/measurement-content/release'
import { compileResearchSjt } from '../../modules/survey/builder.compiler'
import { SURVEY_GONOGO_CONFIG } from '../../modules/survey/cognitive.definition'
const scope={kind:'PRIVATE' as const,ownerId:'owner',product:'SURVEY' as const,resourceId:'project'}
const cognition=()=>({localId:'gonogo',version:'1',testType:'gonogo',configVersion:'1.1.0',engineVersion:'1.0.0',scoringVersion:'1.0.0',config:SURVEY_GONOGO_CONFIG,scope})
const sjt=()=>compileResearchSjt('test',{
  schemaVersion:1,respondentType:'student_self_report',scenarioKey:'classroom',title:'课堂情境',stimulus:'你想参加讨论。',
  author:'研究者',sourceNote:'研究自编',licenseStatus:'self_authored',redistribution:'allowed',
  metrics:[{metricKey:'effort',label:'投入',direction:'descriptive'}],
  questions:[{questionKey:'first',prompt:'你会怎么做？',options:[
    {optionKey:'try',label:'参与',contributions:{effort:2}},{optionKey:'wait',label:'等待',contributions:{effort:0}},
  ]},{questionKey:'second',prompt:'接下来怎么做？',options:[{optionKey:'discuss',label:'继续讨论',contributions:{effort:2}},{optionKey:'leave',label:'离开',contributions:{effort:0}}]}],
}).package.definition
const sjtInput=()=>({localId:'discussion',version:'1',instrumentVersion:'1',definition:sjt(),scope})
describe('existing Cognitive and SJT version adapters',()=>{
  it('freezes supported timing configuration separately from report settings',()=>{
    const original=cognition(),base=prepareRelease(cognitiveMeasurementRelease(original))
    const reportOnly={...original,config:{...original.config,report:{...original.config.report,reportVersion:'2.0.0'}}}
    expect(prepareRelease(cognitiveMeasurementRelease(reportOnly)).contentHash).toBe(base.contentHash)
    expect(prepareRelease(cognitiveMeasurementRelease({...original,config:{...original.config,stimulusMs:900}})).contentHash).not.toBe(base.contentHash)
    expect(prepareRelease(cognitiveMeasurementRelease({...original,protocolContext:{timingPolicy:'software-frame-v1'}})).contentHash).not.toBe(base.contentHash)
  })
  it('rejects missing runners and injected script/config keys',()=>{
    expect(()=>cognitiveMeasurementRelease({...cognition(),testType:'not-installed'})).toThrow()
    expect(()=>cognitiveMeasurementRelease({...cognition(),config:{...SURVEY_GONOGO_CONFIG,script:'arbitrary'}})).toThrow()
  })
  it('keeps SJT scoring keys in measurement and report prose outside it',()=>{
    const input=sjtInput(),base=prepareRelease(sjtMeasurementRelease(input))
    const prose=structuredClone(input.definition);prose.report.disclaimer='修订解释措辞'
    expect(prepareRelease(sjtMeasurementRelease({...input,definition:prose})).contentHash).toBe(base.contentHash)
    const score=structuredClone(input.definition);score.scoring.scoringVersion+='-corrected'
    expect(prepareRelease(sjtMeasurementRelease({...input,definition:score})).contentHash).not.toBe(base.contentHash)
    if(base.layer!=='MEASUREMENT')throw new Error('wrong layer')
    expect(base.content.executable).not.toHaveProperty('report')
    expect(base.content.executable).not.toHaveProperty('referencePolicy')
  })
  it('preserves explicit SJT presentation/response protocol without admitting unverified online metadata',()=>{
    const input=sjtInput(),first=prepareRelease(sjtMeasurementRelease({...input,displayProtocol:{orderPolicy:'FIXED',responseType:'SINGLE'}}))
    expect(prepareRelease(sjtMeasurementRelease({...input,displayProtocol:{orderPolicy:'FIXED',responseType:'MULTIPLE'}})).contentHash).not.toBe(first.contentHash)
    expect(()=>sjtMeasurementRelease({...input,onlineProtocol:{responseProtocol:'unverified'}})).toThrow()
  })
})
