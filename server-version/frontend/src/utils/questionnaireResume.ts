const keyFor = (token: string): string => `questionnaire_resume_${token}`

export const saveQuestionnaireResumeToken = (
  questionnaireToken: string,
  sessionId: string,
  resumeToken: string,
): void => {
  if (typeof window === 'undefined' || !resumeToken) return
  window.sessionStorage.setItem(keyFor(questionnaireToken), JSON.stringify({ sessionId, resumeToken }))
}

export const readQuestionnaireResumeToken = (
  questionnaireToken: string | undefined,
  sessionId: string | null,
): string => {
  if (typeof window === 'undefined' || !questionnaireToken || !sessionId) return ''

  try {
    const raw = window.sessionStorage.getItem(keyFor(questionnaireToken))
    if (!raw) return ''
    const stored = JSON.parse(raw) as { sessionId?: unknown; resumeToken?: unknown }
    return stored.sessionId === sessionId && typeof stored.resumeToken === 'string'
      ? stored.resumeToken
      : ''
  } catch {
    return ''
  }
}

export const questionnaireResumeHeaders = (
  questionnaireToken: string | undefined,
  sessionId: string | null,
): Record<string, string> => {
  const resumeToken = readQuestionnaireResumeToken(questionnaireToken, sessionId)
  return resumeToken ? { Authorization: `Bearer ${resumeToken}` } : {}
}
