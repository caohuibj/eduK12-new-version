import { describe, expect, it } from 'vitest'
import baseline from './fixtures/task-package-baseline.json'
import { captureCompatibility } from './compatibility-capture'

describe('PR1 compatibility against 01f5a46ac21235a9d5fefb950e89ef68b7e82be4', () => {
  it('preserves every exact identity, config, protocol, compiler hash, quality effect and publish outcome', () => {
    expect(JSON.parse(JSON.stringify(captureCompatibility()))).toEqual(baseline.tasks)
  })
})
