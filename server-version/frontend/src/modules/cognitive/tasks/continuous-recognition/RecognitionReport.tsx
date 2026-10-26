import React from 'react'
import type {NativeReport} from './contracts'
import {isNativeRecognitionProjection} from './report-projection'
import './recognition.css'
/** Receives only the authoritative this-session projection, never internal metrics or a client approval switch. */
export function RecognitionReport({report,language='zh',synthetic=false}:{report:NativeReport;language?:'zh'|'en';synthetic?:boolean}){
  const en=language==='en',allowed=isNativeRecognitionProjection(report)&&report.state==='interpretable',invalid=report.state==='invalid'
  const count=(x:number|null)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=260?x:'—'
  const percent=(x:number)=>new Intl.NumberFormat(en?'en':'zh-CN',{maximumFractionDigits:1}).format(x*100)
  return <article className="recognition-task recognition-reading" data-recognition-report={allowed?'interpretable':invalid?'invalid':'limited'}>
    {synthetic&&<p className="recognition-note">{en?'Synthetic report example — not a formal result':'合成报告示例 · 非正式结果'}</p>}
    <h1>{allowed?(en?'Which pictures felt familiar this time?':'这次，哪些图片让你觉得见过？'):invalid?(en?'This record is not ready to interpret':'这次记录暂时无法解读'):(en?'Your record is retained':'本次记录已保留')}</h1>
    {allowed?<>
      <p>{en?`You identified ${report.targetHits} of ${report.denominator} repeated pictures.`:`本轮${report.denominator}张重复图片中，你认出了${report.targetHits}张。`}</p>
      <dl><dt>{en?'Repeated pictures identified':'重复图片识别率'}</dt><dd>{percent(report.hitRate!)}% · {report.targetHits}/{report.denominator}</dd>
        <dt>{en?'First-time target pictures marked Seen':'目标图片首次出现时的误认率'}</dt><dd>{percent(report.falseAlarmRate!)}% · {report.targetFalseAlarms}/{report.denominator}</dd>
        <dt>{en?'Identification rate minus false-alarm rate':'识别率减误认率'}</dt><dd>{percent(report.correctedRecognitionRate!)} {en?'percentage points':'个百分点'}</dd></dl>
      <p>{en?'These are records from this run, not a rating of your everyday memory.': '这些数字只描述本轮图片识别，不代表你的日常记忆能力。'}</p>
      {report.profile==='experience'&&<p>{en?'This shorter version has fewer observations; use it as a starting point for self-observation.':'体验版记录次数较少，可作为进一步自我观察的起点。'}</p>}
    </>:<p>{en?'Some key records or picture requirements are incomplete, so performance conclusions are hidden. This does not mean you performed poorly.':'关键记录或图片条件尚不完整，因此这次不展示表现结论。这不代表你做得不好。'}</p>}
    {!invalid&&<p>{en?'Recorded presentations':'已记录呈现'}：{count(report.receivedTrialCount)} / {count(report.expectedTrialCount)}</p>}
    <p>{en?'For next time, keep your device still and turn off notifications.':'下次可以把设备放稳、关闭通知，减少中断。'}</p>
    <details><summary>{en?'About this record':'关于这份记录'}</summary><p>{en?'Both rates use the same complete target-picture pairs. Fillers and practice are separate. The difference may be negative. No age ranking, diagnosis or overall ability score is provided.':'两个比例使用同一组完整的目标图片配对；填充图片和练习不混入这两个分母。差值可以为负，不提供同龄排名、诊断或能力总分。'}</p></details>
  </article>
}
