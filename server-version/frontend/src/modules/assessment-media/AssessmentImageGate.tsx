import React from 'react'
import AssessmentImagePresentation from './AssessmentImagePresentation'
import type { AssessmentImagePresentationItem } from './types'
import { useAssessmentImageAssets } from './useAssessmentImageAssets'

export interface AssessmentImageGateProps {
  items: readonly AssessmentImagePresentationItem[]
  loadAsset: (assetId: string) => Promise<Blob>
  children: React.ReactNode
  disabled?: boolean
  ariaLabel?: string
}

const AssessmentImageGate: React.FC<AssessmentImageGateProps> = ({
  items,
  loadAsset,
  children,
  disabled = false,
  ariaLabel,
}) => {
  const state = useAssessmentImageAssets(items, loadAsset)
  const visualBusy = state.status !== 'ready'
  return (
    <div data-assessment-image-gate={visualBusy ? state.status : 'ready'}>
      <AssessmentImagePresentation items={items} state={state} ordered={items.length > 1} ariaLabel={ariaLabel} />
      <fieldset disabled={disabled || visualBusy} className={visualBusy ? 'opacity-70' : undefined}>
        {children}
      </fieldset>
    </div>
  )
}

export default AssessmentImageGate
