const keyForAccessToken = (token: string) => `cognitive:start-intent:${token}`

const base64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export const createCognitiveStartIntent = (): string => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

/**
 * Persist before the first START request. localStorage is intentionally used
 * rather than sessionStorage so simultaneously opened tabs share the same
 * idempotency secret. The secret is removed only after a recovery credential
 * has been durably stored by the client.
 */
export const readCognitiveStartIntent = (accessToken: string): string => {
  if (typeof window === 'undefined') return ''
  const value = window.localStorage.getItem(keyForAccessToken(accessToken)) || ''
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : ''
}

export const getOrCreateCognitiveStartIntent = (accessToken: string): string => {
  if (typeof window === 'undefined') return createCognitiveStartIntent()
  const key = keyForAccessToken(accessToken)
  const existing = window.localStorage.getItem(key)
  if (existing && /^[A-Za-z0-9_-]{43}$/.test(existing)) return existing
  const created = createCognitiveStartIntent()
  window.localStorage.setItem(key, created)
  return created
}

export const clearCognitiveStartIntent = (accessToken: string, intent: string): void => {
  if (typeof window === 'undefined') return
  const key = keyForAccessToken(accessToken)
  if (window.localStorage.getItem(key) === intent) window.localStorage.removeItem(key)
}
