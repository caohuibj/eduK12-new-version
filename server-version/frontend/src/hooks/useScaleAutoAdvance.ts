import { useEffect, useRef, useState } from 'react'

/** An explicit single-choice event may advance; restored values never do. */
export function useScaleAutoAdvance<Value>({ questionKey, enabled, disabled, hasNext, onSave, onNext }: {
  questionKey: string
  enabled: boolean
  disabled: boolean
  hasNext: boolean
  onSave: (value: Value) => void | boolean | Promise<void | boolean>
  onNext?: () => void | Promise<void>
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const navigation = useRef({hasNext,onNext})
  navigation.current = {hasNext,onNext}
  const identity = useRef(questionKey)
  const blocked = useRef(disabled)
  const generation = useRef(0)
  const pending = useRef(false)
  const alive = useRef(true)
  const pause = useRef<{ timer: ReturnType<typeof setTimeout>; release: () => void } | null>(null)
  const [busy, setBusy] = useState(false)
  identity.current = questionKey
  blocked.current = disabled

  useEffect(() => {
    alive.current = true
    pending.current = false
    setBusy(false)
    if (enabled) headingRef.current?.focus()
    return () => {
      alive.current = false
      generation.current += 1
      if (pause.current) {
        clearTimeout(pause.current.timer)
        pause.current.release()
        pause.current = null
      }
    }
  }, [enabled, questionKey])

  const select = async (value: Value) => {
    if (blocked.current || pending.current) return
    if (!enabled) { await onSave(value); return }
    const selectedGeneration = generation.current
    const selectedQuestion = questionKey
    pending.current = true
    setBusy(true)
    try {
      const saved = await onSave(value)
      if (saved === false || !alive.current || identity.current !== selectedQuestion || generation.current !== selectedGeneration || !navigation.current.hasNext || !navigation.current.onNext) return
      // Keep the selected choice visible briefly and consume rapid repeated clicks
      // on this question before exposing the next question's choices.
      await new Promise<void>(release => {
        pause.current = { timer: setTimeout(release, 220), release }
      })
      pause.current = null
      if (alive.current && identity.current === selectedQuestion && generation.current === selectedGeneration && !blocked.current && navigation.current.hasNext) await navigation.current.onNext?.()
    } catch {
      // Save owners already expose their existing error feedback. Stay here.
    } finally {
      if (alive.current && identity.current === selectedQuestion && generation.current === selectedGeneration) {
        pending.current = false
        setBusy(false)
      }
    }
  }

  return { select, busy, headingRef }
}
