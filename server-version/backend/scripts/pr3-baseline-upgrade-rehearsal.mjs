#!/usr/bin/env node

import { randomBytes } from 'node:crypto'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const SOURCE_URL = process.env.DATABASE_URL
if (!SOURCE_URL) throw new Error('DATABASE_URL is required for the PR3 baseline upgrade rehearsal')

const source = new URL(SOURCE_URL)
const databaseName = `ptool_pr3_upgrade_${process.pid}_${randomBytes(4).toString('hex')}`
const adminUrl = new URL(source)
adminUrl.pathname = '/postgres'
adminUrl.searchParams.delete('schema')
const targetUrl = new URL(source)
targetUrl.pathname = `/${databaseName}`
targetUrl.searchParams.set('schema', 'public')

const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } })
let target = null
const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'huisurvey-pr3-upgrade-'))
const baselinePrisma = path.join(temporaryRoot, 'prisma')
const cwd = process.cwd()

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`
const run = (command, args, extraEnv = {}) => {
  execFileSync(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
  })
}

try {
  await admin.$connect()
  await admin.$executeRawUnsafe(`CREATE DATABASE ${quoteIdentifier(databaseName)}`)

  cpSync(path.join(cwd, 'prisma'), baselinePrisma, { recursive: true })
  for (const migration of [
    '20260919115500_freeze_run_start_attempt_identity',
    '20260919121000_reporting_core',
  ]) {
    rmSync(path.join(baselinePrisma, 'migrations', migration), { recursive: true, force: true })
  }

  run(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
    'prisma', 'migrate', 'deploy', `--schema=${path.join(baselinePrisma, 'schema.prisma')}`,
  ], { DATABASE_URL: targetUrl.toString() })
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'db:seed'], {
    DATABASE_URL: targetUrl.toString(),
    ADMIN_USERNAME: 'pr3-upgrade-admin',
    ADMIN_PASSWORD: 'pr3-upgrade-password-2026',
  })

  target = new PrismaClient({ datasources: { db: { url: targetUrl.toString() } } })
  await target.$connect()
  const beforeRows = await target.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "users"`)
  const baselineUsers = Number(beforeRows[0]?.count ?? 0)
  if (baselineUsers < 1) throw new Error('PR3 baseline rehearsal requires populated pre-PR3 data')
  const beforeReporting = await target.$queryRawUnsafe(`SELECT to_regclass('public.reporting_analysis_specs')::text AS name`)
  if (beforeReporting[0]?.name) throw new Error('reporting tables unexpectedly exist in the PR2 baseline')
  const beforeIdentity = await target.$queryRawUnsafe(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='assessment_run_execution_start_claims'
        AND column_name='admitted_attempt_identity'
    ) AS present
  `)
  if (beforeIdentity[0]?.present === true) throw new Error('admitted_attempt_identity unexpectedly exists in the PR2 baseline')
  await target.$disconnect()
  target = null

  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'db:migrate:guarded'], {
    DATABASE_URL: targetUrl.toString(),
  })

  target = new PrismaClient({ datasources: { db: { url: targetUrl.toString() } } })
  await target.$connect()
  for (const table of ['reporting_analysis_specs', 'reporting_cohort_snapshots', 'reporting_analysis_artifacts']) {
    const rows = await target.$queryRawUnsafe(`SELECT to_regclass('public.${table}')::text AS name`)
    if (!rows[0]?.name) throw new Error(`${table} missing after PR3 upgrade`)
  }
  const identityRows = await target.$queryRawUnsafe(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='assessment_run_execution_start_claims'
        AND column_name='admitted_attempt_identity'
    ) AS present
  `)
  if (identityRows[0]?.present !== true) throw new Error('admitted_attempt_identity missing after PR3 upgrade')
  const afterRows = await target.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "users"`)
  if (Number(afterRows[0]?.count ?? -1) !== baselineUsers) {
    throw new Error(`populated baseline user count changed during PR3 upgrade: before=${baselineUsers} after=${String(afterRows[0]?.count)}`)
  }
  const seeded = await target.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "users" WHERE "username"='pr3-upgrade-admin'`)
  if (Number(seeded[0]?.count ?? 0) !== 1) throw new Error('baseline seeded user did not survive PR3 upgrade')
  await target.$disconnect()
  target = null

  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'db:migrate:guarded'], {
    DATABASE_URL: targetUrl.toString(),
  })

  console.log(JSON.stringify({ ok: true, baselineUsers, databaseName }))
} finally {
  if (target) await target.$disconnect().catch(() => undefined)
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`).catch(() => undefined)
  await admin.$disconnect().catch(() => undefined)
  rmSync(temporaryRoot, { recursive: true, force: true })
}
