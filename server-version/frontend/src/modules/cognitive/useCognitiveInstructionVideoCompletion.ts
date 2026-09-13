import { useCallback, useEffect, useState } from 'react'
import {
  markRequiredVideoComplete,
  readRequiredVideoCompletion,
  type RequiredVideoCompletionIdentity,
} from '../assessment-media/required-video-completion'
import type { CognitiveSession } from './types'
import type { CognitiveVideoPresentationEntry } from './video-presentation'

const identityFor = (
  sessionId: string,
  entry: Pick<CognitiveVideoPresentationEntry, 'key' | 'slot' | 'index' | 'presentation'>,
): RequiredVideoCompletionIdentity => ({
  draftKey: `cognitive:${sessionId}`,
  slotKey: `cognitive-${entry.slot}:${entry.index}:video`,
  assetId: entry.presentation.video.assetId,
  contentHash: entry.presentation.video.contentHash,
})

type FrozenInstructionVideoIdentity = {
  key: string
  slot: CognitiveVideoPresentationEntry['slot']
  index: number
  presentation: CognitiveVideoPresentationEntry['presentation']
}

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
  const sessionId = session?.sessionId ?? ''
  // The effect must follow frozen media identity, not the caller's array/object
  // reference identity. This avoids re-reading IndexedDB indefinitely when an
  // equivalent entries array is recreated during an internal state render.
  const identityKey = JSON.stringify(entries.map((entry) => ({
    key: entry.key,
    slot: entry.slot,
    index: entry.index,
    presentation: {
      schemaVersion: entry.presentation.schemaVersion,
      video: {
        assetId: entry.presentation.video.assetId,
        contentHash: entry.presentation.video.contentHash,
        mimeType: entry.presentation.video.mimeType,
      },
    },
  })))
  const [completed, setCompleted] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Preserve the existing MEDIA-3/7 no-video contract: no frozen instruction
    // video means this adapter schedules no state update and no extra render.
    if (!required || !sessionId) return undefined

    const frozenEntries = JSON.parse(identityKey) as FrozenInstructionVideoIdentity[]
    let cancelled = false
    setCompleted({})
    setLoading(true)
    setError(null)
    void Promise.all(frozenEntries.map(async (entry) => {
      const marker = await readRequiredVideoCompletion(identityFor(sessionId, entry))
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
  }, [identityKey, required, sessionId])

  const markComplete = useCallback(async (entry: CognitiveVideoPresentationEntry) => {
    if (!required || !sessionId) return
    await markRequiredVideoComplete(identityFor(sessionId, entry))
    setCompleted((current) => ({ ...current, [entry.key]: true }))
  }, [required, sessionId])

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
