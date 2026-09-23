/** Validate disposable FINAL pools before any request is sent. */
export function assertFreshFixturePool(groups, { allowCrossGroupAliases = false } = {}) {
  const seen = new Map()
  const bySubmissionId = new Map()
  const byChildEpoch = new Map()
  for (const [group, fixtures] of Object.entries(groups)) {
    if (!Array.isArray(fixtures)) throw new Error(`fixture group ${group} is not an array`)
    const local = new Set()
    for (const fixture of fixtures) {
      if (!fixture || typeof fixture !== 'object' || typeof fixture.path !== 'string' || fixture.method !== 'POST') {
        throw new Error(`invalid fixture in ${group}`)
      }
      const submissionId = fixture.body?.submissionId
      const epoch = fixture.body?.attemptEpoch
      if (typeof submissionId !== 'string' || submissionId.length < 1 || !Number.isInteger(epoch) || epoch < 1) {
        throw new Error(`missing submission identity in ${group}`)
      }
      const identity = `${fixture.path}\0${epoch}\0${submissionId}`
      const childEpoch = `${fixture.path}\0${epoch}`
      const earlierBySubmission = bySubmissionId.get(submissionId)
      if (earlierBySubmission && earlierBySubmission !== identity) {
        throw new Error(`submissionId is reused for a different child/epoch: ${submissionId}`)
      }
      const earlierByChild = byChildEpoch.get(childEpoch)
      if (earlierByChild && earlierByChild !== identity) {
        throw new Error(`fresh child/epoch has multiple submissionIds: ${fixture.fixtureId}`)
      }
      if (local.has(identity)) throw new Error(`duplicate fresh fixture in ${group}: ${fixture.fixtureId}`)
      local.add(identity)
      const earlier = seen.get(identity)
      if (earlier && !allowCrossGroupAliases) throw new Error(`fresh fixture shared by ${earlier} and ${group}: ${fixture.fixtureId}`)
      seen.set(identity, group)
      bySubmissionId.set(submissionId, identity)
      byChildEpoch.set(childEpoch, identity)
    }
  }
  return { fixtureCount: Object.values(groups).reduce((sum, group) => sum + group.length, 0), uniqueAttempts: seen.size }
}

export function partitionFreshFixturePool(fixtures, warmupCount, steadyCount) {
  if (!Number.isInteger(warmupCount) || warmupCount < 0 || !Number.isInteger(steadyCount) || steadyCount < 1) {
    throw new Error('fresh fixture partition counts must be nonnegative warmup and positive steady integers')
  }
  if (fixtures.length < warmupCount + steadyCount) {
    throw new Error(`fixture pool exhausted: need ${warmupCount + steadyCount}, have ${fixtures.length}`)
  }
  const warmup = fixtures.slice(0, warmupCount)
  const steady = fixtures.slice(warmupCount, warmupCount + steadyCount)
  assertFreshFixturePool({ warmup, steady })
  return { warmup, steady }
}
