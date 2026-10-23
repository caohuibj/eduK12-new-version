import type { ReactNode } from 'react'
import type { AssessmentImagePresentationItem } from './types'
import { deferredAssessmentMedia } from './deferred-media'

export interface AssessmentImageGateProps {
  items: readonly AssessmentImagePresentationItem[]
  loadAsset: (assetId: string) => Promise<Blob>
  children: ReactNode
  disabled?: boolean
  ariaLabel?: string
}

const MediaGate = deferredAssessmentMedia<AssessmentImageGateProps>(() => import('./AssessmentImageGateContent').then(module => module.default))

export default function AssessmentImageGate(props: AssessmentImageGateProps) {
  if (props.items.length) return <MediaGate {...props} />
  return <div data-assessment-image-gate="ready"><fieldset disabled={props.disabled}>{props.children}</fieldset></div>
}
