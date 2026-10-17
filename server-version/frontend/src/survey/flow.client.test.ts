import { describe,expect,it } from 'vitest'
import { evaluateClientFlowCondition,resolveClientSurveyFlow,previewSurveyFlow,
  type PublicFlow,type FlowPublicUnit,type FlowDraft } from './flow.client'
const flow:PublicFlow={
  schemaVersion:1,flowDigest:'frozen-digest',
  selectedMaterial:{blockKey:'assigned_material',title:'教学实验',body:'积极材料'},
  embeddedData:[{key:'year',type:'NUMBER',value:2026}],
  blocks:[
    {blockKey:'screen',kind:'INSTRUMENT',instrumentKey:'form'},
    {blockKey:'detail',kind:'INSTRUMENT',instrumentKey:'detail',
      when:{op:'OR',terms:[
        {op:'AND',terms:[
          {op:'EQUALS',field:{source:'ANSWER',instrumentKey:'form',itemKey:'role'},value:'teacher'},
          {op:'GT',field:{source:'ANSWER',instrumentKey:'form',itemKey:'years'},value:5},
        ]},
        {op:'EQUALS',field:{source:'ANSWER',instrumentKey:'form',itemKey:'head'},value:'yes'},
      ]}},
    {blockKey:'closing',kind:'MATERIAL',title:'完成',body:'感谢'},
  ],
}
const units:FlowPublicUnit[]=[
  {kind:'FORM',instrumentKey:'form',pages:[{questions:[
    {itemKey:'role'},{itemKey:'years'},{itemKey:'head'},
    {itemKey:'dependent',displayIf:{itemKey:'role',operator:'EQUALS',optionKey:'teacher'}},
  ]}]},
  {kind:'FORM',instrumentKey:'detail',pages:[{questions:[{itemKey:'comment'}]}]},
]
describe('client Survey Flow route preview mirrors frozen server projection',()=>{
  it('shows assigned stimulus without disclosing internal group key',()=>{
    const resolved=resolveClientSurveyFlow(flow,units,{form:{
      role:'teacher',years:8,head:'no',
    },detail:{comment:'AI'}})
    expect(resolved.shownBlocks).toEqual(['assigned_material','screen','detail','closing'])
    expect(resolved.visibleUnitKeys).toEqual(['form','detail'])
  })
  it('omits a skipped instrument instead of submitting hidden stale answers',()=>{
    const resolved=resolveClientSurveyFlow(flow,units,{
      form:{role:'student',years:1,head:'no',dependent:'tampered'},
      detail:{comment:'stale'},
    })
    expect(resolved.shownBlocks).toEqual(['assigned_material','screen','closing'])
    expect(resolved.visibleUnitKeys).toEqual(['form'])
  })
  it('handles NOT/missing and numeric comparisons with typed values',()=>{
    expect(evaluateClientFlowCondition({op:'NOT',term:{op:'EQUALS',
      field:{source:'EMBEDDED',key:'year'},value:2025}}, {},{year:2026})).toBe(true)
    expect(evaluateClientFlowCondition({op:'IS_MISSING',
      field:{source:'ANSWER',instrumentKey:'form',itemKey:'missing'}},{form:{}},{})).toBe(true)
    expect(evaluateClientFlowCondition({op:'INCLUDES',
      field:{source:'ANSWER',instrumentKey:'form',itemKey:'tags'},value:'yes'},
      {form:{tags:['no','yes']}},{})).toBe(true)
  })
})

describe('questionnaire variant researcher projection',()=>{
  const draft:FlowDraft={schemaVersion:1,embeddedData:[],experiment:{
    mode:'QUESTIONNAIRE_VARIANTS',experimentKey:'exp',linkedPolicy:'RERANDOMIZE',groups:[
      {groupKey:'a',variantLabel:'A',weight:1,instrumentKeys:['shared','a'],materialTitle:'',materialBody:''},
      {groupKey:'b',variantLabel:'B',weight:3,instrumentKeys:['shared','b'],materialTitle:'B标题',materialBody:'B正文'},
    ]},blocks:[
      {blockKey:'shared',kind:'INSTRUMENT',instrumentKey:'shared'},
      {blockKey:'intro',kind:'MATERIAL',body:'共同说明'},
      {blockKey:'a',kind:'INSTRUMENT',instrumentKey:'a'},
      {blockKey:'b',kind:'INSTRUMENT',instrumentKey:'b'},
    ]}
  it('retains common order and shared tools but excludes another arm and empty assigned materials',()=>{
    const a=previewSurveyFlow(draft,'a'),b=previewSurveyFlow(draft,'b')
    expect(a.blocks.map(x=>x.blockKey)).toEqual(['shared','intro','a'])
    expect(a.selectedMaterial).toBeUndefined()
    expect(b.blocks.map(x=>x.blockKey)).toEqual(['shared','intro','b'])
    expect(b.selectedMaterial?.body).toBe('B正文')
    expect(draft.blocks).toHaveLength(4)
  })
  it('preserves all instruments for ordinary material experiments',()=>{
    const legacy=previewSurveyFlow({...draft,experiment:{...draft.experiment!,mode:undefined}},'a')
    expect(legacy.blocks).toHaveLength(4)
    expect(legacy.selectedMaterial).toBeDefined()
  })
})
