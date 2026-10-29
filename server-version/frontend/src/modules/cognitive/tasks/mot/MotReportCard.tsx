import React from 'react'
import { projectMotReport, type MotPublicResult, type MotProfile } from './generated/protocol'
import { MotTakeHome } from './MotTakeHome'
import './mot.css'

export function MotReportCard({result,profile,language='zh',showTakeHome=true}:{
  result:MotPublicResult;profile:MotProfile;language?:'zh'|'en';showTakeHome?:boolean
}) {
  const model=projectMotReport(result),en=language==='en'
  const names=en?{1:'Slower',4:'Medium',8:'Faster'}:{1:'慢速',4:'中速',8:'快速'}
  const number=(value:number)=>new Intl.NumberFormat(en?'en':'zh-CN',{maximumFractionDigits:1}).format(value)
  return <article className="mot-task mot-report" data-cognitive-task-root data-mot-report-state={model.state}>
    <p className="mot-eyebrow">{en?(profile==='experience'?'Experience version':'Literature-aligned version'):(profile==='experience'?'体验版':'文献对照版')}</p>
    <h1>{model.state==='invalid'?(en?'This record cannot be interpreted yet':'这次记录暂时无法解读'):
      model.state==='limited'?(en?'Part of this record can be viewed':'部分记录可以查看'):
      (en?'See how many targets you found':'看看你找回了多少目标')}</h1>
    {model.state==='invalid'?<>
      <p>{en?'Key records were incomplete. This does not mean you performed poorly. No performance conclusion is shown.':'关键记录未完整保留，因此本次不提供表现结论。这不代表你做得不好。'}</p>
      <p>{en?'You can try again later with a stable device and fewer interruptions.':'你可以稍后在稳定设备和较少中断的环境中重新尝试。'}</p>
    </>:<>
      <p>{profile==='experience'?(en?'There are only 3 trials per speed. These records describe this attempt, not stable ability.':'每种速度只有3次记录，以下只描述本轮选择，不能据此判断稳定能力。'):
        en?'Each trial asked you to find 5 targets. Here are the records for this attempt.':'每次追踪5个目标，以下是这轮任务的记录。'}</p>
      {model.state==='limited'&&<p role="note">{en?'Affected speed conditions and the overall average are hidden; no between-speed comparison is made.':'受影响的速度和整体均值已隐藏，不作不同速度的比较。'}</p>}
      {model.headline!==null&&<p className="mot-number">{number(model.headline)}<small> / 5 {en?'targets per trial':'个 / 次'}</small></p>}
      <details><summary>{en?'What these records mean':'进一步看这次记录'}</summary>
        <p>{en?'The denominator is the number of complete, technically usable formal trials. Practice is separate. A wrong selection does not by itself make a trial invalid.':'分母为完整且技术记录可用的正式试次，练习不计入。选错目标本身不会被当作技术无效。'}</p>
        <p>{en?'Hidden internal metrics are not shown in this report.':'受质量规则影响的内部指标不会在本报告中展示。'}</p>
        <table><caption>{en?'Available speed records':'可展示的速度记录'}</caption><thead><tr><th>{en?'Speed':'速度'}</th><th>{en?'Targets found':'平均找回'}</th><th>{en?'Valid trials':'有效次数'}</th></tr></thead>
          <tbody>{model.rows.map(row=><tr key={row.speed}><th scope="row">{names[row.speed]}</th><td>{number(row.mean)} / 5</td><td>{row.validTrials} / {row.totalTrials}</td></tr>)}</tbody></table>
      </details>
      <section className="mot-card"><h2>{en?'For next time':'下次可以这样准备'}</h2><p>{en?'Keep the device still and turn off notifications so you can keep watching the display.':'把设备放稳，关闭通知，让目光能持续留在画面上。'}</p></section>
    </>}
    {showTakeHome&&<MotTakeHome result={result} profile={profile} language={language}/>}
    <p className="mot-small">{en?'This describes only this task, not how many things you can attend to in daily life.':'这里只描述本轮任务，不代表日常最多能同时注意几件事。'}</p>
  </article>
}
