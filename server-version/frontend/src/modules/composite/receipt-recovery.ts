import type { ApiResponse } from '../../types'
import type { WholeQuestionnaireReceipt } from './types'
import { normalizeApiError } from '../../utils/normalizeApiError'
import { completionRetryDelayMs, isCompletionBusyError } from '../../services/completionRetry'
export type WholeReceiptLookup = WholeQuestionnaireReceipt | { status: 'NOT_RECEIVED'; attemptId: string; submissionId: string }
type WholeReceiptProbe = WholeReceiptLookup | { status: 'UNKNOWN' }
type ReadWholeReceipt = () => Promise<ApiResponse<WholeReceiptLookup>>

const readMatchingWholeReceipt = async (read: ReadWholeReceipt, attemptId: string, submissionId: string): Promise<WholeReceiptLookup> => {
  const response = await read()
  if (response.code !== 0 || !response.data) {
    throw Object.assign(new Error(response.message || '交卷回执暂时无法确认；原草稿已保留。'), {
      code: response.code,
      status: typeof response.code === 'number' && response.code >= 400 && response.code <= 599 ? response.code : undefined,
      retryable: true,
    })
  }
  const receipt = response.data
  if (receipt.attemptId !== attemptId || receipt.submissionId !== submissionId) {
    throw Object.assign(new Error('交卷回执不匹配，原草稿已保留。'), {
      status: 409,
      code: 'SUBMISSION_PAYLOAD_CONFLICT',
      retryable: false,
    })
  }
  if (receipt.status === 'NOT_RECEIVED') return receipt
  if (receipt.status !== 'ACCEPTED' || !receipt.payloadHash) {
    throw Object.assign(new Error('交卷回执不完整，原草稿已保留。'), {
      status: 409,
      code: 'SUBMISSION_PAYLOAD_CONFLICT',
      retryable: false,
    })
  }
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
  if (error.status !== null) return [408, 429, 500, 502, 503, 504].includes(error.status)
  return error.retryable
}
/** A failed read gives no evidence about whether the POST was saved. */
export const recoverMatchingWholeReceiptSafe = async (
  read: ReadWholeReceipt,
  attemptId: string,
  submissionId: string,
): Promise<WholeReceiptProbe> => {
  try {
    return await readMatchingWholeReceipt(read, attemptId, submissionId)
  } catch (cause) {
    if (isRecoverableReceiptError(cause)) return { status: 'UNKNOWN' }
    throw cause
  }
}

/** Require two negative reads separated in time before replaying a sealed POST.
 * A POST that outlives both reads still uses the original idempotency key. */
export const confirmWholeReceiptAfterUncertainSubmit = async (
  read: ReadWholeReceipt,
  attemptId: string,
  submissionId: string,
  options: {
    sleep?: (ms: number) => Promise<void>
  } = {},
): Promise<WholeReceiptProbe> => {
  const first = await recoverMatchingWholeReceiptSafe(read, attemptId, submissionId)
  if (first.status === 'ACCEPTED') return first
  const sleep = options.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)))
  await sleep(1_500)
  const second = await recoverMatchingWholeReceiptSafe(read, attemptId, submissionId)
  if (second.status === 'ACCEPTED') return second
  return first.status === 'NOT_RECEIVED' && second.status === 'NOT_RECEIVED' ? second : { status: 'UNKNOWN' }
}
/** Read-only retries only; callers keep their bounded polling budget and recovery link. */
export const withReportReadRecovery = async <T>(read: () => Promise<T>, signal: AbortSignal,
  sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
  options: { completionBusyMaxAttempts?: number } = {}): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    try { return await read() } catch (cause) {
      const completionBusy = options.completionBusyMaxAttempts !== undefined && isCompletionBusyError(cause)
      const maxAttempts = completionBusy ? options.completionBusyMaxAttempts! : 3
      if (signal.aborted || attempt + 1 >= maxAttempts || !isRecoverableReceiptError(cause)) throw cause
      if (completionBusy) {
        await sleep(completionRetryDelayMs(cause))
        continue
      }
      const minimum = normalizeApiError(cause).retryAfterMs ?? 0
      await sleep(Math.max(minimum, Math.min(4000, 750 * 2 ** attempt)) + Math.floor(Math.random() * 250))
    }
  }
}
