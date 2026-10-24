import type { ReactNode } from 'react'
import type { AssessmentVideoCapabilitySources, AssessmentVideoPresentationV1 } from './types'
import { deferredAssessmentMedia } from './deferred-media'

export interface RequiredVideoGateContext {
  draftKey: string
  slotKey: string
}

export interface ScaleFormVideoGateProps {
  presentation?: AssessmentVideoPresentationV1
  loadSources: (presentation: AssessmentVideoPresentationV1) => Promise<AssessmentVideoCapabilitySources>
  children: ReactNode
  ariaLabel?: string
  requiredViewing?: RequiredVideoGateContext
}


const MediaGate = deferredAssessmentMedia<ScaleFormVideoGateProps>(() => import('./ScaleFormVideoGateContent').then(module => module.default))

export default function ScaleFormVideoGate(props: ScaleFormVideoGateProps) {
  return props.presentation ? <MediaGate {...props} /> : <>{props.children}</>
}
