import type { ReactNode } from 'react'

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
}: {
  children: ReactNode
  ariaLabel?: string
}) => (
  <section
    className="fixed inset-0 z-40 overflow-y-auto bg-slate-50"
    aria-label={ariaLabel}
    data-cognitive-focus-stage
  >
    <div className="mx-auto flex min-h-full w-full max-w-3xl items-center justify-center px-4 py-6 sm:px-6 sm:py-10">
      <div className="w-full">{children}</div>
    </div>
  </section>
)
