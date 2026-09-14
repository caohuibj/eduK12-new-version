const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const e2eDir = __dirname
const sessionGuardedGates = [
  'composite-access-browser-e2e.cjs',
  'situational-bundle-browser-e2e.cjs',
  'situational-branching-browser-e2e.cjs',
  'situational-video-browser-e2e.cjs',
  'fe-11-storage-fault-browser-e2e.cjs',
]
const syntaxOnlyGates = [
  'app-shell-browser-e2e.cjs',
]

const legacyPatterns = [
  { label: 'localStorage token lookup', pattern: /localStorage\.getItem\(['"]token['"]\)/u },
  { label: 'Bearer token header', pattern: /Authorization\s*:\s*[`'"]Bearer\s/u },
]

for (const file of sessionGuardedGates) {
  const filePath = path.join(e2eDir, file)
  const source = fs.readFileSync(filePath, 'utf8')
  assert.match(source, /helpers\/session-auth\.cjs/u, `${file} must use the shared cookie-session helper`)
  for (const legacy of legacyPatterns) {
    assert.doesNotMatch(source, legacy.pattern, `${file} still contains ${legacy.label}`)
  }
  execFileSync(process.execPath, ['--check', filePath], { stdio: 'pipe' })
}

for (const file of syntaxOnlyGates) {
  execFileSync(process.execPath, ['--check', path.join(e2eDir, file)], { stdio: 'pipe' })
}

const helperPath = path.join(e2eDir, 'helpers/session-auth.cjs')
const helper = fs.readFileSync(helperPath, 'utf8')
assert.match(helper, /credentials:\s*['"]same-origin['"]/u, 'session helper must send same-origin credentials')
assert.match(helper, /\/api\/auth\/csrf/u, 'session helper must acquire CSRF for unsafe methods')
assert.match(helper, /\/api\/auth\/me/u, 'session helper must verify the restored cookie session')
assert.doesNotMatch(helper, /localStorage\.getItem\(['"]token['"]\)/u, 'session helper must not read a bearer token from localStorage')
execFileSync(process.execPath, ['--check', helperPath], { stdio: 'pipe' })

console.log(`FE-11 browser gate contract: PASS (${sessionGuardedGates.length} session gates, ${syntaxOnlyGates.length} syntax-only gates)`)
