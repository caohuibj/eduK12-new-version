import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const sha = /^[0-9a-f]{40}$/
export const sourceFilePattern = /^server-version\/backend\/src\/modules\/scale\/instruments\/[a-z][a-z0-9_]*\/[0-9]+\.[0-9]+\.[0-9]+\/instrument\.ts$/
const generated = 'server-version/backend/src/modules/scale/onboarding/instruments.generated.ts'
const selfFiles = new Set([
  '.github/workflows/scale-intake-light.yml',
  '.github/scripts/scale-intake-light-scope.mjs',
  '.github/scripts/scale-intake-light-scope.test.mjs',
  'server-version/backend/scripts/scale-intake-light-check.ts',
])
const docPattern = /^docs\/scale-(?:intake|instruments)\/[a-zA-Z0-9_./-]+\.md$/

export function parseRawDiff(raw) {
  if (raw === '') return []
  if (!raw.endsWith('\0')) throw new Error('Malformed Git raw diff terminator')
  const parts = raw.slice(0, -1).split('\0')
  if (parts.length % 2 !== 0) throw new Error('Malformed Git raw diff record')
  const entries = []
  for (let i=0;i<parts.length;i+=2) {
    const m = /^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]{40}) ([0-9a-f]{40}) ([AMDT])$/.exec(parts[i])
    if (!m || !parts[i+1]) throw new Error('Unsupported Git diff entry')
    entries.push({file:parts[i+1],oldMode:m[1],newMode:m[2],status:m[5]})
  }
  return entries
}
export function admitScaleIntakeEntries(entries) {
  assert.ok(entries.length > 0, 'No changed files; not a scale intake')
  const sources=[]
  for (const e of entries) {
    assert.ok(e && typeof e.file==='string' && e.file.length>0 && !e.file.split('/').some(part=>part===''||part==='.'||part==='..'), 'Noncanonical path')
    assert.ok(e.status==='A'||e.status==='M', 'Deletion/move/type change not permitted: '+e.file)
    assert.equal(e.newMode,'100644','Only regular non-executable files permitted: '+e.file)
    assert.equal(e.oldMode,e.status==='A'?'000000':'100644','Unexpected original mode: '+e.file)
    const isSource=sourceFilePattern.test(e.file)
    const isDoc=docPattern.test(e.file)
    assert.ok(isSource || e.file===generated || selfFiles.has(e.file) || isDoc, 'Shared runtime/CI/dependency path cannot use scale-intake-lite: '+e.file)
    if (isSource) sources.push(e.file)
  }
  assert.ok(sources.length>0,'At least one actual instrument.ts must change')
  assert.ok(sources.length<=25,'Too many changed instruments for a focused intake job')
  assert.equal(new Set(entries.map(e=>e.file)).size,entries.length,'Duplicate paths not accepted')
  return {sources:sources.sort(),fileCount:entries.length}
}
export function inspectScaleIntakeDiff(base, head) {
  assert.match(base,sha,'Invalid base commit hash')
  assert.match(head,sha,'Invalid head commit hash')
  assert.notEqual(base,head,'Base and head must differ')
  const checkout=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()
  assert.equal(checkout,head,'Checkout must be the exact PR source SHA, not an unbound merge revision')
  const raw=execFileSync('git',['diff','--raw','--abbrev=40','-z','--no-renames',base,head],{encoding:'utf8',maxBuffer:4*1024*1024})
  return admitScaleIntakeEntries(parseRawDiff(raw))
}
if (process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  try {
    const result=inspectScaleIntakeDiff(process.env.SCALE_LIGHT_BASE_SHA,process.env.SCALE_LIGHT_HEAD_SHA)
    console.log(JSON.stringify({status:'SCOPE_ACCEPTED',base:process.env.SCALE_LIGHT_BASE_SHA,head:process.env.SCALE_LIGHT_HEAD_SHA,...result}))
  } catch(e) {
    console.error('SCALE_LIGHT_SCOPE_REJECTED:',e instanceof Error?e.message:String(e))
    process.exitCode=1
  }
}
