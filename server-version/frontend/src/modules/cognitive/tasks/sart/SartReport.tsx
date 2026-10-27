import React from 'react'
import {sartPublic,type SartReport as Report} from './generated/report'
export function SartReport({report,language='zh'}:{report:Report;language?:'zh'|'en'}){
  const en=language==='en';let p:ReturnType<typeof sartPublic>
  try{p=sartPublic(report,language)}catch{return <section role="alert">{en?'The report cannot be verified. Contact the organiser.':'报告暂时无法核对，请联系组织者。'}</section>}
  const num=(v:number|null,signed=false)=>v===null?'—':new Intl.NumberFormat(en?'en':'zh-CN',{maximumFractionDigits:1,signDisplay:signed?'exceptZero':'auto'}).format(v)
  return <article className="sart-task sart-reading" data-sart-report={p.state}>
    <p>{en?(p.profile==='research'?'Research version':'Practical version'):(p.profile==='research'?'科研版':'实用版')}</p><h1>{p.title}</h1>
    {p.notice&&<p role="status">{p.notice}</p>}
    {p.summary&&<div className="sart-summary">{p.observations.map((text,i)=><p key={i}>{text}</p>)}</div>}
    <p>{p.explanation}</p><h2>{en?'A practical reminder':'下次做持续观察任务时'}</h2><p>{p.suggestion}</p><p>{p.limitation}</p>
    {p.profile==='experience'&&p.summary&&<p>{en?'This short version plans only ten occasions when 3 means do not press. A few records should not be used to generalise about long-term performance.':'短版中“看到3应不按”的情况计划只有10次，少量记录不宜概括长期表现。'}</p>}
    {p.details&&<details><summary>{en?'Conditions and limits':'条件与解释限制'}</summary><p>{en?'Complete windows / planned':'完整窗口 / 计划'}：{p.details.complete} / {p.details.planned}</p>
      <p>{p.details.latency.medianMs===null?(en?'No interpretable response times are available.':'本次没有可解释的用时记录。'):en?`Across ${p.details.latency.responses} responses, the middle response time was ${num(p.details.latency.medianMs)} ms (the middle value after ordering the times).`:`${p.details.latency.responses}次回应的中间用时为${num(p.details.latency.medianMs)}毫秒（按快慢排序后取中间值）。`}</p>
      <table><thead><tr><th>{en?'Third':'时段'}</th><th>{en?'Press required: missing / count':'需要按：未按/次数'}</th><th>{en?'For 3: pressed / count':'看到3：按下/次数'}</th><th>{en?'Middle response time':'回应中间用时'}</th></tr></thead><tbody>{p.details.thirds.map((s,i)=><tr key={i}><th>{i+1}</th><td>{s.go?`${s.misses}/${s.go}`:'—'}</td><td>{s.noGo?`${s.presses}/${s.noGo}`:'—'}</td><td>{num(s.medianMs)} ms</td></tr>)}</tbody></table>
      <p>{en?'Last minus first: press rate for 3':'后段减前段：看到3时按下的比例'} {num(p.details.differences.commissionPercentagePoints,true)} {en?'percentage points':'个百分点'}；{en?'middle response time':'回应中间用时'} {num(p.details.differences.medianMs,true)} ms。</p>
      <p>{en?'Each rate uses its actual complete condition opportunities. A missing condition or response time remains unavailable, never zero. Differences retain their signs; few occasions with 3 do not establish improvement or decline. Practice and interrupted windows are excluded.':'各条件用真实完整窗口作分母，缺少条件或回应时间保留缺失、不补零。有符号差不裁零，看到3的次数稀少时不能据此断言变好或变差。练习与中断窗口不进入这些分母。'}</p>
    </details>}
    <p className="sart-brand">EDUK12.TOP</p>
  </article>
}
