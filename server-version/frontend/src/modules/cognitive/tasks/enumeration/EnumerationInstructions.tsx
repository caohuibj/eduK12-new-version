import React from 'react'
import type {EnumerationConfig} from './generated/protocol'

/** Teaching only; these examples never become stimulus records or extra practice exposures. */
export function EnumerationInstructions({en,config,headingLevel=1}:{en:boolean;config:EnumerationConfig;headingLevel?:1|2}){
 const Heading=headingLevel===1?'h1':'h2',research=config.profile==='research'
 return <div className="enum-instructions"><Heading>{en?'How many dots did you see?':'刚才有几个点？'}</Heading>
  <p>{en?'Keep looking at the centre. White dots briefly appear on a mid-grey background, followed by a black-and-white pattern. Report how many dots you saw.':'请注视画面中央。白色圆点会在中灰背景上短暂出现，随后画面变成黑白纹理。请报告刚才看到的点数。'}</p>
  <p>{en?'Wait for the pattern to disappear and the slider to become available. Use the integer slider from 1 to 15, then confirm once. Its initial value changes each trial; it is not a hint. You can adjust before confirming.':'等黑白纹理消失、滑杆可以操作后，拖动1–15整数滑杆，再点击一次确认。每轮初值随机变化，它不是答案提示；确认前可以调整。'}</p>
  <p>{en?'Example 1: you saw 3 dots. Set the slider to 3 and confirm.':'例1：刚才看到3个点，就把滑杆调到3，再确认。'}</p>
  <p>{en?'Example 2: the slider starts at 8, but you saw 4 dots. Change it to 4 before confirming. The starting number is not the answer.':'例2：滑杆初值是8，但你看到4个点，应先调到4再确认，不能把初值当答案。'}</p>
  <p>{en?`First complete 3 separate practice trials and compare the actual dot count with your report. The ${research?'research':'practical'} version has ${config.totalTrials} formal trials without correctness feedback.`:`先完成3次独立练习，对照实际点数与自己的报告数。本次${research?'文献对照版':'体验版'}共${config.totalTrials}轮正式作答，正式阶段不提示对错。`}</p>
  <p>{en?`The existing design estimate is ${research?'6–12':'2–5'} minutes. This is a planning range, not a measured time limit.`:`现有设计估计${research?'6–12':'2–5'}分钟，这是规划范围，不是实测或答题截止。`}</p>
  <details><summary>{en?'Keyboard and screen setup':'键盘操作与屏幕设置'}</summary><p>{en?'Arrow keys adjust the slider; Home and End select 1 and 15. Tab to Confirm and press Enter or Space. Keep the screen and viewing distance consistent with your setup. This internal review version still needs further validation.':'方向键调整滑杆，Home/End选择1/15；Tab切到确认后按回车或空格。请保持设置时的屏幕和观看距离。本内部审阅版仍待进一步验证。'}</p></details>
  <p>{en?`Finish all ${config.totalTrials} formal trials, then wait for submission confirmation. Practice is separate. If saving is not confirmed, keep this page open and retry saving the same records; do not replay the dots.`:`完成${config.totalTrials}轮正式作答后，等待提交成功的确认，练习另计。保存尚未确认时，请保留本页并重试保存同一份记录，不重新呈现点阵。`}</p>
  <p className="enum-notice">{en?'This version is for internal review only, not formal assessment. It describes this attempt only; physical timing and population validity are unverified.':'仅供内部审阅，暂不用于正式施测；仅描述本次作答，物理时序与人群效度尚未验证。'}</p>
 </div>
}
