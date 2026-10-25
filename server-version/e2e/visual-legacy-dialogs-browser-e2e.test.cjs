const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

// Load the actual consumer helper without installing/launching a browser.
// These are ordering contracts, not browser or rendered UI evidence.
const filename = require.resolve('./visual-legacy-dialogs-browser-e2e.cjs')
const source = fs.readFileSync(filename, 'utf8')
const sandbox = {
  module: { exports: {} }, process: { env: {} }, Buffer, URL, __filename: filename,
  require(name) {
    if (name.includes('playwright-core')) return {}
    if (name === './visual-canonical-browser-e2e.cjs') return { sampleCourse: { id: 'visual-course' } }
    if (name === './visual-failure-diagnostics.cjs') return {}
    return require(name)
  },
}
vm.runInNewContext(source, sandbox, { filename })
const { retryAssignmentAndWait } = sandbox.module.exports
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const response = (pathname, { method = 'GET', status = 200, finished = Promise.resolve(null) } = {}) => ({
  url: () => `http://127.0.0.1:5173${pathname}`,
  request: () => ({ method: () => method }), status: () => status, finished: () => finished,
})

function fixture() {
  const waiters = []
  let detached = false
  const page = { waitForResponse(predicate) { const item = deferred(); waiters.push({ predicate, ...item }); return item.promise } }
  const editor = {
    getByRole(role, options) {
      assert.equal(role, 'button'); assert.equal(options.name, '创建练习'); assert.equal(options.exact, true)
      return { async click() { assert.equal(waiters.length, 2, 'both reads are observed before retry click') } }
    },
    async waitFor(options) { assert.equal(options.state, 'detached'); detached = true },
  }
  return { page, editor, waiters, detached: () => detached }
}

test('successful retry waits for both remount response bodies after editor detaches', async () => {
  const f = fixture()
  const courses = deferred(); const assignments = deferred()
  let completed = false
  const pending = retryAssignmentAndWait(f.page, f.editor).then(() => { completed = true })
  f.waiters[0].resolve(response('/api/courses', { finished: courses.promise }))
  f.waiters[1].resolve(response('/api/assignments?view=summary&courseId=visual-course', { finished: assignments.promise }))
  await new Promise(setImmediate)
  assert.equal(f.detached(), true); assert.equal(completed, false)
  courses.resolve(null)
  await new Promise(setImmediate)
  assert.equal(completed, false, 'course readiness alone does not allow navigation')
  assignments.resolve(null)
  await pending
  assert.equal(completed, true)
})

test('remount waiters exclude writes, initial unfiltered list, and unrelated course reads', async () => {
  const f = fixture(); const pending = retryAssignmentAndWait(f.page, f.editor)
  const courses = f.waiters[0].predicate; const assignments = f.waiters[1].predicate
  assert.equal(courses(response('/api/courses')), true)
  assert.equal(courses(response('/api/courses/shared-to-me')), false)
  assert.equal(courses(response('/api/courses', { method: 'POST' })), false)
  for (const url of ['/api/assignments?view=summary', '/api/assignments?courseId=visual-course', '/api/assignments?view=summary&courseId=other']) assert.equal(assignments(response(url)), false)
  assert.equal(assignments(response('/api/assignments?view=summary&courseId=visual-course', { method: 'POST' })), false)
  const matched = response('/api/assignments?view=summary&page=1&courseId=visual-course')
  assert.equal(assignments(matched), true)
  f.waiters[0].resolve(response('/api/courses')); f.waiters[1].resolve(matched)
  await pending
})

test('failed HTTP response or interrupted body remains a failure, not readiness', async () => {
  for (const options of [{ status: 503 }, { finished: Promise.resolve(new Error('interrupted')) }]) {
    const f = fixture(); const pending = retryAssignmentAndWait(f.page, f.editor)
    f.waiters[0].resolve(response('/api/courses', options))
    f.waiters[1].resolve(response('/api/assignments?view=summary&courseId=visual-course'))
    await assert.rejects(pending, /remount read (succeeds|finishes)/)
  }
})
