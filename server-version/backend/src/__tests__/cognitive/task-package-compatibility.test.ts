import { describe, expect, it } from 'vitest'
import baseline from './fixtures/task-package-baseline.json'
import { captureCompatibility } from './compatibility-capture'

describe('PR1 compatibility against 01f5a46ac21235a9d5fefb950e89ef68b7e82be4', () => {
  it('preserves every historical exact identity while allowing reviewed new identities', () => {
    const current = new Map(
      JSON.parse(JSON.stringify(captureCompatibility()))
        .map((entry: { identity: string }) => [entry.identity, entry]),
    )

    for (const historical of baseline.tasks) {
      expect(current.get(historical.identity), historical.identity).toEqual(historical)
    }

    expect(current.size).toBeGreaterThanOrEqual(baseline.tasks.length)
  })
})
