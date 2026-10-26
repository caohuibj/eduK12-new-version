import React from 'react'
import type { projectAntReport } from './generated/report'
export interface AntBoundReport {
  contextId:string;configHash:string;protocolSignature:string;projection:ReturnType<typeof projectAntReport>;qualityFlags:Record<string,boolean>
}
import './ant.css'
const cueNames={none:['无提示','No cue'],central:['中央提示','Central cue'],double:['双位置提示','Double cue'],spatial_valid:['空间提示','Spatial cue']}
const flankerNames={congruent:['两侧方向相同','Side arrows point the same way'],incongruent:['两侧方向相反','Side arrows point the other way'],neutral:['两侧无方向提示','No directional side arrows']}
const inputNames={touch:['触屏','Touchscreen'],pointer:['鼠标或触控笔','Mouse or stylus'],keyboard:['键盘','Keyboard']}
const costNames={alerting:['无提示−双位置提示','No cue − double cue'],orienting:['中央−空间提示','Central − spatial cue'],conflict:['不一致−一致侧翼','Incongruent − congruent']}
export function AntReportCard({data,contextId,configHash,protocolSignature,language='zh',synthetic=false}:{
  data:AntBoundReport;contextId:string;configHash:string;protocolSignature:string;language?:'zh'|'en';synthetic?:boolean}){
  const bound=data.contextId===contextId&&data.configHash===configHash&&data.protocolSignature===protocolSignature
    &&/^[a-f0-9]{64}$/.test(configHash)&&/^[a-f0-9]{64}$/.test(protocolSignature)
  const flags=data.qualityFlags??{},invalid=!bound||data.projection.state==='invalid'||flags.noInterpretableCondition!==false
  const rtAllowed=flags.mixedInput===false
  const source=data.projection
  const report={...source,state:invalid?'invalid':source.state,
    accuracy:!invalid&&flags.incompleteAccuracy===false?source.accuracy:null,
    cueRows:invalid?[]:source.cueRows.filter(r=>flags['incompleteCue_'+r.cue]===false).map(r=>({...r,
      correctMeanRtMs:rtAllowed?r.correctMeanRtMs:null,correctRtCount:rtAllowed?r.correctRtCount:null,input:rtAllowed?r.input:null})),
    flankerRows:invalid?[]:(source.flankerRows??[]).filter(r=>flags['incompleteFlanker_'+r.flanker]===false).map(r=>({...r,
      correctMeanRtMs:rtAllowed?r.correctMeanRtMs:null,correctRtCount:rtAllowed?r.correctRtCount:null,input:rtAllowed?r.input:null})),
    differences:invalid||!rtAllowed?[]:source.differences.filter(d=>flags['unavailable_'+d.key]===false)}
  const en=language==='en',lang=en?1:0
  return <article className="ant-candidate ant-report" data-ant-report-state={report.state}>
    {synthetic&&<p className="ant-fixture-label">{en?'SYNTHETIC FIXTURE · Not a participant result':'合成数据示例 · 不是真实被试结果'}</p>}
    <h1>{report.state==='invalid'?(en?'No performance conclusion this time':'本次暂不提供表现结论'):en?'Your cue and arrow record':'这次的线索与箭头记录'}</h1>
    {report.state!=='interpretable'&&<p>{en?'Some records are incomplete or affected. Unavailable measurements are hidden.':'部分记录不完整或受到影响，相关指标暂不展示。'}</p>}
    {report.accuracy!==null&&<section className="ant-panel"><h2>{en?'Correct this session':'本轮答对比例'}</h2><p className="ant-big">{(report.accuracy*100).toFixed(1)}%</p></section>}
    {report.cueRows.length>0&&<div className="ant-table-wrap"><table><caption>{en?'Your responses under each cue':'不同提示下的作答记录'}</caption><thead><tr><th>{en?'Cue':'提示'}</th><th>{en?'Correct / valid':'正确 / 有效'}</th><th>{en?'Mean time when correct':'正确平均用时'}</th></tr></thead><tbody>{report.cueRows.map(r=><tr key={r.cue}><th scope="row">{cueNames[r.cue][lang]}</th><td data-label={en?'Correct / valid':'正确 / 有效'}>{r.correct} / {r.total}</td><td data-label={en?'Mean time when correct':'正确平均用时'}>{r.correctMeanRtMs===null?'—':`${r.correctMeanRtMs.toFixed(0)} ms`}<small>{r.correctRtCount!==null?`${r.correctRtCount} ${en?'correct responses':'次正确回应'} · ${r.input?inputNames[r.input][lang]:''}`:en?'Unavailable':'暂不展示'}</small></td></tr>)}</tbody></table></div>}
    {report.flankerRows.length>0&&<details><summary>{en?'How the side arrows differed':'看看两侧箭头不同时的记录'}</summary><div className="ant-table-wrap"><table>
      <caption>{en?'Your responses under each side-arrow condition':'两侧箭头不同时的作答记录'}</caption>
      <thead><tr><th>{en?'Side arrows':'两侧箭头'}</th><th>{en?'Correct / valid':'正确 / 有效'}</th><th>{en?'Mean time when correct':'正确平均用时'}</th></tr></thead>
      <tbody>{report.flankerRows.map(r=><tr key={r.flanker}><th scope="row">{flankerNames[r.flanker][lang]}</th>
        <td data-label={en?'Correct / valid':'正确 / 有效'}>{r.correct} / {r.total}</td>
        <td data-label={en?'Mean time when correct':'正确平均用时'}>{r.correctMeanRtMs===null?'—':`${r.correctMeanRtMs.toFixed(0)} ms`}
          <small>{r.correctRtCount!==null?`${r.correctRtCount} ${en?'correct responses':'次正确回应'} · ${r.input?inputNames[r.input][lang]:''}`:en?'Unavailable':'暂不展示'}</small></td>
      </tr>)}</tbody></table></div></details>}
    {report.differences.length>0&&<details><summary>{en?'Compare response times':'看看不同条件下的用时差'}</summary>{report.differences.map(d=><p key={d.key}>{costNames[d.key][lang]}：{d.valueMs.toFixed(0)} ms <small>{en?'Correct responses':'正确回应次数'} {d.firstCorrectCount} / {d.secondCorrectCount} · {inputNames[d.input][lang]}</small></p>)}</details>}
    <p>{en?'This describes this session only. Condition differences are not ability levels; the short profile does not establish stable attention networks.':'这里只描述本轮记录，条件差值不是能力等级；体验版不代表稳定的注意网络能力。'}</p>
    <p>{en?'Next time: keep your device still, turn off notifications and look at the central fixation.':'下次可以把设备放稳、关闭通知，让视线留在中央注视点。'}</p>
    <details><summary>{en?'Methods and limits':'方法与限制'}</summary><p>{en?'Wrong responses and timeouts remain in the accuracy denominator. Response times are kept separate for touch, mouse and keyboard. No norms, diagnosis or recruitment predictions are provided.':'错误与超时保留在正确率分母中。触屏、鼠标和键盘的用时分开记录。这里没有常模、诊断或招聘预测结论。'}</p></details>
  </article>
}
