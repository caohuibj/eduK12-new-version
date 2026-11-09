// X-05B shared-device hygiene: answer drafts that live outside the
// finalDraftStore (IndexedDB) are persisted per product in sessionStorage /
// localStorage under stable key prefixes. Logout and password change must
// clear the current account's carriers so the next user of a shared machine
// cannot read them. Product-scoped by design — never a blanket storage wipe,
// so anonymous Survey/Training drafts and unrelated app state survive.
const HUITEACHER_SESSION_DRAFT_PREFIXES = [
  'huiteacher:form:v1:',
  'huiteacher:personal-scale:v1:',
]

const removeSessionKeysWithPrefixes = (storage: Storage, prefixes: string[]) => {
  let removed = 0
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index)
    if (!key) continue
    if (prefixes.some(prefix => key.startsWith(prefix))) {
      storage.removeItem(key)
      removed += 1
    }
  }
  return removed
}

/** Drop the Teacher product's sessionStorage answer drafts. sessionStorage is
 * tab-scoped, so this clears the current tab's carriers; other tabs of the
 * same account lose server access through the session revocation. */
export const clearHuiteacherSessionDrafts = (): number => {
  if (typeof sessionStorage === 'undefined') return 0
  return removeSessionKeysWithPrefixes(sessionStorage, HUITEACHER_SESSION_DRAFT_PREFIXES)
}
