import { useCallback, useMemo, type ReactNode } from 'react'
import AssessmentImageGate from '../assessment-media/AssessmentImageGate'
import type { SituationalRunnerStimulus } from './types'
import { loadAuthorImage } from './OnlineImageField'

/** Preview uses the saved, authorized draft reference, with the same loading gate as a real attempt. */
export function AuthorPreviewMedia({ draftId, stimulus, children, disabled = false }: {
  draftId: string; stimulus: SituationalRunnerStimulus; children: ReactNode; disabled?: boolean
}) {
  const items = useMemo(() => stimulus.type === 'IMAGE'
    ? [{ asset: stimulus.asset, altText: stimulus.altText, caption: stimulus.caption }]
    : stimulus.type === 'COMIC' ? stimulus.panels.map(p => ({ asset: p.assetRef, altText: p.altText, caption: p.caption })) : [], [stimulus])
  const loadImage = useCallback((assetId: string) => loadAuthorImage(assetId, draftId), [draftId])
  return <>
    {stimulus.text && <p className="whitespace-pre-wrap">{stimulus.text}</p>}
    <AssessmentImageGate items={items} loadAsset={loadImage} disabled={disabled} ariaLabel="草稿情境图片预览">
      {children}
    </AssessmentImageGate>
  </>
}
