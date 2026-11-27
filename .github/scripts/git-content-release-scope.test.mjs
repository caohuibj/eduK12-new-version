import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bundleReleaseSelector, gitContentReleaseSelector, isCognitiveRuntimePath, verifyGitContentHistory } from './git-content-release-scope.mjs'

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

test('only the exact Cognitive Git P/R files enter the declaration lane', () => {
  const task = dir + 'cognitive/tasks/gonogo/'
  assert.equal(gitContentReleaseSelector(task + 'releases.json'), 'cognitive:gonogo')
  assert.equal(gitContentReleaseSelector(task + 'reports/2026-11.json'), 'cognitive:gonogo')
  assert.equal(isCognitiveRuntimePath(task + 'reports/2026-11.json'), false)
  assert.equal(gitContentReleaseSelector(task + 'reports/review.ts'), null)
  assert.equal(isCognitiveRuntimePath(task + 'reports/review.ts'), true)
  assert.equal(isCognitiveRuntimePath(task + 'fixtures/real.json'), true)
  assert.throws(() => verifyGitContentHistory([entry(task + 'reports/2026-11.json', 'M', '100644', '100644')]), /immutable/)
})

test('published manifest identities stay present when a deployment is withdrawn', () => {
  const change = entry(bundle + 'releases.json', 'M', '100644', '100644')
  const readBaseFile = () => '{"releases":[{"version":"1.0.0","status":"ONLINE"}]}'
  verifyGitContentHistory([change], { readBaseFile, readHeadFile: () => '{"releases":[{"version":"1.0.0","status":"HOLD"}]}' })
  assert.throws(() => verifyGitContentHistory([change], { readBaseFile, readHeadFile: () => '{"releases":[]}' }), /Keep existing/)
})

test('SJT declaration-only releases do not select arbitrary stimulus or renderer paths', () => {
  const path = dir + 'situational/instruments/workplace-choices/'
  assert.equal(gitContentReleaseSelector(path + '1.1.0/content.json'), 'sjt:workplace-choices')
  assert.equal(gitContentReleaseSelector(path + 'reports/1.1.1.json'), 'sjt:workplace-choices')
  assert.equal(gitContentReleaseSelector(path + '1.1.0/instrument.json'), null)
  assert.equal(gitContentReleaseSelector(path + 'reports/1.1.1.ts'), null)
  assert.throws(() => verifyGitContentHistory([entry(path + '1.1.0/content.json', 'M', '100644', '100644')]), /immutable/)
})

test('official Form controls and immutable C/R enter the declaration lane', () => {
  const path = dir + 'form/templates/demographics_v1/'
  assert.equal(gitContentReleaseSelector(path + '1.0.0.json'), 'form:demographics_v1')
  assert.equal(gitContentReleaseSelector(path + 'reports/1.1.0.json'), 'form:demographics_v1')
  assert.equal(gitContentReleaseSelector(path + 'reports/1..0.json'), null)
  assert.equal(gitContentReleaseSelector(path + 'fixtures/unknown.json'), null)
  assert.throws(() => verifyGitContentHistory([entry(path + '1.0.0.json', 'D', '100644', '000000')]), /immutable/)
})
