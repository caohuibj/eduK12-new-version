import { useEffect, useRef, useState } from 'react'
import { sessionFetch } from '../api/client'
import { triggerExportDownload } from '../utils/exportJobs'

/** One pending export per task; separate tasks can still export independently. */
export function useTaskExport(onError: (message: string) => void) {
  const pending = useRef(new Set<string>())
  const alive = useRef(true)
  const [exporting, setExporting] = useState<Set<string>>(new Set())
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  async function exportTask(id: string, path: string, fileName: string) {
    if (pending.current.has(id) || !alive.current) return
    pending.current.add(id)
    setExporting(new Set(pending.current))
    try {
      const response = await sessionFetch(path)
      if (!response.ok) throw new Error('导出失败')
      const blob = await response.blob()
      triggerExportDownload(blob, fileName)
    } catch (cause) {
      if (alive.current) onError(cause instanceof Error ? cause.message : '导出失败')
    } finally {
      pending.current.delete(id)
      if (alive.current) setExporting(new Set(pending.current))
    }
  }
  return { exporting, exportTask }
}
