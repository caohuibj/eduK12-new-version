const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loginWithSession } = require('./session-auth.cjs')
const { isAssetApiGet: isAssessmentAssetGet } = require('./asset-request.cjs')

test('the caller timeout reaches initial navigation and controls as well as login response', async () => {
  const calls = []
  const page = {
    goto: async (url, options) => calls.push(['goto', url, options]),
    getByPlaceholder: name => ({ fill: async (value, options) => calls.push(['fill', name, options]) }),
    getByRole: () => ({ click: async () => {} }),
    waitForResponse: async (predicate, options) => {
      calls.push(['response', options])
      assert.equal(predicate({ request: () => ({ method: () => 'POST' }), url: () => 'http://localhost/api/auth/login' }), true)
      return { status: () => 200 }
    },
    evaluate: async () => ({ status: 200, body: { code: 0, data: { id: 'fixture' } } }),
  }
  assert.equal((await loginWithSession(page, {
    baseUrl: 'http://localhost', route: '/student/login', username: 'fixture', password: 'fixture', timeout: 60000,
  })).id, 'fixture')
  assert.deepEqual(calls[0], ['goto', 'http://localhost/student/login', { waitUntil: 'domcontentloaded', timeout: 60000 }])
  assert.equal(calls.filter(call => call[0] === 'fill').every(call => call[2].timeout === 60000), true)
  assert.deepEqual(calls.at(-1), ['response', { timeout: 60000 }])
})

test('failed navigation stops before credentials or login requests', async () => {
  await assert.rejects(loginWithSession({
    goto: async () => { throw new Error('document unavailable') },
    getByPlaceholder: () => { assert.fail('must not enter credentials after failed navigation') },
  }, { baseUrl: 'http://localhost', route: '/student/login', username: 'fixture', password: 'fixture' }), /document unavailable/)
})

test('asset authorization guard counts protected API media but not built frontend chunks', () => {
  const request = path => ({ method: () => 'GET', url: () => 'http://localhost' + path })
  assert.equal(isAssessmentAssetGet(request('/assets/index-123.js')), false)
  assert.equal(isAssessmentAssetGet(request('/assets/index-123.css')), false)
  assert.equal(isAssessmentAssetGet(request('/api/assets/assessment-media/content?cap=test')), true)
  assert.equal(isAssessmentAssetGet(request('/api/public/composite-assessments/attempts/a/items/b/situational/c/assets/d/content')), true)
  assert.equal(isAssessmentAssetGet(request('/student/login?redirect=/assets/')), false)
})
