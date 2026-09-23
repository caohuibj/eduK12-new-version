import assert from 'node:assert/strict'
import test from 'node:test'
import { assertFreshFixturePool, partitionFreshFixturePool } from './fresh-fixture-pool.mjs'

const fixture = (path, submissionId, epoch = 1) => ({
  fixtureId: submissionId, method: 'POST', path,
  body: { submissionId, attemptEpoch: epoch },
})

test('warmup and steady partitions consume distinct children and submission IDs', () => {
  const pool = Array.from({ length: 5 }, (_, index) => fixture(`/child/${index}`, `submit-${index}`))
  const groups = partitionFreshFixturePool(pool, 2, 3)
  assert.deepEqual(assertFreshFixturePool(groups), { fixtureCount: 5, uniqueAttempts: 5 })
})

test('insufficient fresh pool fails before any request', () => {
  assert.throws(() => partitionFreshFixturePool([fixture('/child/1', 'submit-1')], 1, 1), /exhausted/)
})

test('shared warmup and steady attempt fails', () => {
  const reused = fixture('/child/1', 'submit-1')
  assert.throws(() => assertFreshFixturePool({ warmup: [reused], steady: [reused] }), /shared/)
})

test('same child with different submission ID fails', () => {
  assert.throws(() => assertFreshFixturePool({ steady: [fixture('/child/1', 'submit-1'), fixture('/child/1', 'submit-2')] }), /multiple submissionIds/)
})

test('same submission ID for different child or epoch fails', () => {
  assert.throws(() => assertFreshFixturePool({ steady: [fixture('/child/1', 'submit-1'), fixture('/child/2', 'submit-1')] }), /submissionId is reused/)
  assert.throws(() => assertFreshFixturePool({ steady: [fixture('/child/1', 'submit-1'), fixture('/child/1', 'submit-1', 2)] }), /submissionId is reused/)
})
