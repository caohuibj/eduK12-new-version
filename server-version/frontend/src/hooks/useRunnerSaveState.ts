import { useCallback, useRef, useState } from 'react'

/** Small shared save gate for assessment runners. It serializes writes and
 * exposes the same disabled state to answer controls and navigation. */
export function useRunnerSaveState() {
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  const runSave = useCallback(async <T>(operation: () => Promise<T>): Promise<T | undefined> => {
    if (savingRef.current) return undefined
    savingRef.current = true
    setSaving(true)
    try {
      return await operation()
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [])

  return { saving, savingRef, runSave }
}

export default useRunnerSaveState
