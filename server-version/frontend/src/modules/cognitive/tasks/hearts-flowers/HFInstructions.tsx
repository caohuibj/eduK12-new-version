import React from 'react'
import {correctSide,type HFConfig} from './generated/protocol'
import {HFShape} from './HFShape'
export const hfModeLabel=(mode:string,en:boolean)=>mode==='heartOnly'?(en?'Hearts: same side':'心：按同一边'):mode==='flowerOnly'?(en?'Flowers: opposite side':'花：按另一边'):(en?'Mixed: look at the shape to choose the rule':'混合：看图形选择规则')
export function HFInstructions({language,config}:{language:'zh'|'en';config:HFConfig}){
 const en=language==='en'
 return <section aria-label={en?'Instructions and examples':'操作说明与例子'}>
  <h1>{en?'Look at the shape, then its side':'先看图形，再看它在哪一边'}</h1>
  <h2>{en?'What to look at':'看什么'}</h2>
  <p>{en?'A heart means press the same side. A flower means press the opposite side. In the mixed block, the shape tells you which rule to use.':'心要按同一边；花要按另一边。混合任务中，每次先看图形，再选择对应规则。'}</p>
  <div className="hf-examples">{(['heart','flower'] as const).flatMap(shape=>(['left','right'] as const).map(side=><div className="hf-example" key={shape+side}><HFShape shape={shape} size={40}/><span>{en?(shape==='heart'?'Heart':'Flower'):(shape==='heart'?'心':'花')}{en?(side==='left'?' on left':' on right'):(side==='left'?'在左':'在右')} → {en?'press ':'按'}{correctSide(shape,side)==='left'?(en?'left':'左'):(en?'right':'右')}</span></div>))}</div>

  <h2>{en?'How to respond':'怎么答'}</h2>
  <p>{en?'Use the fixed LEFT and RIGHT buttons with touch, mouse or pen, or use the ← and → keys. A focused button also accepts Space or Enter.':'可用触屏、鼠标或笔按固定的左、右大按钮，也可按键盘←、→。聚焦按钮后也可按空格或回车。'}</p>
  <p>{en?'Lift your finger or release the key before a new response. Do not tap the shape.':'下一次回应前请松开按键或抬起手指；不用点图形。'}</p>
  <p>{en?'In the formal task, respond as accurately and promptly as you can. The shape disappears after your first response or after 2.5 seconds, followed by 1 second of blank screen. Formal trials do not show whether an answer was correct.':'正式作答时，请尽量又准又及时地回应。图形在第一次回应后或最多2.5秒时移除，随后空屏1秒；正式作答不显示对错。'}</p>

  <h2>{en?'Practice':'练习'}</h2>
  <p>{en?'Each practice round has 8 trials: 2 hearts, 2 flowers and 4 mixed. You have up to 3.5 seconds to respond, with an explanation after each trial.':'每组练习8题：2心、2花、4混合。每题最多有3.5秒回应，结束后会停下来解释。'}</p>
  <p>{en?'At least 7 correct out of 8 lets you continue. If a round is unfinished or not passed, read all instructions and examples again before a new round. You can try up to 3 rounds.':'至少答对7题可继续。未完成或未通过时，要先重新阅读全部说明和例子，再练新的一组，最多3组。'}</p>
  <p>{en?'You may ask an adult or caregiver to read these instructions aloud; the participant should make the choices.':'可以请大人或照护者朗读说明；实际选择请由作答者自己完成。'}</p>

  <h2>{en?'Finish and save':'完成与保存'}</h2>
  <p>{en?`Formal task: ${config.totalTrials} trials (${config.heartTrials} hearts, ${config.flowerTrials} flowers, ${config.mixedTrials} mixed). Practice is separate.`:`正式作答共${config.totalTrials}题（心${config.heartTrials}次、花${config.flowerTrials}次、混合${config.mixedTrials}次），练习另计。`}</p>
  <p>{en?`Estimated total including teaching/practice: ${config.profile==='research'?'6–9':'4–6'} minutes (design estimate, not measured).`:`含教学/练习预计${config.profile==='research'?'6–9':'4–6'}分钟（设计估计，非实测）。`}</p>
  <p>{en?'Finish all formal trials and wait for the saved-record confirmation. If you end early, the unfinished part stays missing.':'做完全部正式任务后，等待记录保存成功的确认。提前结束时，未完成部分保留缺失。'}</p>
  <p>{en?'Keep this page open while saving. Refreshing does not resume exposure. If saving fails, retry the same record; it will not replay a trial.':'保存时请保留本页。刷新后不继续呈现；保存失败时只重试原记录，不重放题目。'}</p>
 </section>
}
