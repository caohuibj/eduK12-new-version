import { useEffect, useRef, useState } from 'react'
import { sessionFetch } from '../api/client'
import { triggerExportDownload } from '../utils/exportJobs'

const EXPORT_ERROR_FALLBACK = '导出失败'
const MAX_ERROR_BYTES = 8192
const MAX_ERROR_MESSAGE_LENGTH = 300

/** Read only small JSON error envelopes; never download or render a server error body. */
async function exportErrorMessage(response: Response): Promise<string> {
  try {
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) return EXPORT_ERROR_FALLBACK
    const reader = response.body?.getReader()
    if (!reader) return EXPORT_ERROR_FALLBACK
    let text = ''
    let bytes = 0
    const decoder = new TextDecoder()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > MAX_ERROR_BYTES) {
          await reader.cancel()
          return EXPORT_ERROR_FALLBACK
        }
        text += decoder.decode(value, { stream: true })
      }
      text += decoder.decode()
    } finally {
      reader.releaseLock()
    }
    const payload: unknown = JSON.parse(text)
    if (!payload || typeof payload !== 'object' || !('message' in payload) || typeof payload.message !== 'string') return EXPORT_ERROR_FALLBACK
    // A plain string is passed to the UI, with markup and control characters rejected.
    const message = payload.message.trim()
    if (!message || /[<>\p{Cc}\p{Cf}]/u.test(message)) return EXPORT_ERROR_FALLBACK
    return message.slice(0, MAX_ERROR_MESSAGE_LENGTH)
  } catch {
    return EXPORT_ERROR_FALLBACK
  }
}

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
      if (!response.ok) throw new Error(await exportErrorMessage(response))
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
