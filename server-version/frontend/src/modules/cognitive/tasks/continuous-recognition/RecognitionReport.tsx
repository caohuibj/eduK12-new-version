import React from 'react'
import type {NativeReport} from './contracts'
import './recognition.css'
/** Receives only host projectNativeRecognitionReport projection, never raw metrics. */
export function RecognitionReport({report,language='zh',synthetic=false}:{report:NativeReport;language?:'zh'|'en';synthetic?:boolean}){
  const en=language==='en',invalid=report.state==='invalid'
  const count=(x:number|null)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=260?x:'—'
  return <article className="recognition-task recognition-reading" data-recognition-report={invalid?'invalid':'limited'}>
    {synthetic&&<p className="recognition-note">{en?'Synthetic browser review — no formal licensed stimuli':'合成浏览器审阅：没有正式获权刺激'}</p>}
    <h1>{invalid?(en?'This record is not ready to interpret':'这次记录暂时无法解读'):(en?'Your record is retained':'本次记录已保留')}</h1>
    <p>{en?'Performance conclusions remain hidden while stimulus and timing requirements await review. This does not mean you performed poorly.':'素材与时序等要求仍待核实，本次不展示表现结论。这不代表你做得不好。'}</p>
    {!invalid&&<p>{en?'Recorded presentations':'已记录呈现'}：{count(report.receivedTrialCount)} / {count(report.expectedTrialCount)}</p>}
    <p>{en?'For next time, keep your device still and turn off notifications.':'下次可以把设备放稳、关闭通知，减少中断。'}</p>
    <details><summary>{en?'About this record':'关于这份记录'}</summary><p>{en?'Practice is separate. There is no overall ability score, diagnosis or peer ranking. No take-home image is generated while interpretation is restricted.':'练习与正式记录分开；不输出能力总分、诊断或同龄排名。解释受限时不生成表现配图。'}</p></details>
  </article>
}
