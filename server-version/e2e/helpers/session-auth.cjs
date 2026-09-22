const assert = require('node:assert/strict')

const isUnsafeMethod = (method) => !['GET', 'HEAD', 'OPTIONS'].includes(String(method || 'GET').toUpperCase())

const sessionJsonFetch = async (page, endpoint, init = {}) => page.evaluate(async ({ endpoint: pathName, requestInit }) => {
  const method = String(requestInit.method || 'GET').toUpperCase()
  const headers = new Headers(requestInit.headers || {})

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'same-origin' })
    const csrfBody = await csrfResponse.json().catch(() => null)
    const csrfToken = csrfBody?.data?.csrfToken
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken)
  }

  const response = await fetch(`/api${pathName}`, {
    ...requestInit,
    headers,
    credentials: 'same-origin',
  })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: response.status, body }
}, { endpoint, requestInit: init })

const readSessionUser = async (page) => page.evaluate(async () => {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: response.status, body }
})

const loginWithSession = async (page, {
  baseUrl,
  route,
  username,
  password,
  timeout = 30000,
  usernamePlaceholder = '请输入用户名',
  passwordPlaceholder = '请输入密码',
  submitName = '登录',
}) => {
  assert.ok(baseUrl, 'loginWithSession requires baseUrl')
  assert.ok(route, 'loginWithSession requires route')
  assert.ok(username, 'loginWithSession requires username')
  assert.ok(password, 'loginWithSession requires password')

  await page.goto(`${String(baseUrl).replace(/\/$/, '')}${route}`, { waitUntil: 'domcontentloaded', timeout })
  await page.getByPlaceholder(usernamePlaceholder).fill(username, { timeout })
  await page.getByPlaceholder(passwordPlaceholder).fill(password, { timeout })

  const loginResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/auth/login'
  ), { timeout })

  await page.getByRole('button', { name: submitName, exact: true }).click()
  const loginResponse = await loginResponsePromise
  assert.equal(loginResponse.status(), 200, `login HTTP ${loginResponse.status()}`)

  const session = await readSessionUser(page)
  assert.equal(session.status, 200, `session verification HTTP ${session.status}`)
  assert.equal(session.body?.code, 0, `session verification: ${session.body?.message || 'API error'}`)
  assert.ok(session.body?.data?.id, 'session verification returned no user')
  return session.body.data
}

module.exports = {
  isUnsafeMethod,
  loginWithSession,
  readSessionUser,
  sessionJsonFetch,
}
