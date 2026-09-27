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
      const response = await sessionFetch(`${artifact.downloadUrl}/status`, { cache: 'no-store' })
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
