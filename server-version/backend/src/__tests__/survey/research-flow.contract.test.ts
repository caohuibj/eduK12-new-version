import { describe,expect,it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { compileFrozenResearchUnit,type ResearchFrozenPublication } from '../../modules/survey/publication.service'
import { compileSurveyFlow,parseSurveyFlowDraft,SurveyFlowError,evaluateFlowCondition } from '../../modules/survey/flow.definition'
import { chooseSurveyGroup,type SurveyFlowAssignment } from '../../modules/survey/flow.assignment'
import { buildSurveyFlowPublicProjection } from '../../modules/survey/flow.runtime'
import { computeSurveyFinal,SurveyFinalValidationError } from '../../modules/survey/final.compute'
import type { FormDraft } from '../../modules/survey/builder.definition'
import type { SurveyFlowDraft } from '../../modules/survey/flow.definition'

const screen:FormDraft={schemaVersion:2,pages:[{pageKey:'page',title:'研究背景',questions:[
  {itemKey:'role',type:'SINGLE',prompt:'教师',required:true,options:[
    {optionKey:'teacher',label:'教师'},{optionKey:'student',label:'学生'},
  ],rows:[]},
  {itemKey:'years',type:'NUMBER',prompt:'教龄',required:true,
    options:[],rows:[],min:0,max:65,integerOnly:true},
  {itemKey:'head',type:'SINGLE',prompt:'是否班主任',required:true,
    options:[{optionKey:'yes',label:'是'},{optionKey:'no',label:'否'}],rows:[]},
]}]}
const follow:FormDraft={schemaVersion:1,pages:[{pageKey:'followpage',title:'态度',questions:[
  {itemKey:'attitude',type:'SHORT_TEXT',prompt:'AI 态度',required:true,options:[],rows:[]},
]}]}
const unit=(key:string,definition:FormDraft)=>compileFrozenResearchUnit({
  id:key,instrumentKey:key,kind:'FORM',title:key,revision:0,definition,
})
const units=[unit('screen',screen),unit('follow',follow)]
const condition={
  op:'OR' as const,terms:[
    {op:'AND' as const,terms:[
      {op:'EQUALS' as const,field:{source:'ANSWER' as const,instrumentKey:'screen',itemKey:'role'},
        value:'teacher'},
      {op:'GT' as const,field:{source:'ANSWER' as const,instrumentKey:'screen',itemKey:'years'},
        value:5},
    ]},
    {op:'EQUALS' as const,field:{source:'ANSWER' as const,instrumentKey:'screen',itemKey:'head'},
      value:'yes'},
  ],
}
const draft=():SurveyFlowDraft=>({
  schemaVersion:1,embeddedData:[{key:'school_year',source:'STATIC',type:'NUMBER',value:2026}],
  experiment:{experimentKey:'ai_intervention',linkedPolicy:'KEEP_LINKED',groups:[
    {groupKey:'positive',weight:1,materialTitle:'积极材料',materialBody:'可帮助{{school_year}}年课堂'},
    {groupKey:'risk',weight:1,materialTitle:'风险材料',materialBody:'风险材料：请认真阅读'},
    {groupKey:'neutral',weight:1,materialTitle:'中性材料',materialBody:'中性材料：教学研究'},
  ]},
  blocks:[
    {blockKey:'baseline',kind:'INSTRUMENT',instrumentKey:'screen'},
    {blockKey:'attitude',kind:'INSTRUMENT',instrumentKey:'follow',when:condition},
    {blockKey:'closing',kind:'MATERIAL',title:'完成',body:'感谢参与'},
  ],
})
const fixture=(flowDraft=draft())=>{
  const flow=compileSurveyFlow(flowDraft,units,'LINKED_WAVES')
  const snapshot:ResearchFrozenPublication={
    schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:'research',waveId:'t1',
    collectionMode:'LINKED_WAVES',consentVersion:1,linkageNoticeConfirmed:true,
    consentDigest:'digest',runtimeStatus:'SURVEY_FINAL_V1',units,flow,
  }
  const assigned:SurveyFlowAssignment={
    schemaVersion:1,flowDigest:flow.flowDigest,experimentKey:'ai_intervention',
    groupKey:'positive',algorithm:'CRYPTO_RANDOM_INT_V1',assignedAt:'2026-10-11T10:00:00.000Z',
  }
  return {snapshot,flow,assigned}
}
const teacher={role:'teacher',years:8,head:'no'}
const student={role:'student',years:1,head:'no'}
describe('Survey Flow V1 — immutable randomized research execution',()=>{
  it('compiles frozen A/B/C weighted assignment and keeps group keys private in task projection',()=>{
    const {flow,assigned}=fixture()
    expect(flow.flowDigest).toBe(canonicalHash(draft()))
    expect([0,1,2].map(p=>chooseSurveyGroup(flow,()=>p))).toEqual(['positive','risk','neutral'])
    expect(()=>chooseSurveyGroup(flow,()=>3)).toThrow()
    const projected=buildSurveyFlowPublicProjection(flow,assigned)
    expect(projected.selectedMaterial?.body).toContain('2026')
    const json=JSON.stringify(projected)
    expect(json).not.toContain('groupKey')
    expect(json).not.toContain('linkedPolicy')
  })
  it('uses OR(AND(role teacher,years>5),head yes) and exports exact skipped-tool reasons',()=>{
    const {snapshot,assigned}=fixture()
    const result=computeSurveyFinal(snapshot,{
      screen:teacher,follow:{attitude:'认为能辅助教学'},
    },assigned,['assigned_material','baseline','attitude','closing'])
    expect(result.executionTrace?.shownBlocks).toEqual([
      'assigned_material','baseline','attitude','closing'])
    expect(result.units[1].rawAnswers).toEqual({attitude:'认为能辅助教学'})
    expect(result.definitionDigest).toBe(canonicalHash(snapshot))
    const skipped=computeSurveyFinal(snapshot,{screen:student},
      assigned,['assigned_material','baseline','closing'])
    expect(skipped.units[1].notExecuted).toBe(true)
    expect(skipped.units[1].missing).toContainEqual({itemKey:'attitude',reason:'NOT_SHOWN'})
    expect(skipped.units[1].privateScoring).toBeNull()
    expect(skipped.executionTrace?.skippedInstrumentKeys).toEqual(['follow'])
    const head=computeSurveyFinal(snapshot,{screen:{role:'student',years:1,head:'yes'},
      follow:{attitude:'班主任'}},assigned,['assigned_material','baseline','attitude','closing'])
    expect(head.units[1].notExecuted).toBeUndefined()
  })
  it('fails closed on hidden answer injection, presentation spoofing and missing executed unit',()=>{
    const {snapshot,assigned}=fixture()
    expect(()=>computeSurveyFinal(snapshot,{screen:student,follow:{attitude:'注入'}},
      assigned,['assigned_material','baseline','closing'])).toThrow(SurveyFinalValidationError)
    expect(()=>computeSurveyFinal(snapshot,{screen:teacher,follow:{attitude:'内容'}},
      assigned,['assigned_material','baseline','closing'])).toThrow(/展示路径/)
    expect(()=>computeSurveyFinal(snapshot,{screen:teacher},
      assigned,['assigned_material','baseline','attitude','closing'])).toThrow(/缺少/)
  })
  it('separates SCREEN_OUT from FINAL; screening route never scores an entire Wave',()=>{
    const d=draft()
    d.blocks.splice(1,0,{
      blockKey:'screen_out',kind:'END',termination:'SCREEN_OUT',
      when:{op:'EQUALS',field:{source:'ANSWER',instrumentKey:'screen',itemKey:'role'},value:'student'},
    })
    const {snapshot,assigned}=fixture(d)
    expect(()=>computeSurveyFinal(snapshot,{screen:student},assigned,
      ['assigned_material','baseline','screen_out'],'FINAL')).toThrow(/筛除/)
    const outcome=computeSurveyFinal(snapshot,{screen:student},assigned,
      ['assigned_material','baseline','screen_out'],'SCREEN_OUT')
    expect(outcome.executionTrace?.termination).toBe('SCREEN_OUT')
    expect(outcome.units[1].notExecuted).toBe(true)
    expect(()=>computeSurveyFinal(snapshot,{screen:teacher,follow:{attitude:'通过'}},
      assigned,['assigned_material','baseline','attitude','closing'],'SCREEN_OUT')).toThrow()
  })
  it('prevents recursively nested untrusted Wave input from reaching Zod without a budget',()=>{
    const nested=draft()
    let condition:unknown={op:'EQUALS',
      field:{source:'EMBEDDED',key:'year'},value:2026}
    for(let i=0;i<40;i++)condition={op:'NOT',term:condition}
    nested.blocks[1].when=condition as NonNullable<SurveyFlowDraft['blocks'][number]['when']>
    expect(()=>parseSurveyFlowDraft(nested)).toThrow(SurveyFlowError)
    expect(()=>compileSurveyFlow(nested,units,'LINKED_WAVES')).toThrow(SurveyFlowError)
  })
  it('refuses future, circular, wrong-typed, deeply nested and unauthorized Flow rules',()=>{
    const notEarlier=draft()
    notEarlier.blocks[0].when=condition
    expect(()=>compileSurveyFlow(notEarlier,units,'LINKED_WAVES'))
      .toThrow(SurveyFlowError)
    const wrongType=draft()
    wrongType.blocks[1].when={op:'INCLUDES',
      field:{source:'ANSWER',instrumentKey:'screen',itemKey:'years'},value:'teacher'}
    expect(()=>compileSurveyFlow(wrongType,units,'LINKED_WAVES')).toThrow(SurveyFlowError)
    expect(()=>compileSurveyFlow(draft(),units,'SINGLE_UNLINKED')).toThrow(SurveyFlowError)
    const deep=draft()
    let recursive:SurveyFlowDraft['blocks'][number]['when']=condition
    for(let i=0;i<9;i++)recursive={op:'NOT',term:recursive!}
    deep.blocks[1].when=recursive
    expect(()=>compileSurveyFlow(deep,units,'LINKED_WAVES')).toThrow(SurveyFlowError)
    const wrongGroup=draft();wrongGroup.experiment!.groups[1].groupKey='positive'
    expect(()=>compileSurveyFlow(wrongGroup,units,'LINKED_WAVES')).toThrow(SurveyFlowError)
    const badText=draft();badText.blocks[2].body='{{private_secret}}'
    expect(()=>compileSurveyFlow(badText,units,'LINKED_WAVES')).toThrow(SurveyFlowError)
  })
  it('treats absence, null and negative numeric comparisons deterministically',()=>{
    expect(evaluateFlowCondition({op:'IS_MISSING',
      field:{source:'EMBEDDED',key:'missing'}},{},{})).toBe(true)
    expect(evaluateFlowCondition({op:'NOT',term:{op:'GT',
      field:{source:'EMBEDDED',key:'sample'},value:5}}, {},{sample:3})).toBe(true)
  })
})
