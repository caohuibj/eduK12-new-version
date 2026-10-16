import type { ApiResponse } from '../../types'
import type { WholeQuestionnaireReceipt } from './types'
import { normalizeApiError } from '../../utils/normalizeApiError'
export type WholeReceiptLookup = WholeQuestionnaireReceipt | { status: 'NOT_RECEIVED'; attemptId: string; submissionId: string }
export const readMatchingWholeReceipt = async (read: (() => Promise<ApiResponse<WholeReceiptLookup>>) | undefined,
  attemptId: string, submissionId: string): Promise<WholeQuestionnaireReceipt | null> => {
  if (!read) return null
  const response = await read()
  if (response.code !== 0 || !response.data) throw new Error(response.message || '交卷回执暂时无法确认；原草稿已保留。')
  const receipt = response.data
  if (receipt.attemptId !== attemptId || receipt.submissionId !== submissionId) throw new Error('交卷回执不匹配，原草稿已保留。')
  if (receipt.status === 'NOT_RECEIVED') return null
  if (receipt.status !== 'ACCEPTED' || !receipt.payloadHash) throw new Error('交卷回执不完整，原草稿已保留。')
  return receipt
}
export const rememberWholeReceipt = (receipt: WholeQuestionnaireReceipt) => {
  try {
    localStorage.setItem('composite:whole-receipt:' + receipt.attemptId, JSON.stringify({
      attemptId: receipt.attemptId, submissionId: receipt.submissionId, payloadHash: receipt.payloadHash,
      acceptedAt: receipt.acceptedAt, storedAt: Date.now(),
    }))
  } catch { /* The database receipt remains authoritative. */ }
}
export const isRecoverableReceiptError = (cause: unknown) => {
  const error = normalizeApiError(cause)
  return !error.status || [408,429,500,502,503,504].includes(error.status)
}
/** Read-only retries only; callers keep their bounded polling budget and recovery link. */
export const withReportReadRecovery = async <T>(read: () => Promise<T>, signal: AbortSignal,
  sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    try { return await read() } catch (cause) {
      if (signal.aborted || attempt >= 2 || !isRecoverableReceiptError(cause)) throw cause
      const minimum = normalizeApiError(cause).retryAfterMs ?? 0
      await sleep(Math.max(minimum, Math.min(4000, 750 * 2 ** attempt)) + Math.floor(Math.random() * 250))
    }
  }
}
