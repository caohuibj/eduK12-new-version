import React from 'react'
import {FAMILIES} from './generated/protocol'
import {isNumberSeriesReport,numberSeriesReportText,numberSeriesTakeHomeSvg,NUMBER_SERIES_COPY,type NumberSeriesReport as Report,type Language} from './generated/report'
function save(content:string,type:string,filename:string) {
  const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a')
  a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url)
}
export function NumberSeriesReport({report,language='zh'}:{report:Report;language?:Language}) {
  const en=language==='en'
  if(!isNumberSeriesReport(report))return <section className="number-series-task" role="alert">{en?'The frozen report could not be verified.':'冻结报告暂时无法核对。'}</section>
  const copy=NUMBER_SERIES_COPY[language],summary=report.summary
  return <article className="number-series-task" data-report-state={report.state}>
    <h1>{summary?copy.title:en?'A note about this attempt':'关于本次记录'}</h1>
    {summary?<><p>{copy.explanation}</p><p className="number-series-count">{summary.correct} / {summary.opportunities} <span>{en?'correct':'答对'}</span></p><p>{en?'Explicitly skipped':'明确跳过'}：{summary.skipped}</p>
      <table><thead><tr><th>{en?'Relationship':'关系'}</th><th>{en?'Correct / opportunities':'答对 / 完整机会'}</th></tr></thead><tbody>{FAMILIES.map(f=><tr key={f}><td>{copy.families[f]}</td><td>{summary.conditions[f].correct} / {summary.conditions[f].opportunities}</td></tr>)}</tbody></table>
      <p>{summary.correctRtMs===null?copy.noTime:<>{en?'Median correct-answer time':'正确题中位用时'}：{new Intl.NumberFormat(en?'en':'zh-CN',{maximumFractionDigits:2}).format(summary.correctRtMs/1000)} {en?'seconds':'秒'}</>}</p>
      <p>{copy.tip}</p>
    </>:<><p role="status">{report.state==='limited'?copy.limited:copy.invalid}</p><p>{en?'Complete opportunities recorded / planned':'已记录完整机会 / 计划'}：{report.progress.completed} / {report.progress.planned}</p></>}
    <p className="number-series-limit">{copy.limit}</p>
    <div className="number-series-actions"><button onClick={()=>save(numberSeriesReportText(report,language),'text/plain;charset=utf-8','number-series-session.txt')}>{en?'Download this note':'下载本次说明'}</button>
      {summary&&<button className="number-series-secondary" onClick={()=>{const svg=numberSeriesTakeHomeSvg(report,language);if(svg)save(svg,'image/svg+xml','number-series-session.svg')}}>{en?'Download one summary image':'下载一张摘要图'}</button>}</div>
  </article>
}
