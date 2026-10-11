import { expandedSurveySjtOptions,resolveSurveySjtAnswer } from '../../modules/survey/sjt-selection'
import { describe,it,expect } from 'vitest'
import type { SjtDraft } from '../../modules/survey/builder.definition'

describe('Research-only SJT option combination compiler',()=>{
  const question=():SjtDraft['questions'][number]=>({
    questionKey:'discussion',prompt:'Choose responses',
    responseType:'MULTIPLE',aggregationPolicy:'SUM',minSelections:2,maxSelections:2,
    options:[
      {optionKey:'first',label:'先协商',contributions:{effort:2,support:0}},
      {optionKey:'second',label:'邀请同伴',contributions:{effort:1,support:2}},
      {optionKey:'third',label:'冷静整理',contributions:{effort:3,support:1}},
    ],
  })
  it('derives predictable unique subset keys and sums controlled multi-construct contributions',()=>{
    const first=expandedSurveySjtOptions(question()),again=expandedSurveySjtOptions(question())
    expect(first).toEqual(again)
    expect(first).toHaveLength(3)
    expect(new Set(first.map(x=>x.optionKey)).size).toBe(3)
    const selection=resolveSurveySjtAnswer(question(),['third','first'])
    expect(selection.frozenResponse).toEqual(['first','third'])
    const combined=first.find(o=>o.optionKey===selection.scorerOptionKey)
    expect(combined?.contributions).toEqual({effort:5,support:1})
    const averaged=question()
    averaged.aggregationPolicy='MEAN'
    const meanChoice=expandedSurveySjtOptions(averaged)
      .find(o=>o.optionKey===selection.scorerOptionKey)
    expect(meanChoice?.contributions).toEqual({effort:2.5,support:0.5})
    const unspecified=question()
    unspecified.aggregationPolicy=undefined
    expect(()=>expandedSurveySjtOptions(unspecified)).toThrow(/SUM|MEAN/)
  })
  it('never maps forged, duplicated or oversized answer lists to a scored choice',()=>{
    for(const answer of [[],['first'],['first','first'],
      ['first','wrong'],['first','second','third'],'first']){
      expect(()=>resolveSurveySjtAnswer(question(),answer)).toThrow()
    }
  })
})
