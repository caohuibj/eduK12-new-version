const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const vm = require('node:vm')
const esbuild = require('../frontend/node_modules/esbuild')
const define = require('./qa-round3-browser-build.cjs')
const { worker, urlAssetPlugin } = require('./qa-round3-browser-assets.cjs')
const fs = require('node:fs')
const root = path.resolve(__dirname, '../frontend')

test('bare IIFE reproduces missing Vite flag and explicit fixture define enables Cognitive', () => {
  const build = flags => esbuild.buildSync({
    stdin: { contents: 'import { cognitiveBuildEnabled } from "./src/modules/cognitive/feature"; globalThis.enabled = cognitiveBuildEnabled', resolveDir: root },
    bundle: true, write: false, format: 'iife', logLevel: 'silent', define: flags,
  }).outputFiles[0].text
  const old = { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false' }
  assert.throws(() => vm.runInNewContext(build(old), {}), /VITE_COGNITIVE_MODULE_ENABLED/)
  const context = {}
  vm.runInNewContext(build(define), context)
  assert.equal(context.enabled, true)
})

test('actual QA fixture resolves Vite worker URLs and has no unresolved environment reads', async () => {
  const result = await esbuild.build({
    plugins: [urlAssetPlugin],
    entryPoints: [path.join(__dirname, 'qa-round3-browser-fixture.tsx')],
    bundle: true, write: false, outfile: '/tmp/qa-round3-fixture.js', format: 'iife', jsx: 'automatic', metafile: true,
    nodePaths: [path.join(root, 'node_modules')], loader: { '.png': 'dataurl', '.webp': 'dataurl', '.avif': 'dataurl' }, define,
  })
  assert.ok(Object.keys(result.metafile.inputs).some(name => name.endsWith('/modules/cognitive/feature.ts')))
  assert.ok(Object.keys(result.metafile.inputs).some(name => name.endsWith('/components/PdfViewer.tsx')))
  assert.ok(Object.keys(result.metafile.inputs).some(name => name.startsWith('qa-round3-url:')))
  assert.ok(result.outputFiles.some(output => output.text.includes(worker.url)))
  assert.equal(worker.file, require.resolve('../frontend/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'))
  assert.match(fs.readFileSync(worker.file, 'utf8'), /WorkerMessageHandler/)
  assert.equal(worker.contentType, 'text/javascript')
  for (const output of result.outputFiles) {
    assert.doesNotMatch(output.text, /import_meta\w*\.env\b|import\.meta\.env\b/)
  }
})
