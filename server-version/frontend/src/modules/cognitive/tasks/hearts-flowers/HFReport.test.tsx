import React from 'react'
import {afterEach,describe,expect,it} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import {HFReport} from './HFReport'
import {HF_IDENTITY} from './generated/protocol'
import {HF_GROUPS,HF_INPUTS,hfPlanned,hfDifferences,type GroupKey,type HFGroup,type HFReport as Report} from './generated/report'
type Counts=Partial<Record<GroupKey,[number,number,number]>>
function reportFor(rows:Counts):Report{
 const planned=hfPlanned('experience'),groups=Object.fromEntries(HF_GROUPS.map(key=>{
  const [valid,correct,missed]=rows[key]??[0,0,0],answered=valid-missed
  const inputs=Object.fromEntries(HF_INPUTS.map(input=>[input,input==='touch'?{answered,correct,correctRTCount:correct,sumCorrectMs:correct*300,meanCorrectMs:correct?300:null}:{answered:0,correct:0,correctRTCount:0,sumCorrectMs:0,meanCorrectMs:null}])) as HFGroup['inputs']
  return [key,{planned:planned[key],valid,correct,missed,answered,accuracy:valid?correct/valid:null,inputs}]
 })) as Record<GroupKey,HFGroup>,valid=groups.heartOnly.valid+groups.flowerOnly.valid+groups.mixed.valid
 return {...HF_IDENTITY,reportDefinitionVersion:'0.1.0',presentationVersion:'0.1.0',configHash:'a'.repeat(64),protocolSignature:'b'.repeat(64),profile:'experience',state:valid===0?'invalid':valid===32?'interpretable':'limited',planned:32,received:valid,valid,interrupted:false,groups:valid?groups:null,differences:valid?hfDifferences(groups):null}
}
function firstScreen(){const copy=screen.getByRole('article').cloneNode(true) as HTMLElement;copy.querySelectorAll('details').forEach(node=>node.remove());return copy.textContent??''}
afterEach(cleanup)
describe('Hearts and flowers report reading',()=>{
 it('describes actual counts in Chinese and English, keeping technical definitions collapsed',()=>{
  const partial=reportFor({heartOnly:[2,2,0],flowerOnly:[2,0,1],mixed:[3,1,1],mixedSwitch:[1,0,1],mixedRepeat:[1,0,0],mixedFirst:[1,1,0]})
  const {rerender}=render(<HFReport report={partial}/> )
  expect(screen.getByText('本次记录了7题的结果：答对3题，答错2题，2题未回应。')).toBeTruthy()
  expect(screen.getByText('心同侧共2题，答对2题；花对侧共2题，答对0题；混合规则共3题，答对1题。')).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain('未完成的题目不按答错处理')
  expect(firstScreen()).not.toMatch(/完整回应窗口|实际分母|null|n=|\[图形出现/)
  const details=screen.getByText('查看用时、计算方式与研究说明').closest('details')!
  expect(details.open).toBe(false);expect(details.textContent).toContain('[图形出现，出现＋时限)')
  rerender(<HFReport report={partial} language="en"/> )
  expect(screen.getByText('This attempt recorded results for 7 trials: 3 correct, 2 incorrect, and 2 without a response.')).toBeTruthy()
  expect(screen.getByText('Hearts, same side: 2 correct out of 2 trials; Flowers, opposite side: 0 correct out of 2 trials; Mixed rules: 1 correct out of 3 trials.')).toBeTruthy()
  expect(firstScreen()).not.toMatch(/closed windows|null|n=|\[onset/)
  const planned=hfPlanned('experience'),full=reportFor(Object.fromEntries(HF_GROUPS.map(key=>[key,[planned[key],planned[key],0]])) as Counts)
  rerender(<HFReport report={full}/> )
  expect(screen.getByText('本次记录了32题的结果：答对32题，答错0题，0题未回应。')).toBeTruthy();expect(screen.queryByRole('status')).toBeNull()
 })
 it('distinguishes real zero and unanswered trials from absent conditions, and keeps invalid or malformed reports behind the gate',()=>{
  const {rerender}=render(<HFReport report={reportFor({heartOnly:[2,0,2]})}/> )
  expect(screen.getByText('本次记录了2题的结果：答对0题，答错0题，2题未回应。')).toBeTruthy()
  expect(screen.getByText('心同侧共2题，答对0题；花对侧尚无可用记录；混合规则尚无可用记录。')).toBeTruthy()
  expect(screen.getAllByText('尚无可用记录')).toHaveLength(2)
  const planned=hfPlanned('experience'),zero=reportFor(Object.fromEntries(HF_GROUPS.map(key=>[key,[planned[key],0,planned[key]]])) as Counts)
  rerender(<HFReport report={zero}/> )
  expect(screen.getByText('本次记录了32题的结果：答对0题，答错0题，32题未回应。')).toBeTruthy();expect(screen.getByRole('table')).toBeTruthy()
  expect(screen.getAllByText('0.0%')).toHaveLength(3)
  const empty=reportFor({})
  for(const language of ['zh','en'] as const){rerender(<HFReport report={empty} language={language}/> );expect(screen.queryByRole('table')).toBeNull();expect(screen.queryByRole('group')).toBeNull();expect(firstScreen()).not.toMatch(/本次记录了0|recorded results for 0/)}
  rerender(<HFReport report={{...zero,valid:31}}/> )
  expect(screen.getByRole('alert').textContent).toBe('未能核对已保存报告身份。');expect(screen.queryByRole('table')).toBeNull()
 })
})
