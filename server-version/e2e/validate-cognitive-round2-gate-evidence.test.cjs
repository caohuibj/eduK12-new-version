const assert = require('assert/strict')
const test = require('node:test')

const { MANIFEST, validateEvidence } = require('./validate-cognitive-round2-gate-evidence.cjs')

const validEvidence = () => ({
  schemaVersion: MANIFEST.schemaVersion,
  pilot: {
    status: 'APPROVED',
    browser: 'Chrome 128',
    battery: 'standard',
    startedAt: '2026-08-25T00:00:00Z',
    completedAt: '2026-08-25T00:40:00Z',
    durationSeconds: 2_400,
    keyboardIssues: [],
    touchIssues: [],
    interruptionRecovery: { tested: true, result: 'PASS' },
  },
  stimulusSets: MANIFEST.stimulusSets.map((item) => ({
    ...item,
    source: 'internal-generated',
    license: 'internal-owned',
    contentReviewStatus: 'APPROVED',
  })),
  supportingArtifacts: MANIFEST.supportingArtifacts.map((item) => ({
    ...item,
    source: 'internal-generated',
    license: 'internal-owned',
    contentReviewStatus: 'APPROVED',
  })),
  multisourcePackages: MANIFEST.multisourcePackages.map((item) => ({
    packageKey: item.key,
    packageVersion: item.version,
    scaleReviewStatus: 'APPROVED',
    reviewedScaleCodes: [...item.reviewedScaleCodes],
    reviewedAt: '2026-08-25T00:00:00Z',
  })),
})

const clone = (value) => JSON.parse(JSON.stringify(value))

test('accepts the complete approved manifest', () => {
  assert.deepEqual(validateEvidence(validEvidence()), {
    pilot: 'APPROVED',
    stimulusSetCount: 15,
    supportingArtifactCount: 3,
    multisourcePackageCount: 1,
  })
})

test('rejects a pilot that is not explicitly approved', () => {
  const evidence = validEvidence()
  evidence.pilot.status = 'FAILED'
  assert.throws(() => validateEvidence(evidence), /pilot\.status must be APPROVED/)
})

test('rejects device issues, failed interruption recovery, and invalid duration', () => {
  for (const mutate of [
    (evidence) => { evidence.pilot.keyboardIssues = ['keyboard unusable'] },
    (evidence) => { evidence.pilot.touchIssues = ['touch broken'] },
    (evidence) => { evidence.pilot.interruptionRecovery.result = 'FAILED' },
    (evidence) => { evidence.pilot.durationSeconds = 1_799 },
  ]) {
    const evidence = clone(validEvidence())
    mutate(evidence)
    assert.throws(() => validateEvidence(evidence))
  }
})

test('rejects missing, duplicate, and unexpected stimulus entries', () => {
  const missing = validEvidence()
  missing.stimulusSets.pop()
  assert.throws(() => validateEvidence(missing), /stimulusSets is not exhaustive/)

  const duplicate = validEvidence()
  duplicate.stimulusSets.push({ ...duplicate.stimulusSets[0] })
  assert.throws(() => validateEvidence(duplicate), /stimulusSets contains duplicate/)

  const unexpected = validEvidence()
  unexpected.stimulusSets[0].id = 'future-task'
  assert.throws(() => validateEvidence(unexpected), /stimulusSets contains unexpected/)
})

test('rejects missing or unexpected multisource package reviews', () => {
  const missing = validEvidence()
  missing.multisourcePackages = []
  assert.throws(() => validateEvidence(missing), /multisourcePackages is not exhaustive/)

  const unexpected = validEvidence()
  unexpected.multisourcePackages[0].packageKey = 'future_package'
  assert.throws(() => validateEvidence(unexpected), /multisourcePackages contains unexpected/)
})

test('rejects unknown fields and sensitive values even when field names look harmless', () => {
  const unknownField = validEvidence()
  unknownField.notes = 'approved'
  assert.throws(() => validateEvidence(unknownField), /evidence contains unknown or missing fields/)

  const credential = validEvidence()
  credential.stimulusSets[0].source = 'token=redacted-example'
  assert.throws(() => validateEvidence(credential), /contains a credential or participant identifier/)

  const databaseUrl = validEvidence()
  databaseUrl.stimulusSets[0].license = 'postgresql://user:password@example.invalid/db'
  assert.throws(() => validateEvidence(databaseUrl), /contains a credential or participant identifier/)

  const email = validEvidence()
  email.supportingArtifacts[0].source = 'reviewer@example.invalid'
  assert.throws(() => validateEvidence(email), /contains a credential or participant identifier/)

  const participantId = validEvidence()
  participantId.supportingArtifacts[0].license = 'student-123'
  assert.throws(() => validateEvidence(participantId), /contains a credential or participant identifier/)
})
