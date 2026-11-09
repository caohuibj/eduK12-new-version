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
  const practice = ariaLabel.includes('练习')
  const activeProgress = progress ?? (practice ? undefined : inheritedProgress)
  return (
  <section
    className="cognitive-focus-stage fixed inset-0 z-40 overflow-y-auto bg-slate-50"
    aria-label={ariaLabel}
    data-cognitive-focus-stage
  >
    {activeProgress && <div className="cognitive-focus-stage__progress" data-cognitive-focus-progress>
      {activeProgress.total != null && activeProgress.total > 0
        ? <CognitiveProgress current={activeProgress.completed} total={activeProgress.total} label={activeProgress.label ?? `${practice ? '练习' : '正式测验'} · 已完成 / 总量`} />
        : <p className="cognitive-focus-stage__adaptive">自适应测验 · 已完成 <strong>{activeProgress.completed}</strong> 题<span>总题量随作答表现调整</span></p>}
    </div>}
    <div className="cognitive-focus-stage__body" data-has-progress={Boolean(activeProgress)}>
      <div className="cognitive-focus-stage__task w-full">{children}</div>
    </div>
  </section>
  )
}
