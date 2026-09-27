const DATABASE = 'huisurvey-cognitive-start-v1'
const STORE = 'intents'
const validIntent = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
const legacyKey = (token: string) => `cognitive:start-intent:${token}`
const unavailable = () => new Error('此浏览器无法安全保存匿名作答记录，请启用站点存储后重试；尚未开始新的作答。')

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

const readLegacy = (token: string): string => {
  try {
    const value = window.localStorage.getItem(legacyKey(token))
    return validIntent(value) ? value : ''
  } catch { return '' }
}

const removeMigratedLegacy = (token: string): void => {
  // IndexedDB is the authoritative store. A blocked legacy storage API must
  // not invalidate an already committed admission intent.
  try { window.localStorage.removeItem(legacyKey(token)) } catch { /* legacy cleanup only */ }
}

/**
 * Read/creation/explicit rotation share one readwrite transaction. Transactions
 * on this store serialize across independent tabs/connections; a localStorage
 * read followed by setItem cannot provide that guarantee.
 *
 * Resolve only on transaction completion, never on a successful put request:
 * the START HTTP request must not precede durable local transaction commit.
 * Keep the intent after server acknowledgement so a second tab/reload can
 * recover the same admission. Only an explicit new-person action rotates it.
 */
const accessIntent = (
  accessToken: string,
  operation: 'READ' | 'CREATE' | 'ROTATE',
  expectedIntent?: string,
): Promise<string> => new Promise((resolve, reject) => {
  if (!accessToken || typeof window === 'undefined' || !window.indexedDB) {
    reject(unavailable())
    return
  }
  let settled = false
  const fail = () => {
    if (settled) return
    settled = true
    reject(unavailable())
  }
  let request: IDBOpenDBRequest
  try { request = window.indexedDB.open(DATABASE, 1) } catch { fail(); return }
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
  }
  request.onerror = fail
  request.onblocked = fail
  request.onsuccess = () => {
    const db = request.result
    if (settled) { db.close(); return }
    db.onversionchange = () => db.close()
    let transaction: IDBTransaction
    try { transaction = db.transaction(STORE, 'readwrite') } catch { db.close(); fail(); return }
    let value = ''
    transaction.onabort = () => { db.close(); fail() }
    transaction.onerror = () => { /* onabort settles the operation */ }
    transaction.oncomplete = () => {
      db.close()
      if (settled) return
      settled = true
      if (value) removeMigratedLegacy(accessToken)
      resolve(value)
    }
    const store = transaction.objectStore(STORE)
    const read = store.get(accessToken)
    read.onsuccess = () => {
      try {
        // Never silently replace a corrupt committed record: that could create
        // an additional server admission when the previous response was lost.
        if (read.result !== undefined && !validIntent(read.result)) throw unavailable()
        value = validIntent(read.result) ? read.result : readLegacy(accessToken)
        const rotate = operation === 'ROTATE' && (!value || value === expectedIntent)
        if (rotate || (!value && operation === 'CREATE')) value = createCognitiveStartIntent()
        if (value && value !== read.result) store.put(value, accessToken)
      } catch { transaction.abort() }
    }
  }
})

export const readCognitiveStartIntent = (accessToken: string): Promise<string> => accessIntent(accessToken, 'READ')
export const getOrCreateCognitiveStartIntent = (accessToken: string): Promise<string> => accessIntent(accessToken, 'CREATE')

/** Explicitly start a different person's admission; stale concurrent rotations
 * converge on the already-rotated intent rather than creating more sessions. */
export const rotateCognitiveStartIntent = (accessToken: string, expectedIntent: string): Promise<string> => (
  accessIntent(accessToken, 'ROTATE', expectedIntent)
)
