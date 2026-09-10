const keyFor = (token: string): string => `questionnaire_resume_${token}`
const RESUME_PREFIX = 'questionnaire_resume_'

export const readQuestionnaireSessionId = (questionnaireToken: string | undefined): string | null => {
  if (typeof window === 'undefined' || !questionnaireToken) return null

  try {
    const raw = window.sessionStorage.getItem(keyFor(questionnaireToken))
    if (!raw) return null
    const stored = JSON.parse(raw) as { sessionId?: unknown }
    return typeof stored.sessionId === 'string' && stored.sessionId ? stored.sessionId : null
  } catch {
    return null
  }
}

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
  sessionId: string | null | undefined,
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

export const readQuestionnaireResumeTokenForSession = (sessionId: string | null | undefined): string => {
  if (typeof window === 'undefined' || !sessionId) return ''
  try {
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index)
      if (!key?.startsWith(RESUME_PREFIX)) continue
      const raw = window.sessionStorage.getItem(key)
      if (!raw) continue
      const stored = JSON.parse(raw) as { sessionId?: unknown; resumeToken?: unknown }
      if (stored.sessionId === sessionId && typeof stored.resumeToken === 'string') return stored.resumeToken
    }
    return ''
  } catch {
    return ''
  }
}

export const questionnaireResumeHeaders = (
  questionnaireToken: string | undefined,
  sessionId: string | null | undefined,
): Record<string, string> => {
  const resumeToken = readQuestionnaireResumeToken(questionnaireToken, sessionId)
  return resumeToken ? { Authorization: `Bearer ${resumeToken}` } : {}
}
