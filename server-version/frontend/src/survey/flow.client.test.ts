import { describe,expect,it } from 'vitest'
import { evaluateClientFlowCondition,resolveClientSurveyFlow,
  type PublicFlow,type FlowPublicUnit } from './flow.client'
const flow:PublicFlow={
  schemaVersion:1,flowDigest:'frozen-digest',planDigest:'assigned-plan',
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
