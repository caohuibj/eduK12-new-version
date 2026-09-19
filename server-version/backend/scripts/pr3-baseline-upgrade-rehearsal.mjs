#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const PR3_MIGRATIONS = [
  '20260919115500_freeze_run_start_attempt_identity',
  '20260919121000_reporting_core',
]

const sourceDatabaseUrl = process.env.DATABASE_URL
if (!sourceDatabaseUrl) {
  console.error('PR3 upgrade rehearsal requires DATABASE_URL')
  process.exit(2)
}

const backendRoot = process.cwd()
const sourcePrismaDir = path.join(backendRoot, 'prisma')
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'huisurvey-pr3-upgrade-'))
const baselinePrismaDir = path.join(tempRoot, 'prisma')
const prismaBin = path.join(
  backendRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
)

const databaseName = `ptool_pr3_upgrade_${process.pid}_${Date.now()}`
const adminUrl = new URL(sourceDatabaseUrl)
adminUrl.pathname = '/postgres'
adminUrl.searchParams.delete('schema')
const rehearsalUrl = new URL(sourceDatabaseUrl)
rehearsalUrl.pathname = `/${databaseName}`
rehearsalUrl.searchParams.set('schema', 'public')

const runPrisma = (args, { databaseUrl, input, quiet = false } = {}) => {
  const result = spawnSync(prismaBin, args, {
    cwd: backendRoot,
    env: {
      ...process.env,
      ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
    },
    encoding: 'utf8',
    input,
    stdio: quiet ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'inherit'],
  })
  if (result.status !== 0) {
    const stderr = quiet ? result.stderr?.trim() : ''
    throw new Error(`prisma ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`)
  }
}

const executeAdmin = (sql) => runPrisma(
  ['db', 'execute', '--url', adminUrl.toString(), '--stdin'],
  { input: sql, quiet: true },
)

const seedBaseline = async () => {
  const ids = {
    user: randomUUID(),
    organization: randomUUID(),
    membership: randomUUID(),
    run: randomUUID(),
    track: randomUUID(),
    actor: randomUUID(),
    relationship: randomUUID(),
    execution: randomUUID(),
    claim: randomUUID(),
    audit: randomUUID(),
    episode: randomUUID(),
    assignment: randomUUID(),
  }
  const client = new PrismaClient({ datasources: { db: { url: rehearsalUrl.toString() } } })
  try {
    await client.$connect()
    await client.$executeRawUnsafe(
      `INSERT INTO "users" ("id","username","password_hash","role","updated_at")
       VALUES ($1,$2,$3,'STUDENT',CURRENT_TIMESTAMP)`,
      ids.user,
      `pr3-upgrade-${ids.user}`,
      'test-only',
    )
    await client.$executeRawUnsafe(
      `INSERT INTO "organizations" ("id","name","created_by_user_id") VALUES ($1,$2,$3)`,
      ids.organization,
      'PR3 populated upgrade rehearsal',
      ids.user,
    )
    await client.$executeRawUnsafe(
      `INSERT INTO "organization_memberships" ("id","organization_id","user_id") VALUES ($1,$2,$3)`,
      ids.membership,
      ids.organization,
      ids.user,
    )
    await client.$executeRawUnsafe(
      `INSERT INTO "assessment_runs" ("id","organization_id","name","status","version","created_by_user_id","published_at")
       VALUES ($1,$2,$3,'PUBLISHED',1,$4,CURRENT_TIMESTAMP)`,
      ids.run,
      ids.organization,
      'PR3 baseline run',
      ids.user,
    )
    await client.$executeRawUnsafe(
      `INSERT INTO "assessment_run_tracks"
        ("id","organization_id","run_id","resource_family","resource_key","resource_version","subject_selector","respondent_selector","requested_policy")
       VALUES ($1,$2,$3,'BUNDLE','pr3-upgrade-baseline','1.0.0','{}'::jsonb,'{}'::jsonb,'{}'::jsonb)`,
      ids.track,
      ids.organization,
      ids.run,
    )
    await client.$executeRawUnsafe(
      `INSERT INTO "assessment_run_actor_snapshots"
        ("id","organization_id","run_id","provenance_kind","user_id","membership_id","actor_role","snapshot_payload","snapshot_hash")
       VALUES ($1,$2,$3,'ORG_MEMBER',$4,$5,'STUDENT',$6::jsonb,$7)`,
      ids.actor,
      ids.organization,
      ids.run,
      ids.user,
      ids.membership,
      JSON.stringify({ schemaVersion: 1, userId: ids.user, membershipId: ids.membership, actorRole: 'STUDENT' }),
      'a'.repeat(64),
    )
    await client.$executeRawUnsafe(
      `INSERT INTO "assessment_run_relationship_snapshots"
        ("id","organization_id","run_id","relationship_kind","subject_actor_snapshot_id","respondent_actor_snapshot_id","snapshot_payload","snapshot_hash")
       VALUES ($1,$2,$3,'SELF',$4,$4,$5::jsonb,$6)`,
      ids.relationship,
      ids.organization,
      ids.run,
      ids.actor,
      JSON.stringify({ schemaVersion: 1, relationshipKind: 'SELF', subjectActorSnapshotId: ids.actor, respondentActorSnapshotId: ids.actor }),
      'b'.repeat(64),
    )
    await client.$executeRawUnsafe(
      `INSERT INTO "assessment_run_executions"
        ("id","organization_id","run_id","track_id","subject_actor_snapshot_id","respondent_actor_snapshot_id","relationship_snapshot_id","status")
       VALUES ($1,$2,$3,$4,$5,$5,$6,'ASSIGNED')`,
      ids.execution,
      ids.organization,
      ids.run,
      ids.track,
      ids.actor,
      ids.relationship,
    )
    await client.$executeRawUnsafe(
      `INSERT INTO "assessment_run_execution_start_claims"
        ("id","organization_id","run_id","execution_id","operation_key","claim_generation","state","claimed_at","lease_until","updated_at")
       VALUES ($1,$2,$3,$4,$5,1,'CLAIMED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP + INTERVAL '5 minutes',CURRENT_TIMESTAMP)`,
      ids.claim,
      ids.organization,
      ids.run,
      ids.execution,
      `run-start:${ids.execution}:baseline`,
    )
    await client.$executeRawUnsafe(
      `INSERT INTO "organization_governance_audits"
        ("id","organization_id","actor_user_id","action","target_type","target_id","domain_event_id","payload")
       VALUES ($1,$2,$3,'ASSESSMENT_RUN_START_ADMITTED','AssessmentRunExecution',$4,$5,$6::jsonb)`,
      ids.audit,
      ids.organization,
      ids.user,
      ids.execution,
      ids.claim,
      JSON.stringify({
        operationKey: `run-start:${ids.execution}:baseline`,
        assignmentId: ids.assignment,
        attemptIdentity: {
          subjectUserId: ids.user,
          respondentUserId: ids.user,
          episodeId: ids.episode,
          assignmentRef: ids.assignment,
          consentId: null,
        },
      }),
    )
    return ids
  } finally {
    await client.$disconnect()
  }
}

const verifyHead = async (ids) => {
  const client = new PrismaClient({ datasources: { db: { url: rehearsalUrl.toString() } } })
  try {
    await client.$connect()
    const claims = await client.$queryRawUnsafe(
      `SELECT "admitted_attempt_identity" AS "identity"
       FROM "assessment_run_execution_start_claims" WHERE "id"=$1`,
      ids.claim,
    )
    if (claims.length !== 1) throw new Error('baseline START claim was not preserved')
    const identity = claims[0].identity
    if (
      identity?.subjectUserId !== ids.user
      || identity?.respondentUserId !== ids.user
      || identity?.episodeId !== ids.episode
      || identity?.assignmentRef !== ids.assignment
      || identity?.consentId !== null
    ) {
      throw new Error('START admitted_attempt_identity backfill does not match admission audit provenance')
    }

    const preserved = await client.$queryRawUnsafe(
      `SELECT
        EXISTS(SELECT 1 FROM "users" WHERE "id"=$1) AS "user",
        EXISTS(SELECT 1 FROM "assessment_runs" WHERE "id"=$2) AS "run"`,
      ids.user,
      ids.run,
    )
    if (!preserved[0]?.user || !preserved[0]?.run) {
      throw new Error('baseline identity/run rows were not preserved by PR3 migrations')
    }

    const reportingTables = await client.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "count"
       FROM information_schema.tables
       WHERE table_schema='public'
         AND table_name IN ('reporting_analysis_specs','reporting_cohort_snapshots','reporting_analysis_artifacts')`,
    )
    if (reportingTables[0]?.count !== 3) {
      throw new Error('PR3 reporting tables were not all created')
    }

    const migrationRows = await client.$queryRawUnsafe(
      `SELECT migration_name FROM "_prisma_migrations"
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
         AND migration_name = ANY($1::text[])
       ORDER BY migration_name`,
      PR3_MIGRATIONS,
    )
    if (migrationRows.length !== PR3_MIGRATIONS.length) {
      throw new Error('PR3 migrations are not recorded as successfully applied')
    }
  } finally {
    await client.$disconnect()
  }
}

let createdDatabase = false
try {
  cpSync(sourcePrismaDir, baselinePrismaDir, { recursive: true })
  // Freeze the pre-PR3 baseline even as later migrations depend on PR3 tables.
  for (const migration of readdirSync(path.join(baselinePrismaDir, 'migrations')).filter((name) => name >= PR3_MIGRATIONS[0])) {
    rmSync(path.join(baselinePrismaDir, 'migrations', migration), { recursive: true, force: true })
  }

  executeAdmin(`CREATE DATABASE "${databaseName}";`)
  createdDatabase = true

  runPrisma(
    ['migrate', 'deploy', '--schema', path.join(baselinePrismaDir, 'schema.prisma')],
    { databaseUrl: rehearsalUrl.toString() },
  )
  const ids = await seedBaseline()

  runPrisma(
    ['migrate', 'deploy', '--schema', path.join(sourcePrismaDir, 'schema.prisma')],
    { databaseUrl: rehearsalUrl.toString() },
  )
  await verifyHead(ids)

  // Re-running the exact head migration set must be a no-op after the populated upgrade.
  runPrisma(
    ['migrate', 'deploy', '--schema', path.join(sourcePrismaDir, 'schema.prisma')],
    { databaseUrl: rehearsalUrl.toString() },
  )

  console.log(JSON.stringify({
    ok: true,
    baseline: 'all migrations before PR3',
    upgraded: PR3_MIGRATIONS,
    populatedStartClaimBackfill: true,
    reportingTables: 3,
    idempotentHeadDeploy: true,
  }))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  if (createdDatabase) {
    try {
      executeAdmin(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE);`)
    } catch (error) {
      console.error(`failed to clean PR3 rehearsal database: ${error instanceof Error ? error.message : String(error)}`)
      process.exitCode = 1
    }
  }
  rmSync(tempRoot, { recursive: true, force: true })
}
