import React from 'react'
import {isReport,reportText,takeHomeSvg,type Report as PublicReport,type Language} from './generated/report'
function save(text:string,type:string,name:string){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}
export function Report({report,language}:{report:PublicReport;language:Language}){
  const en=language==='en';if(!isReport(report))return <section className="srl-task" role="alert">{en?'The saved report could not be verified.':'暂时无法核对已保存的报告。'}</section>
  return <article className="srl-task" data-report-state={report.state}>{reportText(report,language).split('\n\n').map((p,i)=>i===0?<h1 key={i}>{p}</h1>:<p key={i}>{p}</p>)}<div className="srl-actions"><button onClick={()=>save(reportText(report,language),'text/plain;charset=utf-8','serial-reaction-learning.txt')}>{en?'Download this note':'下载本次说明'}</button>{report.summary&&<button onClick={()=>{const svg=takeHomeSvg(report,language);if(svg)save(svg,'image/svg+xml','serial-reaction-learning.svg')}}>{en?'Download one summary image':'下载一张摘要图'}</button>}</div></article>
}
