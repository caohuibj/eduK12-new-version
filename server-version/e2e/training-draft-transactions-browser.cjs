// The three transaction contracts skipped by answerReplacement.test.ts in jsdom.
// Uses the current real store in native Chromium, with no database or API writes.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { chromium } = require('../backend/node_modules/playwright-core')
const { transformSync } = require('../frontend/node_modules/esbuild')
const sourcePath = path.join(__dirname, '../frontend/src/services/persistence/finalDraftStore.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const base = process.env.SITUATIONAL_BUNDLE_E2E_BASE_URL || 'http://127.0.0.1:5173'
const output = process.env.SITUATIONAL_BUNDLE_E2E_SCREENSHOT_DIR || '/tmp/eduk12-situational-bundle-e2e'
const names = [
  'rolls back old-only deletion, shared updates, new-only insertion, and timing on a late abort',
  'rolls back answer requests if the final metadata write throws',
  'resolves only after the transaction completion event',
]
async function main() {
  assert.equal(process.env.NODE_ENV, 'test')
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname))
  const executablePath = [process.env.SITUATIONAL_BUNDLE_E2E_BROWSER_EXECUTABLE, chromium.executablePath(),
    '/usr/bin/google-chrome', '/usr/bin/chromium'].find(value => value && fs.existsSync(value))
  assert.ok(executablePath, 'Native Chromium is required; these contracts cannot skip')
  const script = transformSync(source, { loader: 'ts', format: 'iife', globalName: 'TrainingDraft', target: 'es2020' }).code
  const result = { status: 'FAIL', sourceSha256: createHash('sha256').update(source).digest('hex'),
    head: process.env.GITHUB_SHA || null, checks: [], browserClosed: false }
  const browser = await chromium.launch({ executablePath, headless: true })
  try {
    const context = await browser.newContext()
    await context.route('**/__training_draft_transactions__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Training draft transactions</title>' }))
    const page = await context.newPage()
    await page.goto(new URL('/__training_draft_transactions__', base).href)
    await page.addScriptTag({ content: script })
    for (let mode = 0; mode < names.length; mode++) {
      const actual = await page.evaluate(async mode => {
        if (typeof IDBObjectStore !== 'function' || typeof IDBDatabase !== 'function') throw new Error('Native IndexedDB missing')
        const { createFinalDraftMeta, createFinalDraftStore } = window.TrainingDraft
        const store = createFinalDraftStore()
        if (store.constructor.name !== 'IndexedDbFinalDraftStore') throw new Error('Memory fallback is not native qualification')
        const meta = createFinalDraftMeta({ draftKey: `training-native:${crypto.randomUUID()}`, instrument: 'composite-whole',
          attemptId: 'attempt', attemptEpoch: 2, definitionHash: 'definition', contextSnapshotHash: 'context',
          instrumentKey: 'key', instrumentVersion: 'version', compiledRuntimeHash: 'runtime',
          deliveryMode: 'final_only', submissionId: 'submission',
          instrumentMetadata: { provenance: 'keep', trainingScaleTiming: { items: { old: 1 } } } })
        await store.ensure(meta)
        const old = [
          { draftKey: meta.draftKey, itemKey: 'old-only', value: 'preserve on failure', updatedAt: 1 },
          { draftKey: meta.draftKey, itemKey: 'shared', value: 'old', updatedAt: 1 },
        ]
        for (const answer of old) await store.putAnswer(answer)
        const next = [
          { draftKey: meta.draftKey, itemKey: 'new-only', value: 'restored', updatedAt: 2 },
          { draftKey: meta.draftKey, itemKey: 'shared', value: 'new', updatedAt: 2 },
        ]
        const timing = { trainingScaleTiming: { items: { restored: 2 } } }
        const originalPut = IDBObjectStore.prototype.put, originalTransaction = IDBDatabase.prototype.transaction
        let newRowSucceeded = false, injected = false, rejected = false, committed = false, committedWhenResolved = false
        if (mode < 2) IDBObjectStore.prototype.put = function (...args) {
          if (mode === 1 && this.name === 'draftMeta') {
            injected = true
            throw new DOMException('Injected metadata quota failure', 'QuotaExceededError')
          }
          const request = originalPut.apply(this, args)
          if (mode === 0 && this.name === 'draftAnswers' && args[0].itemKey === 'new-only') {
            request.addEventListener('success', () => { injected = true; newRowSucceeded = true; this.transaction.abort() })
          }
          return request
        }
        else IDBDatabase.prototype.transaction = function (...args) {
          const transaction = originalTransaction.apply(this, args)
          if (args[1] === 'readwrite') transaction.addEventListener('complete', () => { committed = true })
          return transaction
        }
        try { await store.replaceAnswers(meta, next, timing); committedWhenResolved = committed }
        catch { rejected = true }
        finally { IDBObjectStore.prototype.put = originalPut; IDBDatabase.prototype.transaction = originalTransaction }
        return { rejected, injected, newRowSucceeded, committedWhenResolved, old, next,
          oldMetadata: meta.instrumentMetadata, nextMetadata: { provenance: 'keep', ...timing },
          answers: await store.listAnswers(meta.draftKey), metadata: (await store.get(meta.draftKey)).instrumentMetadata }
      }, mode)
      if (mode < 2) {
        assert.equal(actual.injected, true); assert.equal(actual.rejected, true)
        if (mode === 0) assert.equal(actual.newRowSucceeded, true)
        assert.deepEqual(actual.answers, actual.old); assert.deepEqual(actual.metadata, actual.oldMetadata)
      } else {
        assert.equal(actual.rejected, false); assert.equal(actual.committedWhenResolved, true)
        assert.deepEqual(actual.answers, actual.next); assert.deepEqual(actual.metadata, actual.nextMetadata)
      }
      result.checks.push({ name: names[mode], status: 'PASS' })
      console.log(`PASS native IndexedDB: ${names[mode]}`)
    }
    await context.close()
    assert.equal(result.checks.length, 3)
    result.status = 'PASS'
  } finally {
    try { await browser.close(); result.browserClosed = true }
    finally {
      if (!result.browserClosed) result.status = 'FAIL'
      fs.mkdirSync(output, { recursive: true })
      fs.writeFileSync(path.join(output, 'training-draft-transactions.json'), JSON.stringify(result, null, 2) + '\n')
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
