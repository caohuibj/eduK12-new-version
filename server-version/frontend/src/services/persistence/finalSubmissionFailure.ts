import { normalizeApiError } from '../../utils/normalizeApiError'
import { checkpointId } from './checkpointTypes'
import { finalDraftStore } from './finalDraftStore'

/** Only an explicit pre-commit form rejection permits editing a sealed FINAL. */
export const recordFinalSubmissionFailure = async (draftKey: string, cause: unknown, submittedId?: string) => {
  const error = normalizeApiError(cause)
  const current = await finalDraftStore.get(draftKey)
  if (!current) return null
  if (current.status === 'DRAFT' && !current.sealedSubmission) return current
  // A response from an older request cannot reopen a later submission.
  if (submittedId && submittedId !== current.submissionId) return current
  if (error.code === 'FORM_ANSWER_INVALID' && error.status === 400) {
    if (!submittedId) return current
    return finalDraftStore.reopenRejectedForm(draftKey, {
      code: 'FORM_ANSWER_INVALID', submissionId: submittedId, nextSubmissionId: checkpointId(),
    })
  }
  const code = String(error.code ?? '')
  const conflict = code === 'STALE_ATTEMPT' || code === 'DEFINITION_MISMATCH'
    || (code === 'SUBMISSION_PAYLOAD_CONFLICT' && error.status !== 400)
    || (error.status === 409 && !code) || code === '409'
  return finalDraftStore.setStatus(draftKey, conflict ? 'CONFLICT' : 'RETRY_PENDING', { code, message: error.message })
}
