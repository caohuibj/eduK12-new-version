import test from 'node:test'
import assert from 'node:assert/strict'
import { withLockTimeout, DEFAULT_LOCK_TIMEOUT_MS } from './migrate-deploy-bounded.mjs'

test('appends options with lock_timeout to a bare URL', () => {
  const out = withLockTimeout('postgresql://u:p@127.0.0.1:5432/db')
  const url = new URL(out)
  assert.equal(url.searchParams.get('options'), `-c lock_timeout=${DEFAULT_LOCK_TIMEOUT_MS}`)
  assert.equal(url.pathname, '/db')
})

test('appends to an existing query string with &', () => {
  const out = withLockTimeout('postgresql://u:p@127.0.0.1:5432/db?schema=public')
  const url = new URL(out)
  assert.equal(url.searchParams.get('schema'), 'public')
  assert.equal(url.searchParams.get('options'), `-c lock_timeout=${DEFAULT_LOCK_TIMEOUT_MS}`)
})

test('uses the requested timeout value', () => {
  const out = withLockTimeout('postgresql://u:p@127.0.0.1:5432/db?schema=public', 5000)
  assert.equal(new URL(out).searchParams.get('options'), '-c lock_timeout=5000')
})

test('preserves an existing options value and appends the setting', () => {
  const out = withLockTimeout('postgresql://u:p@127.0.0.1:5432/db?options=-c%20statement_timeout%3D10000')
  assert.equal(
    new URL(out).searchParams.get('options'),
    `-c statement_timeout=10000 -c lock_timeout=${DEFAULT_LOCK_TIMEOUT_MS}`,
  )
})

test('leaves the URL untouched when options already sets lock_timeout', () => {
  const input = 'postgresql://u:p@127.0.0.1:5432/db?options=-c%20lock_timeout%3D2000'
  assert.equal(withLockTimeout(input, 30000), input)
})

test('round-trips through URL parsing (the value the engine receives)', () => {
  const out = withLockTimeout('postgresql://u:p@127.0.0.1:5432/db?schema=public', 2000)
  // The engine receives the decoded value; the raw encoding may use + or
  // %20 for the space, both decode to a space.
  assert.equal(new URL(out).searchParams.get('options'), '-c lock_timeout=2000')
  assert.ok(out.includes('lock_timeout%3D2000'), out)
})
