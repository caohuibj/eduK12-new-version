import React from 'react'
import {afterEach,describe,expect,it} from 'vitest'
import {cleanup,render,screen,within} from '@testing-library/react'
import {hfConfig} from './generated/protocol'
import {HFInstructions} from './HFInstructions'

afterEach(cleanup)

const cases=[
 ['zh','experience',8,8,16,32,'4–6'],
 ['en','experience',8,8,16,32,'4–6'],
 ['zh','research',12,12,33,57,'6–9'],
 ['en','research',12,12,33,57,'6–9'],
] as const

describe('Hearts and flowers instruction reading',()=>{
 it.each(cases)('keeps the four teaching sections and frozen details for %s %s',(language,profile,hearts,flowers,mixed,total,minutes)=>{
  render(<HFInstructions language={language} config={hfConfig(profile)}/>)
  const en=language==='en',instructions=screen.getByRole('region',{name:en?'Instructions and examples':'操作说明与例子'}),text=instructions.textContent!
  expect(within(instructions).getAllByRole('heading',{level:2}).map(h=>h.textContent)).toEqual(en?['What to look at','How to respond','Practice','Finish and save']:['看什么','怎么答','练习','完成与保存'])
  const examples=[...instructions.querySelectorAll('.hf-example')]
  expect(examples.map(example=>example.textContent)).toEqual(en?['Heart on left → press left','Heart on right → press right','Flower on left → press right','Flower on right → press left']:['心在左 → 按左','心在右 → 按右','花在左 → 按右','花在右 → 按左'])
  expect(examples).toHaveLength(4)
  for(const example of examples){expect(example.querySelector('svg')?.getAttribute('width')).toBe('40');expect(example.querySelector('svg')?.getAttribute('height')).toBe('40')}
  if(en){
   expect(text).toContain('A heart means press the same side. A flower means press the opposite side. In the mixed block, the shape tells you which rule to use.')
   expect(text).toContain('touch, mouse or pen, or use the ← and → keys. A focused button also accepts Space or Enter.')
   expect(text).toContain('Lift your finger or release the key before a new response. Do not tap the shape.')
   expect(text).toContain('The shape disappears after your first response or after 2.5 seconds, followed by 1 second of blank screen. Formal trials do not show whether an answer was correct.')
   expect(text).toContain('8 trials: 2 hearts, 2 flowers and 4 mixed. You have up to 3.5 seconds to respond, with an explanation after each trial.')
   expect(text).toContain('At least 7 correct out of 8 lets you continue. If a round is unfinished or not passed, read all instructions and examples again before a new round. You can try up to 3 rounds.')
   expect(text).toContain('the participant should make the choices.')
   expect(text).toContain(`Formal task: ${total} trials (${hearts} hearts, ${flowers} flowers, ${mixed} mixed). Practice is separate.`)
   expect(text).toContain(`${minutes} minutes (design estimate, not measured).`)
   expect(text).toContain('Finish all formal trials and wait for the saved-record confirmation. If you end early, the unfinished part stays missing.')
   expect(text).toContain('Keep this page open while saving. Refreshing does not resume exposure. If saving fails, retry the same record; it will not replay a trial.')
   expect(text.match(/If saving fails/g)).toHaveLength(1)
  }else{
   expect(text).toContain('心要按同一边；花要按另一边。混合任务中，每次先看图形，再选择对应规则。')
   expect(text).toContain('触屏、鼠标或笔按固定的左、右大按钮，也可按键盘←、→。聚焦按钮后也可按空格或回车。')
   expect(text).toContain('下一次回应前请松开按键或抬起手指；不用点图形。')
   expect(text).toContain('图形在第一次回应后或最多2.5秒时移除，随后空屏1秒；正式作答不显示对错。')
   expect(text).toContain('每组练习8题：2心、2花、4混合。每题最多有3.5秒回应，结束后会停下来解释。')
   expect(text).toContain('至少答对7题可继续。未完成或未通过时，要先重新阅读全部说明和例子，再练新的一组，最多3组。')
   expect(text).toContain('实际选择请由作答者自己完成。')
   expect(text).toContain(`正式作答共${total}题（心${hearts}次、花${flowers}次、混合${mixed}次），练习另计。`)
   expect(text).toContain(`${minutes}分钟（设计估计，非实测）。`)
   expect(text).toContain('做完全部正式任务后，等待记录保存成功的确认。提前结束时，未完成部分保留缺失。')
   expect(text).toContain('保存时请保留本页。刷新后不继续呈现；保存失败时只重试原记录，不重放题目。')
   expect(text.match(/保存失败/g)).toHaveLength(1)
  }
 })
})
