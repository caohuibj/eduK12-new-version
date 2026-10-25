'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

// Execute the consumer's publication handshake only. This is a script contract,
// not browser, backend permission, or C20 end-to-end qualification.
const source = fs.readFileSync(path.join(__dirname, 'training-materials-browser.cjs'), 'utf8')
const start = source.indexOf('  const published = teacher.waitForResponse(')
const end = source.indexOf("  product = ok(await api(teacher, '/questionnaire-products/' + product.id))", start)
assert.ok(start >= 0 && end > start)
const handshake = source.slice(start, end)

async function runHandshake({ missingDialog = false, status = 200 } = {}) {
  const events = []
  let respond
  const teacher = {
    waitForResponse(predicate) {
      assert.equal(predicate({ url: () => 'https://example.test/api/questionnaire-products/synthetic/publish', request: () => ({ method: () => 'POST' }) }), true)
      assert.equal(predicate({ url: () => 'https://example.test/api/questionnaire-products/synthetic/publish', request: () => ({ method: () => 'GET' }) }), false)
      events.push('listen')
      return new Promise(resolve => { respond = resolve })
    },
    getByRole(role, options) {
      if (role === 'button') {
        assert.deepEqual(options, { name: '发布组合测评', exact: true })
        return { async click() { events.push('open') } }
      }
      assert.equal(role, 'dialog')
      assert.deepEqual(options, { name: '确认发布组合测评', exact: true })
      assert.deepEqual(events, ['listen', 'open'])
      return { getByRole(buttonRole, buttonOptions) {
        assert.equal(buttonRole, 'button')
        assert.deepEqual(buttonOptions, { name: '确认发布', exact: true })
        return { async click() {
          if (missingDialog) throw new Error('Required confirmation missing')
          events.push('confirm')
          respond({ status: () => status })
        } }
      } }
    },
  }
  // Use this realm's function constructor so locator objects retain normal
  // prototypes for strict assertions. No application/fixture bootstrap executes.
  const execute = vm.runInThisContext(`(async (teacher, product, assert) => {${handshake}\n})`)
  await execute(teacher, { id: 'synthetic' }, assert)
  assert.deepEqual(events, ['listen', 'open', 'confirm'])
}

test('publication waits for an exact required UI confirmation before accepting POST', async () => {
  await runHandshake()
})
test('missing confirmation fails instead of silently skipping the dialog', async () => {
  await assert.rejects(runHandshake({ missingDialog: true }), /Required confirmation missing/)
})
test('confirmation does not weaken the publication response assertion', async () => {
  await assert.rejects(runHandshake({ status: 403 }), { code: 'ERR_ASSERTION' })
})
test('dialog selectors correspond to the production Training confirmation contract', () => {
  const read = file => fs.readFileSync(path.join(__dirname, '../frontend/src', file), 'utf8')
  assert.match(read('pages/questionnaire/QuestionnaireProducts.tsx'), /trainingDesign && !await confirmManagement\(\{ title: '确认发布组合测评', body: '[^']+', confirmLabel: '确认发布' \}\)/)
  assert.match(read('components/staff-ui/useStaffFeedback.tsx'), /<ManagementDialog[^>]+title=\{pending\?\.title/)
  const dialog = read('components/staff-ui/ManagementDialog.tsx')
  assert.match(dialog, /role="dialog"[^>]+aria-labelledby=\{titleId\}/)
  assert.match(dialog, /<h2 id=\{titleId\}>\{title\}<\/h2>/)
})
