import {describe,it,expect} from 'vitest'
import {scoreSelectionSummary} from './scoreSummary'
describe('shared authoring score estimate',()=>{
  const items=[{key:'a',scores:[-2,0,3]},{key:'b',scores:[1,5]}]
  it('uses the actual selected sets and aggregation without inventing a norm',()=>{
    expect(scoreSelectionSummary({items,selected:[{key:'a'},{key:'b'}],aggregation:'sum'})).toContain('预计范围 -1.0–8.0')
    expect(scoreSelectionSummary({items,selected:[{key:'a'},{key:'b'}],aggregation:'mean'})).toContain('预计范围 -0.5–4.0')
  })
  it('names omitted items and respects existing sum weights',()=>{
    const summary=scoreSelectionSummary({items,selected:[{key:'a',weight:2}],aggregation:'sum'})
    expect(summary).toContain('已纳入 1/2 题');expect(summary).toContain('-4.0–6.0');expect(summary).toContain('未纳入：b')
  })
  it('does not report a numeric range for incomplete or invalid selections',()=>{
    for(const selected of [[],[{key:'missing'}],[{key:'a',weight:-1}]])expect(scoreSelectionSummary({items,selected,aggregation:'sum'})).toContain('请先选题并完成选项计分')
  })
})
