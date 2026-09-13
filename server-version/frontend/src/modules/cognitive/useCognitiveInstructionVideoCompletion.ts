import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  markRequiredVideoComplete,
  readRequiredVideoCompletion,
  type RequiredVideoCompletionIdentity,
} from '../assessment-media/required-video-completion'
import type { CognitiveSession } from './types'
import type { CognitiveVideoPresentationEntry } from './video-presentation'

const identityFor = (
  session: CognitiveSession,
  entry: CognitiveVideoPresentationEntry,
): RequiredVideoCompletionIdentity => ({
  draftKey: `cognitive:${session.sessionId}`,
  slotKey: `cognitive-${entry.slot}:${entry.index}:video`,
  assetId: entry.presentation.video.assetId,
  contentHash: entry.presentation.video.contentHash,
})

/**
 * FE-07A only requires complete viewing for pre-start Cognitive instruction
 * videos on FINAL_ONLY sessions. Example/stimulus videos remain task-owned and
 * are never promoted into a generic Shell timeline.
 */
export const useCognitiveInstructionVideoCompletion = (
  session: CognitiveSession | null,
  entries: readonly CognitiveVideoPresentationEntry[],
) => {
  const required = session?.deliveryMode === 'FINAL_ONLY' && entries.length > 0
  const identityKey = useMemo(() => entries.map((entry) => (
    `${entry.key}:${entry.presentation.video.assetId}:${entry.presentation.video.contentHash}`
  )).join('|'), [entries])
  const [completed, setCompleted] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!required || !session) {
      setCompleted({})
      setLoading(false)
      setError(null)
      return () => { cancelled = true }
    }

    setLoading(true)
    setError(null)
    void Promise.all(entries.map(async (entry) => {
      const marker = await readRequiredVideoCompletion(identityFor(session, entry))
      return [entry.key, Boolean(marker)] as const
    })).then((pairs) => {
      if (cancelled) return
      setCompleted(Object.fromEntries(pairs))
      setLoading(false)
    }).catch(() => {
      if (cancelled) return
      setCompleted({})
      setLoading(false)
      setError('无法读取本机视频观看完成状态，请重新完整观看。')
    })

    return () => { cancelled = true }
  }, [entries, identityKey, required, session])

  const markComplete = useCallback(async (entry: CognitiveVideoPresentationEntry) => {
    if (!required || !session) return
    await markRequiredVideoComplete(identityFor(session, entry))
    setCompleted((current) => ({ ...current, [entry.key]: true }))
  }, [required, session])

  const allComplete = !required || entries.every((entry) => completed[entry.key] === true)

  return {
    required,
    loading,
    error,
    allComplete,
    isComplete: (entry: CognitiveVideoPresentationEntry) => !required || completed[entry.key] === true,
    markComplete,
  }
}
