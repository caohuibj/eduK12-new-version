#!/usr/bin/env node

/**
 * Bounded `prisma migrate deploy`.
 *
 * Plain `CREATE INDEX` waits unboundedly for its lock: a single long-lived
 * writer transaction on the target table stalls the whole deploy (verified
 * in isolation: a deploy blocked on a held RowExclusiveLock made no
 * progress for the full 15 s observation window). During a downtime
 * release window that turns a forgotten transaction into an unbounded
 * outage with no error and no exit code.
 *
 * This wrapper is the single place that bounds the wait. It runs
 * `prisma migrate deploy` with `lock_timeout` set for the deploy process
 * only, via the `options` connection-string parameter, which the Prisma
 * 5.22 migration (schema) engine honors:
 *
 *   DATABASE_URL=...?options=-c%20lock_timeout%3D30000
 *
 * Verified in isolation (PostgreSQL 16.15, Prisma 5.22.0): with the option
 * set, a lock-blocked deploy fails in ~3 s with exit code 1 and
 * `ERROR: canceling statement due to lock timeout` from the schema engine;
 * without it, the same deploy blocked for the whole observation window.
 * `PGOPTIONS` does NOT reach the engine (verified: still blocked), so the
 * URL parameter is the mechanism, not the environment variable.
 *
 * The runtime application's DATABASE_URL is untouched: the option is added
 * only to the child process environment of this wrapper.
 *
 * Usage: node scripts/migrate-deploy-bounded.mjs
 * Env:   MIGRATE_LOCK_TIMEOUT_MS (default 30000)
 */

import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const DEFAULT_LOCK_TIMEOUT_MS = 30000

/**
 * Pure function: return a DATABASE_URL with `lock_timeout` set for the
 * deploy connection, or the original URL when it already carries an
 * `options` parameter that mentions `lock_timeout` (operator intent wins).
 * @param {string} databaseUrl
 * @param {number} lockTimeoutMs
 * @returns {string}
 */
export function withLockTimeout(databaseUrl, lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS) {
  const url = new URL(databaseUrl)
  const existing = url.searchParams.get('options')
  if (existing && /lock_timeout\s*=/.test(existing)) return databaseUrl
  const setting = `-c lock_timeout=${lockTimeoutMs}`
  url.searchParams.set('options', existing ? `${existing} ${setting}` : setting)
  return url.toString()
}

async function main(argv) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('[migrate-deploy-bounded] DATABASE_URL is not set')
    return 2
  }
  const lockTimeoutMs = Number(process.env.MIGRATE_LOCK_TIMEOUT_MS || DEFAULT_LOCK_TIMEOUT_MS)
  if (!Number.isSafeInteger(lockTimeoutMs) || lockTimeoutMs <= 0) {
    console.error(`[migrate-deploy-bounded] MIGRATE_LOCK_TIMEOUT_MS must be a positive integer, got: ${process.env.MIGRATE_LOCK_TIMEOUT_MS}`)
    return 2
  }
  const childEnv = { ...process.env, DATABASE_URL: withLockTimeout(databaseUrl, lockTimeoutMs) }
  const prismaCli = new URL('../node_modules/prisma/build/index.js', import.meta.url)
  console.log(`[migrate-deploy-bounded] prisma migrate deploy with lock_timeout=${lockTimeoutMs}ms`)
  const child = spawn(process.execPath, [fileURLToPath(prismaCli), 'migrate', 'deploy', ...argv], {
    env: childEnv,
    stdio: 'inherit',
  })
  const code = await new Promise((resolve) => {
    child.on('error', (error) => {
      console.error(`[migrate-deploy-bounded] failed to start prisma: ${error.message}`)
      resolve(1)
    })
    child.on('exit', (exitCode) => resolve(exitCode ?? 1))
  })
  return code
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2))
}
