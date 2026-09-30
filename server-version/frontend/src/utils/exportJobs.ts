import { sessionFetch } from '../api/client'

export type ExportArtifactRef = {
  id: string
  format: string
  fileName: string
  downloadUrl: string
}

export class ExportJobFailedError extends Error {
  constructor(message = '导出任务失败，请重新提交') {
    super(message)
    this.name = 'ExportJobFailedError'
  }
}

export const createExportRequestKey = (): string => {
  const webCrypto = globalThis.crypto
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID()
  if (typeof webCrypto?.getRandomValues !== 'function') {
    throw new Error('当前浏览器无法生成安全的导出请求标识')
  }
  const bytes = new Uint8Array(24)
  webCrypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const waitForExportArtifacts = async (
  artifacts: ExportArtifactRef[],
  timeoutMs = 10 * 60 * 1000,
): Promise<ExportArtifactRef[]> => {
  if (artifacts.length === 0) throw new Error('导出任务未返回文件元数据')
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const states = await Promise.all(artifacts.map(async (artifact) => {
      const response = await sessionFetch(`${artifact.downloadUrl}/status`, { cache: 'no-store', signal: AbortSignal.timeout(Math.min(15000, Math.max(1, deadline - Date.now()))) })
      if (response.status === 404 || response.status === 410) throw new ExportJobFailedError('导出文件已到期或不可用，请重新导出')
      if (!response.ok) throw new Error('无法读取导出任务状态')
      const payload = await response.json()
      if (payload?.code !== 0 || !payload?.data) throw new Error(payload?.message || '无法读取导出任务状态')
      return {
        ...artifact,
        ...payload.data,
        downloadUrl: payload.data.downloadUrl || artifact.downloadUrl,
        fileName: payload.data.fileName || artifact.fileName,
      } as ExportArtifactRef & { status: string; errorCode?: string | null }
    }))

    const failed = states.find((state) => state.status === 'FAILED')
    if (failed) throw new ExportJobFailedError(failed.errorCode ? `导出任务失败（${failed.errorCode}）` : undefined)
    if (states.every((state) => state.status === 'READY')) return states
    await sleep(1000)
  }

  throw new Error('导出任务仍在处理中，可稍后使用相同操作继续等待')
}

// Persist only an opaque idempotency key. A lost response or page refresh replays the same server intent.
export const getExportIntentKey = (scope: string): string => {
  const name = `export-intent:${scope}`
  const existing = sessionStorage.getItem(name)
  if (existing) return existing
  const key = createExportRequestKey()
  sessionStorage.setItem(name, key)
  return key
}
export const clearExportIntentKey = (scope: string): void => { sessionStorage.removeItem(`export-intent:${scope}`) }

/** Terminal conflicts require a fresh intent; transient transport failures replay the old one. */
export const requestExportIntent = async <T>(scope: string, request: (key: string) => Promise<T>): Promise<T> => {
  try { return await request(getExportIntentKey(scope)) }
  catch (error) {
    const apiError = error as { status?: number; response?: { status?: number } }
    const status = apiError?.status ?? apiError?.response?.status
    if (status === 404 || status === 409 || status === 410) {
      clearExportIntentKey(scope)
      throw new ExportJobFailedError('导出条件已变化或文件已失效，请重新导出')
    }
    throw error
  }
}
export const assertExportDownload = (response: Response): void => {
  if (response.status === 404 || response.status === 410) throw new ExportJobFailedError('导出文件已到期或不可用，请重新导出')
  if (!response.ok) throw new Error('下载导出文件失败')
}
