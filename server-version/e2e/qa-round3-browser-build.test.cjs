const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const vm = require('node:vm')
const esbuild = require('../frontend/node_modules/esbuild')
const define = require('./qa-round3-browser-build.cjs')
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

test('actual QA fixture transitive bundle has no unresolved import.meta environment reads', () => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(__dirname, 'qa-round3-browser-fixture.tsx')],
    bundle: true, write: false, outfile: '/tmp/qa-round3-fixture.js', format: 'iife', jsx: 'automatic', metafile: true,
    nodePaths: [path.join(root, 'node_modules')], define,
  })
  assert.ok(Object.keys(result.metafile.inputs).some(name => name.endsWith('/modules/cognitive/feature.ts')))
  for (const output of result.outputFiles) {
    assert.doesNotMatch(output.text, /import_meta\w*\.env\b|import\.meta\.env\b/)
  }
})
