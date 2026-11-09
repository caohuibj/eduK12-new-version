import { useContext, type ReactNode } from 'react'
import { CognitiveProgress } from './CognitiveTaskPresentation'
import { CognitiveFocusProgressContext, type FocusProgress } from './focus-progress'

/**
 * Presentation-only overlay for formal Cognitive task interaction.
 *
 * The shared AssessmentShell remains mounted underneath so controller/runtime
 * ownership does not change. During formal trials this overlay removes dynamic
 * shell chrome from the visual field and gives timed stimuli a stable viewport.
 */
export const CognitiveFocusStage = ({
  children,
  ariaLabel = '认知测验正式作答',
  progress,
}: {
  children: ReactNode
  ariaLabel?: string
  progress?: FocusProgress
}) => {
  const inheritedProgress = useContext(CognitiveFocusProgressContext)
  const activeProgress = ariaLabel.includes('练习') ? undefined : progress ?? inheritedProgress
  return (
  <section
    className="fixed inset-0 z-40 overflow-y-auto bg-slate-50"
    aria-label={ariaLabel}
    data-cognitive-focus-stage
  >
    {activeProgress && <div className="cognitive-focus-stage__progress" data-cognitive-focus-progress>
      {activeProgress.total != null && activeProgress.total > 0
        ? <CognitiveProgress current={Math.min(activeProgress.completed + 1, activeProgress.total)} total={activeProgress.total} label="正式测试 · 当前试次" />
        : <p className="text-center text-sm text-gray-500">正式测试 · 已记录 {activeProgress.completed} 次</p>}
    </div>}
    <div className="cognitive-focus-stage__body" data-has-progress={Boolean(activeProgress)}>
      <div className="w-full">{children}</div>
    </div>
  </section>
  )
}
