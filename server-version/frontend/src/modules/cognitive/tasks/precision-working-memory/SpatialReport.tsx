import React from 'react'
import CognitiveReportVisual from '../../CognitiveReportVisual'
import '../../cognitive-report-reading.css'
import '../../cognitive-native-report.css'
import {isSpatialReport,SPATIAL_REPORT_COPY,type SpatialReport as Report} from './generated/report'
/** Only the versioned public projection enters this component; internal scorer metrics never do. */
export function SpatialReport({report,language='zh'}:{report:Report;language?:'zh'|'en'}){const en=language==='en'
  if(!isSpatialReport(report))return <section className="spatial-reading" role="alert">{en?'This report could not be verified. Please contact the organiser.':'这份报告暂时无法核对，请联系组织者。'}</section>
  const copy=SPATIAL_REPORT_COPY[language],number=(n:number)=>new Intl.NumberFormat(en?'en':'zh-CN',{maximumFractionDigits:1}).format(n)
  return <article className="cognitive-native-report spatial-task spatial-reading" data-spatial-report={report.state}><p>{en?(report.profile==='research'?'Research version':'Practical version'):(report.profile==='research'?'科研版':'实用版')}</p>
    <h1>{report.state==='invalid'?(en?'This record is not ready to interpret':'本次记录暂时无法解读'):copy.title}</h1>
    {report.state==='invalid'?<p>{en?'There are no valid formal position selections. Performance conclusions are hidden; this is not a judgement of your memory.':'本次没有有效正式位置回应，因此隐藏表现结论；这不是对记忆能力的判断。'}</p>:<>
      {report.state==='limited'&&<p role="status">{en?'Only part of this record can be described. The counts below show what was available.':'本次只有部分记录可描述，请结合下面的有效次数查看。'}</p>}
      <p>{report.conditions.map(c=>c.valid>0?(en?`With ${c.setSize} item${c.setSize===1?'':'s'}, your average selection was ${number(c.meanAbsoluteErrorDeg!)}° from the target.`:`记${c.setSize}个位置时，本次落点平均偏离目标${number(c.meanAbsoluteErrorDeg!)}°。`):(en?`No valid ${c.setSize}-item selections were available.`:`记${c.setSize}个位置的有效记录不足。`)).join(en?' ':'')}</p>
      <CognitiveReportVisual language={language} missingLabel={en?'No valid position selections':'没有有效位置回应'} visual={{kind:'metrics',unit:'°',title:en?'How close were your selections?':'这次落点离目标多远？',points:report.conditions.map(c=>({label:en?`${c.setSize} item${c.setSize===1?'':'s'}`:`记${c.setSize}个`,value:c.meanAbsoluteErrorDeg})),caption:report.conditions.map(c=>en?`${c.setSize} items: ${c.valid}/${c.planned} valid selections`:`记${c.setSize}个：有效${c.valid}/${c.planned}次`).join(en?'; ':'；')+(en?'. Mean angular distance, not a memory-capacity score. EDUK12.TOP':'。平均角度距离，不是记忆容量分。EDUK12.TOP')}}/><dl>{report.conditions.map(c=><div key={c.setSize}><dt>{en?`${c.setSize}-item average angular error`:`记${c.setSize}个位置：平均偏差`}</dt><dd>{c.meanAbsoluteErrorDeg===null?'—':number(c.meanAbsoluteErrorDeg)+'°'}<span>{en?'Valid / planned':'有效 / 计划'}：{c.valid} / {c.planned}</span></dd></div>)}</dl>
      <p>{copy.explanation}</p><h2>{en?'One thing to try':'一个可尝试的小建议'}</h2><p>{copy.tip}</p></>}
    <p>{copy.limit}</p><details><summary>{en?'Definition, counts and limits':'误差定义、记录和限制'}</summary><p>{en?'Error is the shortest distance around the circle (0–180°); clockwise/counterclockwise errors remain signed in the original record. Missing trials stay missing, not zero.':'偏差是圆周最短距离（0–180°），原件同时保留顺/逆时针有符号误差。未作答保留缺失，不补0。'}</p>
      {report.state!=='invalid'&&report.conditions.map(c=><p key={c.setSize}>{en?`${c.setSize}-item median`:`记${c.setSize}个位置：偏差中位数`}：{c.medianAbsoluteErrorDeg===null?'—':number(c.medianAbsoluteErrorDeg)+'°'}</p>)}
      <p>{en?'Recorded / planned':'已记录 / 计划'}：{report.received} / {report.planned}；{en?'technical exclusions':'技术排除'}：{report.excluded}</p>
      <p>{en?'Long and short versions stay separate. This browser and touch-confirmation variant is not an equivalent reproduction of the original mouse protocol. No fitted capacity, norms, ranking or diagnosis is produced.':'长短版分开解释。浏览器几何和触控确认属于项目变式，不是原鼠标协议的等效复现；不输出模型容量、常模排名或诊断。'}</p></details>
  </article>}
