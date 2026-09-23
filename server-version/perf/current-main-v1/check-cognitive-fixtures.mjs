import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assertFreshFixturePool } from './fresh-fixture-pool.mjs'

const fixtureFile = process.env.PERF_FIXTURE_FILE
const baseUrl = String(process.env.BASE_URL || 'http://127.0.0.1:53002').replace(/\/$/, '')
if (!fixtureFile) throw new Error('PERF_FIXTURE_FILE is required')
const groups = JSON.parse(readFileSync(fixtureFile, 'utf8'))
assertFreshFixturePool(groups)
const index = Number(process.env.PERF_FIXTURE_INDEX || 0)
if (!Number.isInteger(index) || index < 0) throw new Error('PERF_FIXTURE_INDEX must be a nonnegative integer')

const outcomes = []
for (const key of Object.keys(groups).filter((name) => name.startsWith('cognitive') && name.endsWith('Steady')).sort()) {
  const fixture = groups[key][index]
  assert.ok(fixture, `missing fresh fixture ${key}[${index}]`)
  const response = await fetch(`${baseUrl}${fixture.path}`, {
    method: 'POST', headers: fixture.headers, body: JSON.stringify(fixture.body),
  })
  const envelope = await response.json()
  assert.equal(response.status, 200, `${key}: ${JSON.stringify(envelope).slice(0, 300)}`)
  assert.equal(envelope.data?.replayed, false, `${key}: first attempt replayed`)
  assert.match(envelope.data?.payloadHash || '', /^[0-9a-f]{64}$/)
  assert.deepEqual(envelope.data?.response?.result?.metrics, fixture.expected.score.metrics, `${key}: metric drift`)
  const actualFlags = envelope.data?.response?.result?.qualityFlags || {}
  for (const [flag, value] of Object.entries(fixture.expected.score.qualityFlags)) {
    if (flag !== 'interpretable') assert.equal(actualFlags[flag], value, `${key}: quality flag ${flag} drift`)
  }
  assert.ok(envelope.data?.response?.report?.profileLabel, `${key}: frozen profile report missing`)
  outcomes.push({ fixtureClass: fixture.fixtureClass, trialCount: fixture.trialCount, status: 200, replayed: false, metricsMatch: true, frozenProfileReport: true })
}
assert.equal(outcomes.length, 6, 'expected three real profiles for both nback and cpt')
console.log(JSON.stringify({ baseUrl, outcomes }, null, 2))
