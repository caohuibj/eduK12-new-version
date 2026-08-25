// Validate the non-code evidence required by the Round 2 release Gate.
// The JSON file must not contain passwords, tokens, database URLs, or student
// identifiers. It records only redacted pilot and content-review facts.

const assert = require('assert/strict')
const fs = require('fs')

const file = process.argv[2]
assert.ok(file, 'Usage: node validate-cognitive-round2-gate-evidence.cjs <evidence.json>')
const evidence = JSON.parse(fs.readFileSync(file, 'utf8'))

const nonEmpty = (value, label) => {
  assert.ok(typeof value === 'string' && value.trim().length > 0, `${label} is required`)
}

const timestamp = (value, label) => {
  assert.ok(typeof value === 'string' && value.trim().length > 0, `${label} is required`)
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/, `${label} must be an ISO timestamp`)
  const parsed = Date.parse(value)
  assert.ok(Number.isFinite(parsed), `${label} must be an ISO timestamp`)
  return parsed
}

const assertNoSecrets = (value, path = 'evidence') => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    assert.doesNotMatch(key, /password|token|secret|database.?url|authorization|private.?key/i, `${path}.${key} must not contain credentials`)
    assertNoSecrets(child, `${path}.${key}`)
  }
}

assertNoSecrets(evidence)

const pilot = evidence.pilot
assert.ok(pilot && typeof pilot === 'object', 'pilot evidence is required')
assert.match(String(pilot.browser || ''), /Chrome/i, 'pilot.browser must identify Chrome')
assert.equal(pilot.battery, 'standard', 'pilot.battery must be standard')
nonEmpty(pilot.startedAt, 'pilot.startedAt')
nonEmpty(pilot.completedAt, 'pilot.completedAt')
assert.ok(timestamp(pilot.completedAt, 'pilot.completedAt') >= timestamp(pilot.startedAt, 'pilot.startedAt'), 'pilot.completedAt must not precede pilot.startedAt')
assert.ok(Number.isFinite(pilot.durationSeconds) && pilot.durationSeconds > 0, 'pilot.durationSeconds must be positive')
assert.ok(Array.isArray(pilot.keyboardIssues), 'pilot.keyboardIssues must be an array')
assert.ok(Array.isArray(pilot.touchIssues), 'pilot.touchIssues must be an array')
assert.ok(pilot.interruptionRecovery && pilot.interruptionRecovery.tested === true, 'pilot.interruptionRecovery.tested must be true')
nonEmpty(pilot.interruptionRecovery.result, 'pilot.interruptionRecovery.result')

const stimulusSets = evidence.stimulusSets
assert.ok(Array.isArray(stimulusSets) && stimulusSets.length > 0, 'stimulusSets evidence is required')
for (const stimulus of stimulusSets) {
  nonEmpty(stimulus.id, 'stimulus.id')
  nonEmpty(stimulus.source, `${stimulus.id}.source`)
  nonEmpty(stimulus.license, `${stimulus.id}.license`)
  nonEmpty(stimulus.version, `${stimulus.id}.version`)
  assert.equal(stimulus.contentReviewStatus, 'APPROVED', `${stimulus.id} content review is not APPROVED`)
}

const multisourcePackages = evidence.multisourcePackages
assert.ok(Array.isArray(multisourcePackages) && multisourcePackages.length > 0, 'multisourcePackages evidence is required')
for (const packageReview of multisourcePackages) {
  nonEmpty(packageReview.packageKey, 'multisource packageKey')
  assert.equal(packageReview.scaleReviewStatus, 'APPROVED', `${packageReview.packageKey} scale review is not APPROVED`)
  assert.ok(Array.isArray(packageReview.reviewedScaleCodes) && packageReview.reviewedScaleCodes.length > 0, `${packageReview.packageKey} reviewedScaleCodes is empty`)
  timestamp(packageReview.reviewedAt, `${packageReview.packageKey}.reviewedAt`)
}

console.log(JSON.stringify({
  pilot: 'APPROVED',
  stimulusSetCount: stimulusSets.length,
  multisourcePackageCount: multisourcePackages.length,
}, null, 2))
