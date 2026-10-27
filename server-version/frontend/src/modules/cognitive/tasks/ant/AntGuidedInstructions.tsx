import React from 'react'
import type { AntGuidedConfig } from './generated/protocol'

/** The same complete instructions are mounted before initial practice and every permitted retry. */
export function AntGuidedInstructions({config,en=false,leftKey,rightKey}:{config:AntGuidedConfig;en?:boolean;leftKey?:string;rightKey?:string}) {
  const examples=[
    {arrows:'← ← → ← ←',direction:en?'right':'向右',note:en?'The middle arrow points right, even though its neighbors point left.':'中间箭头朝右，即使旁边都朝左，也要选向右。'},
    {arrows:'→ → ← → →',direction:en?'left':'向左',note:en?'The middle arrow points left. Ignore its neighbors.':'中间箭头朝左，忽略旁边朝右的箭头。'},
    {arrows:'→ → → → →',direction:en?'right':'向右',note:en?'When all arrows agree, still judge only the middle one.':'全部朝向相同时，也只判断中间那个。'},
    {arrows:'→',direction:en?'right':'向右',note:en?'With no neighboring arrows, the response rule stays the same.':'没有两侧箭头时，回答规则仍然一样。'},
  ]
  return <section aria-label={en?'Task instructions and examples':'操作说明与例子'}>
    <p>{en?'Keep looking at the central +. A brief cue may appear at the center, above and below, or at the next target location; sometimes there is no cue. Wait for the arrows before responding.':'请看屏幕中央的“＋”。短暂提示可能出现在中央、上下两个位置，或接下来箭头出现的位置；也可能没有提示。先等待，看到箭头后再回答。'}</p>
    <h2>{en?'Judge the middle arrow only':'只判断中间箭头朝向'}</h2>
    <p>{en?'Arrows can appear above or below the center. Their screen position never determines your answer: a left-pointing middle arrow always means left.':'箭头可能出现在中央上方或下方，出现位置不决定答案：无论在哪，中间箭头朝左就选向左，朝右就选向右。'}</p>
    {examples.map((example,i)=><div className="ant-panel" key={example.arrows}>
      <p className="ant-big" aria-hidden="true" style={{textAlign:'center',color:'#000'}}>{example.arrows}</p>
      <p>{en?`Example ${i+1}: choose ${example.direction}.`:`例${i+1}：选择“${example.direction}”。`}{example.note}</p>
    </div>)}
    <h2>{en?'How to respond':'怎样操作'}</h2>
    <p>{en?'Tap or click the fixed left/right response areas below the display. Respond once after the arrows appear, then release. Aim to be both accurate and prompt; use the same input method throughout.':'用手指轻触或鼠标点击画面下方固定的左右回应区。箭头出现后回应一次，并松开。尽量既准确又及时，全程使用同一种操作方式。'}</p>
    <p>{en?'Keyboard alternative':'键盘也可使用'}：{leftKey??'ArrowLeft'} / {rightKey??'ArrowRight'}。{en?'Do not hold a key down or respond to the cue itself.':'不要长按，也不要在只有提示、尚未出现箭头时作答。'}</p>
    <h2>{en?'Practice first, then the task':'先练习，再正式作答'}</h2>
    <p>{en?'Each practice round has 8 trials and requires at least 7 correct responses. Practice gives you 3.5 seconds to respond, pauses after each trial, and explains the answer. Wrong answers and missed response windows count as incorrect.':'每轮练习8题，至少答对7题后进入正式作答。练习给你3.5秒回答，每题结束会停下来解释答案。答错或未在作答时间内回应，都记为该题未答对。'}</p>
    <p>{en?'If practice is not passed, read these instructions and examples again before trying a new round. Up to 3 rounds are available; you can stop rather than repeat indefinitely. Practice is separate from your formal result.':'如果练习未通过，先重新阅读这些说明与例子，再练一轮；最多3轮，也可以结束本次练习，避免反复作答。练习记录与正式结果分开。'}</p>
    <p>{en?`This ${config.profile==='research'?'research':'practical'} profile has ${config.totalTrials} formal trials. Formal responses have a 1.7-second window, no answer feedback, and a 4-second start-to-start rhythm.`:`本次为${config.profile==='research'?'科研版':'实用版'}，正式${config.totalTrials}次。正式作答时间为1.7秒，不再逐题解释；每次起点相隔4秒。`}</p>
    <p>{en?'Formal trials take at least 19.2 minutes in the research profile or 3.2 minutes in the practical profile. Add instructions, practice, feedback and breaks. Before starting, complete the screen/viewing-distance setup and keep the device and viewing position steady.':'科研版正式理论最短19.2分钟，实用版3.2分钟；还需加上说明、练习、反馈和休息时间。开始前完成屏幕与观看距离设置，放稳设备并保持观看位置。'}</p>
  </section>
}
