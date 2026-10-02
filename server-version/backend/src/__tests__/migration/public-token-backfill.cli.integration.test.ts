import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { promisify } from 'node:util'
import { Client } from 'pg'
import { describe, expect, it } from 'vitest'
import { integrationDatabaseUrl } from '../integration/integration-env'

const url = integrationDatabaseUrl('LEGACY_IMPORT_TEST_DATABASE_URL', 'RELEASE_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
const run = promisify(execFile)

suite('production public-token backfill CLI lifecycle (isolated PostgreSQL)', () => {
  it('disconnects and exits naturally after reporting all four token tables', async () => {
    const parsed = new URL(url!)
    const disposableCi = process.env.CI === 'true' && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) && parsed.pathname === '/ptool'
    if (!disposableCi && (!/(test|rehearsal|acc)/i.test(parsed.pathname) || /\/ptool(?:_legacy)?$/i.test(parsed.pathname))) {
      throw new Error('Explicit isolated test database required')
    }
    const name = 'token_backfill_cli_test_' + randomBytes(8).toString('hex')
    const admin = new Client({ connectionString: url })
    let scratch: Client | undefined
    let created = false
    try {
      await admin.connect()
      await admin.query('CREATE DATABASE "' + name + '"')
      created = true
      parsed.pathname = '/' + name
      scratch = new Client({ connectionString: parsed.toString() })
      await scratch.connect()
      for (const table of ['questionnaire_access_tokens', 'checkin_access_tokens', 'composite_assessment_access_tokens', 'cognitive_access_tokens']) {
        // Empty token tables exercise the real Prisma delegates and CLI shutdown
        // without copying business records or changing the shared test database.
        await scratch.query('CREATE TABLE "' + table + '" (id TEXT PRIMARY KEY, token TEXT, token_hash TEXT, token_encrypted TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)')
      }
      const env = { ...process.env, NODE_ENV: 'production', DATABASE_URL: parsed.toString() }
      delete env.VITEST
      delete env.VITEST_WORKER_ID
      delete env.VITEST_POOL_ID
      const { stdout } = await run(process.execPath, [
        require.resolve('tsx/cli'),
        path.resolve('src/scripts/pr27-backfill-public-access-tokens.ts'),
      ], { env, timeout: 12000, maxBuffer: 1024 * 1024 })
      const report = stdout.trim().split('\n').map((line) => {
        try { return JSON.parse(line) } catch { return null }
      }).find((value) => value?.questionnaire && value?.checkin && value?.composite && value?.cognitive)
      expect(report).toEqual({
        questionnaire: { processed: 0, remaining: 0 }, checkin: { processed: 0, remaining: 0 },
        composite: { processed: 0, remaining: 0 }, cognitive: { processed: 0, remaining: 0 },
      })
    } finally {
      await scratch?.end()
      // The generated identifier has no user input and is the only database
      // this test may remove, even when the subprocess hits its deadline.
      if (created) await admin.query('DROP DATABASE "' + name + '" WITH (FORCE)')
      await admin.end()
    }
  }, 30000)
})
