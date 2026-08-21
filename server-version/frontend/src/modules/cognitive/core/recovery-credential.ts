const keyForSession = (sessionId: string) => `cognitive:recovery:${sessionId}`

export const saveCognitiveRecoveryCredential = (sessionId: string, token: string) => {
  if (typeof window !== 'undefined') window.sessionStorage.setItem(keyForSession(sessionId), token)
}

export const readCognitiveRecoveryCredential = (sessionId: string): string => {
  if (typeof window === 'undefined') return ''
  return window.sessionStorage.getItem(keyForSession(sessionId)) || ''
}
