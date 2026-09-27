#!/usr/bin/env node
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const backend = path.join(root, 'backend')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'huisurvey-pg16-upgrade-'))
const suffix = crypto.randomBytes(5).toString('hex')
const source = `huisurvey-pg14-source-${suffix}`
const target = `huisurvey-pg16-target-${suffix}`
const password = crypto.randomBytes(24).toString('hex')
const evidenceDir = process.env.OPS_PG16_EVIDENCE || '/tmp/huisurvey-pg16-upgrade-evidence'
const manifest = { status: 'RUNNING', checks: [] }

const run = (command, args, opts = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts })
  if (result.error || result.status !== 0) {
    throw new Error(`${path.basename(command)} failed: ${String(result.stderr || result.stdout || result.error).slice(-3000)}`)
  }
  return result.stdout
}
const docker = (args) => run('docker', args).trim()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const record = (name) => { manifest.checks.push(name); console.log(`PASS ${name}`) }

async function start(container, image) {
  let last = ''
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const started = spawnSync('docker', [
      'run', '-d', '--name', container,
      '-e', 'POSTGRES_USER=ptool',
      '-e', `POSTGRES_PASSWORD=${password}`,
      '-e', 'POSTGRES_DB=ptool',
      '-p', '127.0.0.1::5432',
      image,
    ], { encoding: 'utf8' })
    if (!started.error && started.status === 0) {
      for (let i = 0; i < 60; i += 1) {
        if (spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'ptool', '-d', 'ptool']).status === 0) {
          const port = docker(['port', container, '5432/tcp']).split(':').pop()
          assert.ok(port && /^\d+$/.test(port), 'mapped postgres port must be numeric')
          return `postgresql://ptool:${password}@127.0.0.1:${port}/ptool?schema=public`
        }
        await sleep(500)
      }
      throw new Error(`${image} did not become ready`)
    }
    last = String(started.stderr || started.stdout || started.error || '')
    spawnSync('docker', ['rm', '--force', '--volumes', container], { stdio: 'ignore' })
    if (!/address already in use|bind:.*in use/i.test(last)) throw new Error(`docker failed: ${last.slice(-2000)}`)
    await sleep(250 * attempt)
  }
  throw new Error(`host port allocation failed: ${last.slice(-1000)}`)
}

const query = (container, sql) =>
  docker(['exec', container, 'psql', '-U', 'ptool', '-d', 'ptool', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql])

async function main() {
  assert.equal(process.env.NODE_ENV, 'test', 'upgrade rehearsal is test-only')
  const sourceUrl = await start(source, 'postgres:14.24-bookworm')
  const targetUrl = await start(target, 'postgres:16.15-bookworm')

  const prisma = path.join(backend, 'node_modules/prisma/build/index.js')
  const schema = path.join(backend, 'prisma/schema.prisma')
  const baseEnv = {
    ...process.env,
    NODE_ENV: 'test',
    ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'ops-upgrade-admin',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'ops-upgrade-password-2026',
  }
  run(process.execPath, [prisma, 'migrate', 'deploy', '--schema', schema], { cwd: backend, env: { ...baseEnv, DATABASE_URL: sourceUrl } })
  run(path.join(backend, 'node_modules/.bin/tsx'), ['prisma/seed.ts'], { cwd: backend, env: { ...baseEnv, DATABASE_URL: sourceUrl } })
  assert.ok(Number(query(source, 'SELECT count(*) FROM users')) > 0)
  assert.ok(Number(query(source, 'SELECT count(*) FROM scales')) > 0)
  record('PG14 source is migrated and populated')

  const before = {
    users: query(source, 'SELECT count(*) FROM users'),
    scales: query(source, 'SELECT count(*) FROM scales'),
    migrations: query(source, 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL'),
  }
  const dump = path.join(scratch, 'pg14.dump')
  const fd = fs.openSync(dump, 'wx', 0o600)
  try {
    run('docker', ['exec', source, 'pg_dump', '-U', 'ptool', '-d', 'ptool', '--format=custom', '--no-owner', '--no-privileges'], {
      stdio: ['ignore', fd, 'pipe'],
    })
  } finally {
    fs.closeSync(fd)
  }
  docker(['cp', dump, `${target}:/tmp/pg14.dump`])
  docker(['exec', target, 'pg_restore', '--exit-on-error', '--no-owner', '--no-privileges', '-U', 'ptool', '-d', 'ptool', '/tmp/pg14.dump'])
  record('PG14 logical dump restores into a distinct PG16 data directory')

  run(process.execPath, [prisma, 'migrate', 'deploy', '--schema', schema], { cwd: backend, env: { ...baseEnv, DATABASE_URL: targetUrl } })
  const uploadDir = path.join(scratch, 'uploads')
  fs.mkdirSync(uploadDir)
  run(process.execPath, ['scripts/release-data-preflight.mjs'], {
    cwd: backend,
    env: { ...baseEnv, DATABASE_URL: targetUrl, UPLOAD_DIR: uploadDir },
  })
  const after = {
    users: query(target, 'SELECT count(*) FROM users'),
    scales: query(target, 'SELECT count(*) FROM scales'),
    migrations: query(target, 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL'),
  }
  assert.deepEqual(after, before)
  assert.ok(query(target, 'SHOW server_version').startsWith('16.15'))
  record('PG16 restored data accepts current migrations and release preflight')
  record('key populated row counts and finished migration history are preserved')
  manifest.status = 'PASSED'
  manifest.before = before
  manifest.after = after
}

main().catch((error) => {
  manifest.status = 'FAILED'
  manifest.error = String(error)
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  fs.mkdirSync(evidenceDir, { recursive: true })
  fs.writeFileSync(path.join(evidenceDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  for (const container of [source, target]) {
    spawnSync('docker', ['rm', '--force', '--volumes', container], { stdio: 'ignore' })
  }
  fs.rmSync(scratch, { recursive: true, force: true })
})
