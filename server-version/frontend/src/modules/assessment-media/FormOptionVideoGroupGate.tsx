import type { ReactNode } from 'react'
import ScaleFormVideoGate from './ScaleFormVideoGate'
import type { AssessmentVideoCapabilitySources, AssessmentVideoPresentationV1 } from './types'

export interface FormOptionVideoEntry {
  optionIndex: number
  optionLabel: string
  presentation: AssessmentVideoPresentationV1
}

export interface FormOptionVideoGroupGateProps {
  entries: FormOptionVideoEntry[]
  loadSources: (entry: FormOptionVideoEntry) => Promise<AssessmentVideoCapabilitySources>
  children: ReactNode
}

const FormOptionVideoGroupGate = ({ entries, loadSources, children }: FormOptionVideoGroupGateProps) => {
  const renderAt = (index: number): ReactNode => {
    const entry = entries[index]
    if (!entry) return children
    return (
      <div className="space-y-2" data-form-option-video={entry.optionIndex}>
        <p className="text-sm font-medium text-gray-700">{entry.optionLabel}</p>
        <ScaleFormVideoGate
          presentation={entry.presentation}
          loadSources={() => loadSources(entry)}
          ariaLabel={`${entry.optionLabel} 视频内容`}
        >
          {renderAt(index + 1)}
        </ScaleFormVideoGate>
      </div>
    )
  }

  return <>{renderAt(0)}</>
}

export default FormOptionVideoGroupGate
