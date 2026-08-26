// Validate the non-code evidence required by the Round 2 release Gate.
// The evidence file is deliberately a small, versioned allow-list. It must
// not contain credentials, participant identifiers, or free-form notes.

const assert = require('assert/strict')
const fs = require('fs')
const path = require('path')

const MANIFEST_FILE = path.join(__dirname, 'cognitive-round2-gate-manifest.json')
const MANIFEST = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'))

const MIN_PILOT_DURATION_SECONDS = 1_800
const MAX_PILOT_DURATION_SECONDS = 7_200
const MAX_DURATION_DELTA_SECONDS = 60

const SENSITIVE_VALUE_PATTERNS = [
  /(?:postgres(?:ql)?|mysql|mongodb|redis):\/\/\S+/i,
  /(?:database[_ -]?url|password|passphrase|token|secret|authorization|bearer|private[_ -]?key|api[_ -]?key)\s*[:=]/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /\b(?:student|participant|user|attempt|assessment|account)(?:[_ -]?id)?\s*[:=]\s*\S+/i,
  /\b(?:student|participant|user|attempt|assessment|account)-[A-Za-z0-9]{3,}\b/i,
]

const assertPlainObject = (value, label) => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
}

const assertExactKeys = (value, keys, label) => {
  assertPlainObject(value, label)
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} contains unknown or missing fields`)
}

const assertSafeString = (value, label) => {
  assert.equal(typeof value, 'string', `${label} must be a string`)
  assert.ok(value.trim().length > 0, `${label} is required`)
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    assert.doesNotMatch(value, pattern, `${label} contains a credential or participant identifier`)
  }
  return value
}

const assertTimestamp = (value, label) => {
  const safeValue = assertSafeString(value, label)
  assert.match(safeValue, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/, `${label} must be an ISO timestamp`)
  const parsed = Date.parse(safeValue)
  assert.ok(Number.isFinite(parsed), `${label} must be an ISO timestamp`)
  return parsed
}

const assertEmptyStringArray = (value, label) => {
  assert.ok(Array.isArray(value), `${label} must be an array`)
  assert.equal(value.length, 0, `${label} must be empty for an approved pilot`)
}

const assertManifestItems = (actualItems, expectedItems, label) => {
  assert.ok(Array.isArray(actualItems), `${label} must be an array`)
  const expectedById = new Map(expectedItems.map((item) => [item.id, item.version]))
  assert.equal(expectedById.size, expectedItems.length, `${label} manifest contains duplicate IDs`)
  const seen = new Set()

  for (const item of actualItems) {
    assertExactKeys(item, ['id', 'source', 'license', 'version', 'contentReviewStatus'], `${label} item`)
    const id = assertSafeString(item.id, `${label}.id`)
    assert.equal(seen.has(id), false, `${label} contains duplicate ${id}`)
    seen.add(id)
    assert.ok(expectedById.has(id), `${label} contains unexpected ${id}`)
    assert.equal(item.version, expectedById.get(id), `${label}.${id} version mismatch`)
    assertSafeString(item.source, `${id}.source`)
    assertSafeString(item.license, `${id}.license`)
    assert.equal(item.contentReviewStatus, 'APPROVED', `${id} content review is not APPROVED`)
  }

  assert.deepEqual([...seen].sort(), [...expectedById.keys()].sort(), `${label} is not exhaustive`)
}

const assertReviewedScaleCodes = (actual, expected, label) => {
  assert.ok(Array.isArray(actual), `${label} must be an array`)
  assert.ok(actual.every((value) => typeof value === 'string' && value.trim().length > 0), `${label} contains an invalid scale code`)
  assert.equal(new Set(actual).size, actual.length, `${label} contains duplicate scale codes`)
  assert.deepEqual([...actual].sort(), [...expected].sort(), `${label} does not match the approved package mapping`)
}

const validateEvidence = (evidence) => {
  assertExactKeys(evidence, ['schemaVersion', 'pilot', 'stimulusSets', 'supportingArtifacts', 'multisourcePackages'], 'evidence')
  assert.equal(evidence.schemaVersion, MANIFEST.schemaVersion, 'evidence.schemaVersion is not supported')

  assertExactKeys(
    evidence.pilot,
    ['status', 'browser', 'battery', 'startedAt', 'completedAt', 'durationSeconds', 'keyboardIssues', 'touchIssues', 'interruptionRecovery'],
    'pilot',
  )
  assert.equal(evidence.pilot.status, 'APPROVED', 'pilot.status must be APPROVED')
  assert.match(assertSafeString(evidence.pilot.browser, 'pilot.browser'), /Chrome/i, 'pilot.browser must identify Chrome')
  assert.equal(evidence.pilot.battery, 'standard', 'pilot.battery must be standard')
  const startedAt = assertTimestamp(evidence.pilot.startedAt, 'pilot.startedAt')
  const completedAt = assertTimestamp(evidence.pilot.completedAt, 'pilot.completedAt')
  assert.ok(completedAt >= startedAt, 'pilot.completedAt must not precede pilot.startedAt')
  assert.ok(Number.isFinite(evidence.pilot.durationSeconds), 'pilot.durationSeconds must be finite')
  assert.ok(
    evidence.pilot.durationSeconds >= MIN_PILOT_DURATION_SECONDS
      && evidence.pilot.durationSeconds <= MAX_PILOT_DURATION_SECONDS,
    `pilot.durationSeconds must be between ${MIN_PILOT_DURATION_SECONDS} and ${MAX_PILOT_DURATION_SECONDS}`,
  )
  assert.ok(
    Math.abs(evidence.pilot.durationSeconds - ((completedAt - startedAt) / 1000)) <= MAX_DURATION_DELTA_SECONDS,
    'pilot.durationSeconds does not match pilot timestamps',
  )
  assertEmptyStringArray(evidence.pilot.keyboardIssues, 'pilot.keyboardIssues')
  assertEmptyStringArray(evidence.pilot.touchIssues, 'pilot.touchIssues')

  assertExactKeys(evidence.pilot.interruptionRecovery, ['tested', 'result'], 'pilot.interruptionRecovery')
  assert.equal(evidence.pilot.interruptionRecovery.tested, true, 'pilot.interruptionRecovery.tested must be true')
  assert.equal(evidence.pilot.interruptionRecovery.result, 'PASS', 'pilot.interruptionRecovery.result must be PASS')

  assertManifestItems(evidence.stimulusSets, MANIFEST.stimulusSets, 'stimulusSets')
  assertManifestItems(evidence.supportingArtifacts, MANIFEST.supportingArtifacts, 'supportingArtifacts')

  assert.ok(Array.isArray(evidence.multisourcePackages), 'multisourcePackages must be an array')
  const expectedPackages = new Map(MANIFEST.multisourcePackages.map((item) => [`${item.key}@${item.version}`, item]))
  const seenPackages = new Set()
  for (const packageReview of evidence.multisourcePackages) {
    assertExactKeys(packageReview, ['packageKey', 'packageVersion', 'scaleReviewStatus', 'reviewedScaleCodes', 'reviewedAt'], 'multisource package review')
    const packageKey = assertSafeString(packageReview.packageKey, 'multisource packageKey')
    const packageVersion = assertSafeString(packageReview.packageVersion, `${packageKey}.packageVersion`)
    const resourceId = `${packageKey}@${packageVersion}`
    assert.equal(seenPackages.has(resourceId), false, `multisourcePackages contains duplicate ${resourceId}`)
    seenPackages.add(resourceId)
    const expectedPackage = expectedPackages.get(resourceId)
    assert.ok(expectedPackage, `multisourcePackages contains unexpected ${resourceId}`)
    assert.equal(packageReview.scaleReviewStatus, 'APPROVED', `${resourceId} scale review is not APPROVED`)
    assertReviewedScaleCodes(packageReview.reviewedScaleCodes, expectedPackage.reviewedScaleCodes, `${resourceId}.reviewedScaleCodes`)
    assertTimestamp(packageReview.reviewedAt, `${resourceId}.reviewedAt`)
  }
  assert.deepEqual([...seenPackages].sort(), [...expectedPackages.keys()].sort(), 'multisourcePackages is not exhaustive')

  return {
    pilot: 'APPROVED',
    stimulusSetCount: evidence.stimulusSets.length,
    supportingArtifactCount: evidence.supportingArtifacts.length,
    multisourcePackageCount: evidence.multisourcePackages.length,
  }
}

const validateEvidenceFile = (file) => {
  assert.ok(file, 'Usage: node validate-cognitive-round2-gate-evidence.cjs <evidence.json>')
  return validateEvidence(JSON.parse(fs.readFileSync(file, 'utf8')))
}

if (require.main === module) {
  console.log(JSON.stringify(validateEvidenceFile(process.argv[2]), null, 2))
}

module.exports = {
  MANIFEST,
  validateEvidence,
  validateEvidenceFile,
}
