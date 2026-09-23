import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assertFreshFixturePool } from './fresh-fixture-pool.mjs'

const fixtureFile = process.env.PERF_FIXTURE_FILE
const baseUrl = String(process.env.BASE_URL || 'http://127.0.0.1:53002').replace(/\/$/, '')
if (!fixtureFile) throw new Error('PERF_FIXTURE_FILE is required')
const groups = JSON.parse(readFileSync(fixtureFile, 'utf8'))
assertFreshFixturePool(groups)

async function submit(fixture, body = fixture.body, headers = fixture.headers) {
  const response = await fetch(`${baseUrl}${fixture.path}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

const outcomes = []
for (const key of ['sjtLinear10', 'sjtLinear30', 'sjtLinear60', 'sjtBranchFull', 'sjtBranchEarly']) {
  const fixture = groups[`${key}Steady`]?.[0]
  assert.ok(fixture, `missing ${key} steady fixture`)
  const outcome = await submit(fixture)
  assert.equal(outcome.status, 200, `${key} HTTP status: ${JSON.stringify(outcome.body).slice(0, 300)}`)
  assert.equal(outcome.body.data?.replayed, false, `${key} unexpectedly replayed on first submit`)
  assert.deepEqual(outcome.body.data?.result, fixture.expected.result, `${key} semantic scoring drift`)
  assert.equal(outcome.body.data?.instrument?.definitionHash, fixture.expected.definitionHash, `${key} definition drift`)
  outcomes.push({ fixtureClass: key, status: 200, replayed: false, semanticMatch: true })
}

// Negative requests are deliberately outside normal load success accounting.
const negative = groups.sjtLinear10Steady[1]
const other = groups.sjtLinear30Steady[1]
assert.ok(negative && other, 'negative fixture checks require at least two steady fixtures per class')
const badBody = structuredClone(negative.body)
badBody.responses[0].unexpected = true
const malformed = await submit(negative, badBody)
assert.equal(malformed.status, 400, `expected 400, got ${malformed.status}`)
const wrongIdentity = await submit(negative, negative.body, other.headers)
assert.equal(wrongIdentity.status, 403, `expected 403, got ${wrongIdentity.status}`)
const wrongEpoch = await submit(negative, { ...negative.body, attemptEpoch: negative.body.attemptEpoch + 1 })
assert.equal(wrongEpoch.status, 409, `expected 409, got ${wrongEpoch.status}`)
const freshAfterNegatives = await submit(negative)
assert.equal(freshAfterNegatives.status, 200)
assert.equal(freshAfterNegatives.body.data?.replayed, false)
const replay = await submit(negative)
assert.equal(replay.status, 200)
assert.equal(replay.body.data?.replayed, true)
outcomes.push({ fixtureClass: 'negative', expectedStatuses: [400, 403, 409], freshAfterNegatives: true, replayAfterSuccess: true })
console.log(JSON.stringify({ baseUrl, outcomes }, null, 2))
