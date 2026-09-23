import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assertFreshFixturePool } from './fresh-fixture-pool.mjs'

const fixtureFile = process.env.PERF_FIXTURE_FILE
const baseUrl = String(process.env.BASE_URL || 'http://127.0.0.1:53002').replace(/\/$/, '')
if (!fixtureFile) throw new Error('PERF_FIXTURE_FILE is required')
const groups = JSON.parse(readFileSync(fixtureFile, 'utf8'))
assertFreshFixturePool(groups)

async function submit(fixture, body = fixture.body) {
  const response = await fetch(`${baseUrl}${fixture.path}`, {
    method: 'POST', headers: fixture.headers, body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

const max = groups.scaleMaxLegalSteady?.[0]
const typical = groups.scaleTypicalSteady?.[0]
assert.ok(max && typical, 'typical and max-legal Scale fixtures are required')
assert.equal(max.itemCount, 1000, 'current HTTP schema answer cardinality changed')
const overLimit = await submit(max, { ...max.body, answers: [...max.body.answers, max.body.answers[0]] })
assert.equal(overLimit.status, 400, '1001 Scale answers must be rejected by HTTP schema')

const outcomes = []
for (const fixture of [typical, max]) {
  const submitted = await submit(fixture)
  assert.equal(submitted.status, 200, `${fixture.fixtureClass}: ${JSON.stringify(submitted.body).slice(0, 300)}`)
  assert.equal(submitted.body.data?.replayed, false, `${fixture.fixtureClass}: unexpected first replay`)
  const assessment = submitted.body.data?.assessment
  assert.equal(assessment?.status, 'COMPLETED')
  assert.equal(assessment?.report?.scores?.[0]?.value, fixture.expected.total, `${fixture.fixtureClass}: score drift`)
  assert.equal(assessment?.report?.references?.length, 0)
  assert.match(submitted.body.data?.payloadHash || '', /^[0-9a-f]{64}$/)
  outcomes.push({ fixtureClass: fixture.fixtureClass, itemCount: fixture.itemCount, status: 200, fresh: true, scoreMatch: true, references: 0 })
}
console.log(JSON.stringify({ baseUrl, overLimitStatus: 400, outcomes }, null, 2))
