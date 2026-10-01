import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('FINAL route inventory', () => {
  it('matches mounted assessment submit routes to the maintained cost ledger', () => {
    const checker = fileURLToPath(new URL('../../../../perf/current-main-v1/check-final-routes.mjs', import.meta.url))
    const output = execFileSync(process.execPath, [checker], { encoding: 'utf8' })
    expect(output).toContain('15 registered templates matched')
  })
})
