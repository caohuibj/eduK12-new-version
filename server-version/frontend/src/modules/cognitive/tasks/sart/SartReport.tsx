import React from 'react'
import {sartPublic,type SartReport as Report} from './generated/report'
export function SartReport({report,language='zh'}:{report:Report;language?:'zh'|'en'}){
  const en=language==='en';let p:ReturnType<typeof sartPublic>
  try{p=sartPublic(report,language)}catch{return <section role="alert">{en?'The report cannot be verified. Contact the organiser.':'报告暂时无法核对，请联系组织者。'}</section>}
  const num=(v:number|null,signed=false)=>v===null?'—':new Intl.NumberFormat(en?'en':'zh-CN',{maximumFractionDigits:1,signDisplay:signed?'exceptZero':'auto'}).format(v)
  return <article className="sart-task sart-reading" data-sart-report={p.state}>
    <p>{en?(p.profile==='research'?'Research version':'Experience version'):(p.profile==='research'?'科研版':'体验版')}</p><h1>{p.title}</h1>
    {p.notice&&<p role="status">{p.notice}</p>}
    {p.summary&&<div className="sart-summary">
      <p>{en?'Pressed for 3':'看到3时按下'}：<b>{p.summary.noGo?`${p.summary.noGo.presses} / ${p.summary.noGo.opportunities}`:en?'No complete No-Go opportunities':'尚无完整No-Go记录'}</b></p>
      <p>{en?'Did not press for other digits':'其他数字没有按'}：<b>{p.summary.go?`${p.summary.go.misses} / ${p.summary.go.opportunities}`:en?'No complete Go opportunities':'尚无完整Go记录'}</b></p>
      <p>{en?'Median Go response time':'Go回应中位用时'}：<b>{num(p.summary.latency.medianMs)} ms</b>（{p.summary.latency.responses} {en?'responses':'次回应'}）</p>
    </div>}
    <p>{p.explanation}</p><h2>{en?'A practical reminder':'下次做持续观察任务时'}</h2><p>{p.suggestion}</p><p>{p.limitation}</p>
    {p.profile==='experience'&&p.summary&&<p>{en?'This short version has only ten planned No-Go trials. A few trials or one difference do not establish a stable individual characteristic.':'短版计划No-Go只有10次，少数试次或一次差异不能建立稳定个人特征。'}</p>}
    {p.details&&<details><summary>{en?'Conditions and limits':'条件与解释限制'}</summary><p>{en?'Complete windows / planned':'完整窗口 / 计划'}：{p.details.complete} / {p.details.planned}</p>
      <table><thead><tr><th>{en?'Third':'时段'}</th><th>{en?'Go misses / Go':'Go漏答 / Go'}</th><th>{en?'No-Go presses / No-Go':'No-Go误按 / No-Go'}</th><th>{en?'Go RT median':'Go中位用时'}</th></tr></thead><tbody>{p.details.thirds.map((s,i)=><tr key={i}><th>{i+1}</th><td>{s.go?`${s.misses}/${s.go}`:'—'}</td><td>{s.noGo?`${s.presses}/${s.noGo}`:'—'}</td><td>{num(s.medianMs)} ms</td></tr>)}</tbody></table>
      <p>{en?'Last minus first: No-Go press rate':'后段减前段：No-Go误按率'} {num(p.details.differences.commissionPercentagePoints,true)} {en?'percentage points':'个百分点'}；{en?'Go response median':'Go回应中位用时'} {num(p.details.differences.medianMs,true)} ms。</p>
      <p>{en?'Each rate uses its actual complete condition opportunities. A missing condition or response time remains unavailable, never zero. Differences retain their signs; sparse No-Go counts do not establish improvement or decline. Practice and interrupted windows are excluded.':'各条件用真实完整窗口作分母，缺少条件或回应时间保留缺失、不补零。有符号差不裁零，No-Go稀少时不能据此断言变好或变差。练习与中断窗口不进入这些分母。'}</p>
    </details>}
    <p className="sart-brand">EDUK12.TOP</p>
  </article>
}
