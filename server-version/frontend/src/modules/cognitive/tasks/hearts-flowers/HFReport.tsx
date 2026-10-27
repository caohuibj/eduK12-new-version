import React from 'react'
import {HF_COPY,HF_GROUPS,HF_INPUTS,isHFReport,type HFReport as Report,type GroupKey} from './generated/report'
const labels:Record<GroupKey,[string,string]>={heartOnly:['心同侧','Hearts, same side'],flowerOnly:['花对侧','Flowers, opposite side'],mixed:['混合规则','Mixed rules'],mixedSwitch:['混合：切换','Mixed: switch'],mixedRepeat:['混合：重复','Mixed: repeat'],mixedFirst:['混合：首题','Mixed: first trial']}
const mainGroups=['heartOnly','flowerOnly','mixed'] as const
export function HFReport({report,language='zh'}:{report:Report;language?:'zh'|'en'}){
 const en=language==='en',copy=HF_COPY[language]
 if(!isHFReport(report))return <section role="alert">{en?'The saved report identity could not be verified.':'未能核对已保存报告身份。'}</section>
 const totals=report.groups?mainGroups.reduce((sum,key)=>({correct:sum.correct+report.groups![key].correct,missed:sum.missed+report.groups![key].missed,answered:sum.answered+report.groups![key].answered}),{correct:0,missed:0,answered:0}):null
 const finding=totals?(en?`This attempt recorded results for ${report.valid} trials: ${totals.correct} correct, ${totals.answered-totals.correct} incorrect, and ${totals.missed} without a response.`:`本次记录了${report.valid}题的结果：答对${totals.correct}题，答错${totals.answered-totals.correct}题，${totals.missed}题未回应。`):null
 const conditions=report.groups?mainGroups.map(key=>{const g=report.groups![key],label=labels[key][en?1:0];return g.valid?(en?`${label}: ${g.correct} correct out of ${g.valid} trials`:`${label}共${g.valid}题，答对${g.correct}题`):(en?`${label}: no results available`:`${label}尚无可用记录`)}).join(en?'; ':'；')+(en?'.':'。'):null
 return <article className="hf-task hf-reading" data-hf-report={report.state}>
  <h1>{copy.title}</h1>
  <p>{en?`${report.profile==='research'?'Research version':'Practical version'} · ${report.planned} planned trials`:`${report.profile==='research'?'科研版':'实用版'} · 计划${report.planned}题`}</p>
  {report.state==='invalid'?<p>{en?'There are no usable response records to describe, so this attempt cannot support a performance conclusion.':'本次没有可用于描述表现的作答记录，暂时无法形成表现结论。'}</p>:<>
   <p>{finding}</p><p>{conditions}</p>
   {report.state==='limited'&&<p role="status">{en?'This attempt was interrupted or unfinished. Only the results already retained are described; unfinished trials are not counted as incorrect.':'本次有中断或未完成，只描述已经保留的结果；未完成的题目不按答错处理。'}</p>}
   <p>{en?'These counts describe this attempt under each rule. They do not establish a stable strength or difficulty.':'这些数字只描述你这次在不同规则下的作答，不据此判断稳定的长处或困难。'}</p>
   <table><caption>{en?'Your results under each rule':'你在各条规则下的作答'}</caption><thead><tr><th>{en?'Rule':'规则'}</th><th>{en?'Correct answers':'答对情况'}</th><th>{en?'Accuracy':'正确率'}</th><th>{en?'No response':'未回应'}</th></tr></thead><tbody>{mainGroups.map(key=>{const g=report.groups![key];return <tr key={key}><th>{labels[key][en?1:0]}</th><td>{g.valid?(en?`${g.correct} correct out of ${g.valid} trials`:`${g.valid}题中答对${g.correct}题`):(en?'No results available':'尚无可用记录')}</td><td>{g.accuracy===null?'—':`${(g.accuracy*100).toFixed(1)}%`}</td><td>{g.valid?g.missed:'—'}</td></tr>})}</tbody></table>
   <p>{en?'When rules change, state the rule clearly and check each step against it.':'需要切换规则时，可以先把规则说清楚，再逐项确认。'}</p>
   <details><summary>{en?'Response times, calculations and research notes':'查看用时、计算方式与研究说明'}</summary>
    <p>{en?`Received ${report.received} records out of ${report.planned} planned trials; ${report.valid} response windows had closed.`:`计划${report.planned}题，收到${report.received}条记录，其中${report.valid}题的回应窗口已闭合。`}</p>
    <p>{copy.explanation}</p>
    <p>{en?'The switch, repeat and first-trial rows partition mixed trials; do not add them to the mixed total again.':'切换、重复和首题共同分割混合任务；不要与混合总行再次相加。'}</p>
    <ul>{(['mixedSwitch','mixedRepeat','mixedFirst'] as const).map(key=>{const g=report.groups![key];return <li key={key}>{labels[key][en?1:0]}：{g.valid?`${g.correct}/${g.valid}`:(en?'No records for this condition':'尚无该条件记录')}；{en?'omitted ':'漏答'}{g.valid?g.missed:'—'}</li>})}</ul>
    <p>{en?'Arithmetic means use only correct first responses within [onset, onset + deadline). Wrong answers and omissions remain in accuracy; omissions have no response time. Input methods stay separate. Switch minus repeat is signed, with no value when either mean is unavailable. No overall speed or ability score combines input methods.':'平均用时只采用[图形出现，出现＋时限)内首个正确回应的算术平均。错答、漏答保留在正确率中；漏答没有用时记录。输入方式分别计算。切换减重复可正、可负或为零；任一条件没有正确用时则无差值，不跨输入合成速度或能力分。'}</p>
    {HF_INPUTS.filter(input=>HF_GROUPS.some(key=>report.groups![key].inputs[input].answered>0)).map(input=><section key={input}><h2>{en?input:({keyboard:'键盘',touch:'触屏',mouse:'鼠标指针',pen:'笔',assistive:'辅助技术激活'}[input])}</h2><ul>{HF_GROUPS.map(key=>{const i=report.groups![key].inputs[input];return <li key={key}>{labels[key][en?1:0]}：{i.meanCorrectMs===null?(en?'no correct response time':'无正确反应用时'):`${i.meanCorrectMs.toFixed(1)} ms`} ({en?`${i.correctRTCount} correct responses`:`${i.correctRTCount}次正确回应`})</li>})}<li>{en?'Switch − repeat':'切换 − 重复'}：{report.differences![input].switchMinusRepeatMs===null?'—':`${report.differences![input].switchMinusRepeatMs!.toFixed(1)} ms`}</li></ul></section>)}
    <p>{en?'Counts and 2500/1000 ms timing refer to the Executive Function method in Camerota et al., DOI 10.1037/pas0000725. Touch input, geometric SVGs, teaching and mixed balancing are project variations. Study exclusions below 200 ms, 75% responding or 50% accuracy are not applied.':'次数与2500/1000ms参考Camerota等论文Executive Function方法（DOI 10.1037/pas0000725）。触屏、自绘图形、教学和混合平衡为项目变式；不套用原研究小于200ms、回应少于75%或正确低于50%的剔除条件。'}</p>
   </details>
  </>}
  <p>{copy.limit}</p>
  {report.profile==='experience'&&<p>{en?'The 32-trial practical version has fewer repetitions; it does not inherit reliability, equivalence or norms from the 57-trial research version.':'32题实用版重复较少，不自动继承57题科研版的信度、等值性或常模。'}</p>}
  <p>{en?'Age applicability, Chinese comprehension and device equivalence remain unverified.':'适用年龄、中文理解和设备等值性尚未核实。'}</p><footer>EDUK12.TOP</footer>
 </article>
}
