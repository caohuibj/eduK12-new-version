import React from 'react'
import type {Config,Language} from './generated/protocol'
export const LOCATION_NAMES={zh:['左上','右上','左下','右下'],en:['upper left','upper right','lower left','lower right']} as const
export function Instructions({config:c,language}:{config:Config;language:Language}){
  const en=language==='en'
  return <section><h1>{en?'See the star, tap its square':'看见 ★，点它所在的方格'}</h1>
    <p>{en?'This activity looks at how performance changes during continuous tapping. There are four fixed squares. A star appears in one square at a time. When you see it, tap that square as quickly and accurately as you can.':'这项活动想看看连续点选时表现怎样变化。屏幕上有四个固定方格，每次一格会出现 ★。看清后尽快点 ★ 所在的方格，尽量点准。'}</p>
    <div className="srl-example" aria-label={en?'Example: star in upper-right square':'示例：★ 在右上格'}><div/><div className="srl-lit">★</div><div/><div/></div>
    <p>{en?'For example, if the star is in the upper-right square, tap the upper-right square.':'比如 ★ 在右上格，就点右上格。'}</p>
    <p>{en?'An incorrect tap is recorded and the star stays there. Tap its square to continue. After a correct tap there is a short blank interval before the next target. Please do not guess ahead. Use the same hand and a comfortable posture. You do not have to recite an order.':'点错时也会记录，★ 会留在原位；再点到它，才会进入下一次。点对后会短暂空一下，再出现下一个目标。不要提前猜，请用同一只手、保持舒服的姿势。你不用复述顺序。'}</p>
    <p>{en?'First there are four simple practice trials, one at each location. All four first taps must be correct. If practice is failed or incomplete, review these full instructions and the example before another round. There are at most three practice rounds; you may also stop. Practice does not count toward formal results.':'先做四次简单练习，四个位置各一次；4/4 首答点准才继续。未通过或未完成时，先重看全部说明和例子，再练，最多三轮，也可以结束。练习不计入正式表现。'}</p>
    <p>{en?`The ${c.profile} profile has ${c.runs} runs of 84 trials (${c.totalTrials} in total), estimated at ${c.profile==='research'?'9–14':'4–7'} minutes including instructions and practice. You can rest between runs or stop at any time. Stopping does not mark unperformed trials as wrong. Times are estimates, not a deadline.`:`${c.profile==='research'?'科研版':'体验版'} ${c.runs} 轮，每轮 84 次，共 ${c.totalTrials} 次；含说明和练习约 ${c.profile==='research'?'9–14':'4–7'} 分钟，均为估算而非截止时间。每轮后可休息，随时可以结束；未执行的部分不会算成做错。`}</p>
    <p>{en?'Touch input only. Movement, posture, familiarity, attention and fatigue affect this activity. We describe this session only; it cannot determine intelligence, implicit-learning ability or a diagnosis.':'请用触屏操作。动作、姿势、熟悉程度、注意和疲劳都会影响本次活动。这里只描述本次记录，不能据此判断智力、隐性学习能力或作诊断。'}</p>
  </section>
}
