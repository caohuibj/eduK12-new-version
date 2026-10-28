import React from 'react'
import {isEffortReport,EFFORT_REPORT_COPY,type EffortReport as Report,type ChoiceGroup} from './generated/report'
/** Public frozen projection only. No internal scorer metric or arbitrary review object reaches the participant. */
export function EffortReport({report,language='zh'}:{report:Report;language?:'zh'|'en'}){const en=language==='en'
 if(!isEffortReport(report))return <section className="effort-task effort-reading" role="alert">{en?'This report could not be verified. Contact the organiser.':'这份报告暂时无法核对，请联系组织者。'}</section>
 const copy=EFFORT_REPORT_COPY[language],number=(v:number)=>new Intl.NumberFormat(en?'en':'zh-CN',{maximumFractionDigits:2}).format(v)
 const table=(groups:Record<string,ChoiceGroup>,label:(key:string)=>string)=><table><thead><tr><th>{en?'Offer':'条件'}</th><th>{en?'More / valid':'较多 / 有效'}</th><th>{en?'No choice':'未选择'}</th></tr></thead><tbody>{Object.entries(groups).map(([key,g])=><tr key={key}><th>{label(key)}</th><td>{g.valid?`${g.high} / ${g.valid}`:'— / 0'}</td><td>{g.noChoice}</td></tr>)}</tbody></table>
 return <article className="effort-task effort-reading" data-effort-report={report.state}><p>{en?(report.profile==='research'?'Research version':'Practical version'):(report.profile==='research'?'科研版':'实用版')}</p><h1>{report.state==='invalid'?(en?'No choice conclusion is available':'本次暂时无法形成选择结论'):copy.title}</h1>
 {report.state==='invalid'?<p>{en?'No valid choices were recorded. Preference and execution conclusions are hidden; this does not mean low motivation.':'本次没有有效选择，暂不展示偏好或执行表现结论；这不代表动力不足。'}</p>:<>
  {report.state==='limited'&&<p role="status">{en?'Only the available parts are described. Missing and interrupted records remain separate.':'仅描述本次可用部分；未选择和中断记录分别保留。'}</p>}
  <p>{en?`Of ${report.valid} valid choices, you selected more presses ${report.high} times. ${report.noChoice} rounds had no selection.`:`本次${report.valid}次有效选择中，你有${report.high}次选了较多按压；另${report.noChoice}轮未选择，单独记录。`}</p>
  <h2>{en?'By the more-press baseline':'按较多选项的按压基准分开看'}</h2>{table(report.byEffort,key=>en?`${key} presses`:`基准${key}次`)}<p>{copy.explanation}</p>
  <h2>{en?'Execution, separately':'实际执行另看'}</h2><p>{en?`Valid execution: ${report.executionCount} rounds; total presses: ${report.totalPresses===null?'—':report.totalPresses}; known task points: ${report.knownTaskPoints===null?'—':number(report.knownTaskPoints)}.`:`有效执行${report.executionCount}轮；按压总数${report.totalPresses===null?'—':report.totalPresses}次；已完成执行的任务点数${report.knownTaskPoints===null?'—':number(report.knownTaskPoints)}点。`}</p>
  <h2>{en?'A practical reminder':'一个可用的提醒'}</h2><p>{copy.tip}</p>
  {report.profile==='experience'&&<p>{en?'The short version contains one observation per full condition; it cannot establish a stable personal preference.':'短版每个完整条件仅1次，不足以建立稳定的个人偏好。'}</p>}
 </>}
 <p>{copy.limit}</p><details><summary>{en?'Reward, probability, execution and limits':'收益、概率、执行与完整限制'}</summary><p>{en?'Recorded / planned':'已记录 / 计划'}：{report.received} / {report.planned}；{en?'technical limitations':'技术受限'}：{report.technical}</p>
 {report.state!=='invalid'&&<>{table(report.byReward,key=>en?`${key} points`:`收益基准${key}点`)}{table(report.byProbability,key=>`${Number(key)*100}%`)}
  <h3>{en?'Execution by observed input':'按实际输入分别记录执行'}</h3><table><thead><tr><th>{en?'Input':'输入'}</th><th>{en?'Rounds':'轮数'}</th><th>{en?'Presses / second':'次/秒'}</th></tr></thead><tbody>{Object.entries(report.executionByInput).map(([key,g])=><tr key={key}><th>{en?key:({touch:'触控',mouse:'鼠标/触控板',pen:'笔',keyboard:'键盘',mixed:'混合',unknown:'未观察到按压输入'})[key as 'touch']??key}</th><td>{g.trials}</td><td>{number(g.pressesPerSecond)}</td></tr>)}</tbody></table>
  <h3>{en?'All offer conditions':'全部条件'}</h3>{table(report.conditions,key=>{const [goal,reward,prob]=key.split('/');return `${goal} / ${reward} / ${Number(prob)*100}%`})}</>}
 <p>{en?'More-option points are baseline points × actual presses / baseline presses when payout is available. Lower completion ends early at 20 presses; unfinished lower trials earn zero. No choice is missing, not a low-effort choice or zero rate. Input types are not pooled into an ability score.':'较多按压兑现时按“基准点数×实际次数/按压基准”计点；较少按压到20次提前结束，未完成给0点。未选择是缺失，不补为低努力或0速率。不同输入不合成能力分。'}</p></details>
 </article>
}
