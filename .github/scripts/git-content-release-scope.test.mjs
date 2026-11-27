import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bundleReleaseSelector, verifyGitContentHistory } from './git-content-release-scope.mjs'

const dir = 'server-version/backend/src/modules/'
const scale = dir + 'scale/instruments/example/'
const bundle = dir + 'assessment-bundle/packages/example/'
const entry = (file, status, oldMode, newMode) => ({ file, status, oldMode, newMode })

test('changes state only in the regular release control file', () => {
  const control = bundle + 'releases.json'
  verifyGitContentHistory([entry(control, 'M', '100644', '100644')])
  assert.throws(() => verifyGitContentHistory([entry(control, 'D', '100644', '000000')]), /withdraw/)
  assert.throws(() => verifyGitContentHistory([entry(control, 'A', '000000', '120000')]), /regular JSON/)
  assert.equal(bundleReleaseSelector(control), 'bundle:example')
  assert.equal(bundleReleaseSelector(bundle + '1.0.0/rules.json'), null)
})

test('only appends immutable Scale and Bundle version files', () => {
  for (const file of [scale + 'parameters/1.0.0.json', scale + '1.0.0/source.json',
    bundle + '1.0.0/report.json', bundle + '1.0.0/fixtures/valid.json']) {
    verifyGitContentHistory([entry(file, 'A', '000000', '100644')])
    assert.throws(() => verifyGitContentHistory([entry(file, 'M', '100644', '100644')]), /immutable/)
    assert.throws(() => verifyGitContentHistory([entry(file, 'D', '100644', '000000')]), /immutable/)
  }
})
