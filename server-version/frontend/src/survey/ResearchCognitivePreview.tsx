import { useState } from 'react'
import { resolveRunner } from '../modules/cognitive/registry'
import type { CognitiveTaskContext } from '../modules/cognitive/core/runner.types'
import { SurveyCognitiveDeviceGate } from './SurveyCognitiveDeviceGate'
export type CognitivePreviewSnapshot=Pick<CognitiveTaskContext,'testType'|'engineVersion'|'scoringVersion'|'configVersion'|'config'>
/** Preview uses the exact registered task and backend-compiled configuration.
 * No participant identity, persistence adapter, score or formal receipt is created. */
export function ResearchCognitivePreview({snapshot,onCompleted}:{snapshot?:CognitivePreviewSnapshot;onCompleted?:()=>void}){
  const [started,setStarted]=useState(false),[index,setIndex]=useState(0),[finished,setFinished]=useState(false)
  const entry=snapshot?resolveRunner(snapshot.testType,snapshot.engineVersion):undefined
  if(!snapshot||!entry)return <p role="alert">尚未取得可运行的冻结配置；请保存并重新执行结构检查。不会用默认配置替代当前预览。</p>
  const Runner=entry.RunnerComponent
  const total=Number(snapshot.config.totalTrials??snapshot.config.trialCount)
  return <section className="border rounded-xl p-4 space-y-3" aria-label="认知任务完整预览">
    <h3 className="font-semibold">预览模式 · 说明、练习与完整测试序列</h3>
    <p className="text-sm">使用真实版本运行器和当前编译配置；预览作答不保存、不计分，不产生正式研究结果。</p>
    {!started?<SurveyCognitiveDeviceGate preview onReady={()=>setStarted(true)}/>:
      finished?<p role="status">预览流程已结束，未生成正式结果或研究回执。</p>:
      <Runner taskContext={{...snapshot,sessionId:'survey-preview',attemptNo:1,randomSeed:'survey-preview-fixed-sequence-v1',requiredInput:'KEYBOARD'}}
        trialIndex={index} onTrialComplete={async()=>{const next=index+1;setIndex(next);if(next>=total){setFinished(true);onCompleted?.()}}}
        onTaskComplete={async()=>{setFinished(true);onCompleted?.()}}/>}
    {started&&<button type="button" className="btn-secondary" onClick={()=>{setStarted(false);setIndex(0);setFinished(false)}}>退出并清除本次预览</button>}
  </section>
}
