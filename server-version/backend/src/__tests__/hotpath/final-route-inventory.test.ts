import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('FINAL route inventory', () => {
  it('matches mounted assessment submit routes to the maintained cost ledger', () => {
    // CI binds these fixtures to the maintained checker/ledger in its source gate.
    // Inspect the actual builder source; never a hand-maintained router fixture.
    const root = mkdtempSync(join(tmpdir(), 'final-routes-'))
    try {
      const perf = join(root, 'server-version/perf/current-main-v1')
      mkdirSync(perf, { recursive: true })
      mkdirSync(join(root, 'server-version/backend'), { recursive: true })
      mkdirSync(join(root, 'docs/performance-optimization-v1'), { recursive: true })
      symlinkSync(fileURLToPath(new URL('../../', import.meta.url)), join(root, 'server-version/backend/src'), 'dir')
      const checker = join(perf, 'check-final-routes.mjs')
      copyFileSync(fileURLToPath(new URL('../fixtures/final-route-checker.fixture.mjs', import.meta.url)), checker)
      copyFileSync(fileURLToPath(new URL('../fixtures/final-route-inventory.fixture.csv', import.meta.url)), join(root, 'docs/performance-optimization-v1/route-inventory.csv'))
      const output = execFileSync(process.execPath, [checker], { encoding: 'utf8' })
      expect(output).toContain('22 registered templates matched')
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
