import { useState, type ReactNode } from 'react'
import type { CompositeAttemptState } from './types'

/** Display acknowledgements deliberately never enter a FINAL, score, or server
 * evidence. No branch language or future candidates are interpreted here. */
export function TrainingFlowBoundary({ state, children, onExit, onCompleted }: {
  state: CompositeAttemptState; children: ReactNode; onExit: () => void; onCompleted: () => void
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const flow = state.trainingFlow
  if (!flow) return <>{children}</>
  const materialKey = (material: typeof flow.materials[number]) => JSON.stringify([state.id, state.attemptEpoch, material.blockKey, material.title, material.body])
  const material = flow.materials.find(material => !dismissed.has(materialKey(material)))
  if (material) return <section aria-label="课程流程材料" className="card mx-auto max-w-3xl space-y-4 p-6">
    <h1 className="text-xl font-semibold">{material.title || '课程材料'}</h1>
    <p className="whitespace-pre-wrap">{material.body}</p>
    <p className="text-sm text-slate-600">此材料仅供展示。继续不会记录阅读证明、得分或任务达成。</p>
    <div className="flex flex-wrap gap-3"><button type="button" className="btn-primary min-h-11" onClick={() => setDismissed(previous => new Set([...previous, materialKey(material)]))}>继续</button><button type="button" className="btn-secondary min-h-11" onClick={onExit}>退出</button></div>
  </section>
  if (flow.termination !== 'PENDING') {
    const notSatisfied = state.taskSatisfaction === 'NOT_SATISFIED' || state.taskSatisfied === false || flow.termination === 'SCREEN_OUT'
    const satisfied = !notSatisfied && (state.taskSatisfaction === 'SATISFIED' || state.taskSatisfied === true)
    return <section aria-label="课程流程结果" className="card mx-auto max-w-xl space-y-4 p-6 text-center">
      <h1 className="text-2xl font-bold">交卷已结束</h1>
      <p>{flow.termination === 'SCREEN_OUT' ? '本次流程已按资格条件结束。' : flow.termination === 'COMPLETE_EARLY' ? '本次流程已按条件提前结束。' : '本次流程已完成。'}已接受的作答记录会保留。</p>
      <p role="status">{notSatisfied ? '任务未达成' : satisfied ? '任务已达成' : '任务达成状态待确认'}</p>
      {notSatisfied && <p>交卷结束不等于完成课程任务，可查看本次已有结果。</p>}
      <div className="flex flex-wrap justify-center gap-3"><button type="button" className="btn-primary min-h-11" onClick={onCompleted}>查看本次结果</button><button type="button" className="btn-secondary min-h-11" onClick={onExit}>返回任务列表</button></div>
    </section>
  }
  if (!state.currentItem || !flow.currentInstrumentKey) return <section role="status" className="card p-6"><p>正在确认服务端流程进度，请重新加载后继续。</p><button type="button" className="btn-secondary min-h-11" onClick={onExit}>退出</button></section>
  return <>{children}</>
}
