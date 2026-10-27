import React from 'react'
import {pvtPublic,type PvtReport as Report} from './generated/report'
import type {PvtLanguage} from './generated/protocol'
export function PvtReport({report,language=report.teachingLanguage}:{report:Report;language?:PvtLanguage}){
  const en=language==='en';let p:ReturnType<typeof pvtPublic>
  try{p=pvtPublic(report,language)}catch{return <section role="alert">{en?'The report cannot be verified. Contact the organiser.':'报告暂时无法核对，请联系组织者。'}</section>}
  const s=p.summary
  return <article className="pvt-task pvt-reading" data-pvt-report={p.state}>
    <p>{en?(p.profile==='research'?'Research version':'Practical version'):(p.profile==='research'?'科研版':'实用版')}</p><h1>{p.title}</h1>{p.notice&&<p role="status">{p.notice}</p>}
    {s&&<><div className="pvt-summary"><p>{en?'Fully observed targets':'完整观察的目标'} <strong>{s.completeTargets}</strong></p><p>{en?'First responses after target onset':'记录到目标后回应'} <strong>{s.responded}</strong></p><p>{en?'Presses while waiting':'等待时提前按'} <strong>{s.earlyPresses}</strong></p><p>{en?'Full 30-second nonresponses':'完整观察满30秒未答'} <strong>{s.timeouts}</strong></p></div>{p.observations.map((text,i)=><p key={i}>{text}</p>)}</>}
    <p>{p.explanation}</p><h2>{en?'Before another observation task':'下次可以这样准备'}</h2><p>{p.suggestion}</p><p>{p.limitation}</p>
    {s&&<details><summary>{en?'Duration and observation limits':'时长与观察范围'}</summary><p>{en?'Actual recorded duration / scheduled duration':'实际记录时长 / 原定时长'}：{s.observedMs===null?'—':(s.observedMs/1000).toFixed(1)} / {s.scheduledMs/1000} {en?'seconds':'秒'}</p><p>{en?'Targets cut short by time limit / interruption':'时间到截断 / 中断的目标'}：{s.censored} / {s.interruptedTargets}</p><p>{en?'Only fully observed targets enter the response/nonresponse counts. Unexecuted or cut-short targets are never filled as zero or a miss. Presses while waiting are event counts, not percentages of targets.':'回应和未答次数只包含完整观察目标；未执行或未观察完的目标不补零或猜成漏答。等待时提前按是事件次数，不拿它除以目标数。'}</p></details>}
    <p className="pvt-brand">EDUK12.TOP</p>
  </article>
}
