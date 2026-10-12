import { describe,expect,it } from 'vitest'
import { compileGroupQuotaPolicy,compileCheckpointPolicy,SurveyOperationsDefinitionError,
  groupQuotaPolicySchema } from '../../modules/survey/operations.definition'
import { compileSurveyFlow,SurveyFlowError,type SurveyFlowDraft } from '../../modules/survey/flow.definition'
import { compileFrozenResearchUnit } from '../../modules/survey/publication.service'
import type { ResearchFrozenPublication } from '../../modules/survey/publication.service'
import { computeSurveyFinal } from '../../modules/survey/final.compute'
import type { FormDraft,ScaleDraft } from '../../modules/survey/builder.definition'

const form:FormDraft={schemaVersion:1,pages:[{
  pageKey:'baseline',title:'筛选',questions:[{
    itemKey:'eligible',type:'SINGLE',prompt:'是否参加',required:true,rows:[],
    options:[{optionKey:'yes',label:'是'},{optionKey:'no',label:'否'}],
  }],
}]}
const frozen=compileFrozenResearchUnit({
  id:'formdraft',instrumentKey:'screener',kind:'FORM',title:'筛选',
  revision:0,definition:form,
})
const flow=():SurveyFlowDraft=>({
  schemaVersion:1,embeddedData:[],
  experiment:{experimentKey:'trial',linkedPolicy:'RERANDOMIZE',groups:[
    {groupKey:'a',weight:1,materialTitle:'A',materialBody:'条件 A'},
    {groupKey:'b',weight:2,materialTitle:'B',materialBody:'条件 B'},
  ]},
  blocks:[
    {blockKey:'first',kind:'INSTRUMENT',instrumentKey:'screener'},
    {blockKey:'done',kind:'END',termination:'SCREEN_OUT',
      when:{op:'EQUALS',field:{source:'ANSWER',instrumentKey:'screener',itemKey:'eligible'},
        value:'no'}},
  ],
})
describe('Survey PR4 operations authoring and bounded Flow contracts',()=>{
  it('requires exact, typed non-prototype group quotas and keeps checkpoint disabled by default',()=>{
    const compiled=compileSurveyFlow(flow(),[frozen],'SINGLE_UNLINKED')
    expect(compileGroupQuotaPolicy({schemaVersion:1,groupLimits:{a:10,b:20}},compiled))
      .toEqual({schemaVersion:1,groupLimits:{a:10,b:20}})
    expect(compileGroupQuotaPolicy(null,compiled)).toBeUndefined()
    expect(compileCheckpointPolicy(undefined)).toBeUndefined()
    expect(compileCheckpointPolicy({schemaVersion:1,enabled:true,ttlHours:24}))
      .toEqual({schemaVersion:1,enabled:true,ttlHours:24})
    expect(()=>compileGroupQuotaPolicy({schemaVersion:1,groupLimits:{a:10}},compiled))
      .toThrow(SurveyOperationsDefinitionError)
    expect(()=>compileGroupQuotaPolicy({schemaVersion:1,groupLimits:{a:10,b:0}},compiled))
      .toThrow(SurveyOperationsDefinitionError)
    const unsafe=JSON.parse('{"schemaVersion":1,"groupLimits":{"a":10,"b":20,"__proto__":1}}')
    expect(groupQuotaPolicySchema.safeParse(unsafe).success).toBe(false)
    expect(()=>compileCheckpointPolicy({schemaVersion:1,enabled:true,ttlHours:49}))
      .toThrow(SurveyOperationsDefinitionError)
    expect(()=>compileCheckpointPolicy({schemaVersion:1,enabled:false,ttlHours:24}))
      .toThrow(SurveyOperationsDefinitionError)
  })
  it('rejects unfinishable early termination before an unconditional instrument',()=>{
    const wrong=flow()
    wrong.blocks=[
      {blockKey:'early',kind:'END',termination:'COMPLETE_EARLY',
        when:{op:'EQUALS',field:{source:'EMBEDDED',key:'always'},value:'yes'}},
      {blockKey:'first',kind:'INSTRUMENT',instrumentKey:'screener'},
    ]
    wrong.embeddedData=[{key:'always',source:'STATIC',type:'STRING',value:'yes'}]
    expect(()=>compileSurveyFlow(wrong,[frozen],'SINGLE_UNLINKED')).toThrow(SurveyFlowError)
    const conditional=flow()
    conditional.blocks[0].when={op:'IS_MISSING',field:{source:'EMBEDDED',key:'optional'}}
    conditional.embeddedData=[{key:'optional',source:'STATIC',type:'STRING',value:''}]
    expect(()=>compileSurveyFlow(conditional,[frozen],'SINGLE_UNLINKED')).toThrow(SurveyFlowError)
  })
  it('rejects runaway recursive conditions before running recursive Zod parse',()=>{
    const nested=flow()
    let rule:NonNullable<SurveyFlowDraft['blocks'][number]['when']>={
      op:'IS_MISSING',field:{source:'EMBEDDED',key:'fixed'},
    }
    for(let depth=0;depth<30;depth++)rule={op:'NOT',term:rule}
    nested.embeddedData=[{key:'fixed',source:'STATIC',type:'NUMBER',value:0}]
    nested.blocks[1].when=rule
    expect(()=>compileSurveyFlow(nested,[frozen],'SINGLE_UNLINKED')).toThrow(SurveyFlowError)
  })
})

describe('Survey Scale timed FINAL contract and historical compatibility',()=>{
  const scale:ScaleDraft={
    schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',
    responseOptions:[{optionKey:'o1',label:'少',score:1},{optionKey:'o2',label:'多',score:2}],
    dimensions:[{dimensionKey:'d',label:'研究维度',direction:'descriptive'}],
    aggregation:'mean',items:[{itemKey:'q',prompt:'态度',required:true,
      reverse:false,dimensionKeys:['d']}],
  }
  const unit=compileFrozenResearchUnit({id:'timed-draft',instrumentKey:'timed',
    kind:'SCALE',title:'研究计时量表',revision:0,definition:scale})
  const snapshot:ResearchFrozenPublication={
    schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:'p',waveId:'w',
    collectionMode:'SINGLE_UNLINKED',consentVersion:1,linkageNoticeConfirmed:false,
    consentDigest:'frozen',units:[unit],runtimeStatus:'SURVEY_FINAL_V1',
  }
  const rows={timed:{q:{schemaVersion:1 as const,firstResponseMs:1520,
    activeTimeMs:2250,changeCount:1,revisitCount:1,visits:2,
    interrupted:false,recoveredWithoutClock:false}}}
  it('stores verified timing separately from frozen scorer results',()=>{
    const first=computeSurveyFinal(snapshot,{timed:{q:'o2'}},null,undefined,'FINAL',rows)
    const changed=computeSurveyFinal(snapshot,{timed:{q:'o2'}},null,undefined,'FINAL',{
      timed:{q:{...rows.timed.q,firstResponseMs:1450}},
    })
    expect(first.itemTimings).toEqual(rows)
    expect(first.units[0].privateScoring).toEqual(changed.units[0].privateScoring)
    expect(first.units[0].rawAnswers).toEqual({q:'o2'})
  })
  it('rejects unrecognized items and impossible or absent timing evidence',()=>{
    expect(()=>computeSurveyFinal(snapshot,{timed:{q:'o2'}}))
      .toThrow(/逐题施测/)
    expect(()=>computeSurveyFinal(snapshot,{timed:{q:'o2'}},null,undefined,'FINAL',{
      timed:{q:{...rows.timed.q,firstResponseMs:999999}},
    })).toThrow(/首次反应时间/)
    expect(()=>computeSurveyFinal(snapshot,{timed:{q:'o2'}},null,undefined,'FINAL',{
      timed:{wrong:rows.timed.q},
    })).toThrow(/未知/)
  })
  it('keeps already frozen no-mode Scale answers valid without fabricated times',()=>{
    const historical={...unit,displayDefinition:{
      ...scale,presentationMode:undefined,
    }}
    const result=computeSurveyFinal({...snapshot,units:[historical]},
      {timed:{q:'o1'}})
    expect(result.itemTimings).toBeUndefined()
    expect(result.units[0].rawAnswers).toEqual({q:'o1'})
  })
})
