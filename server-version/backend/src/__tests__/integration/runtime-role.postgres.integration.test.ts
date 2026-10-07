import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { verifyConfiguredRuntime, verifyRuntimePrivileges } from '../../../scripts/runtime-role-contract.mjs'
import { verifyReleaseSchema } from '../../../scripts/release-schema-contract.mjs'

const selected = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = selected ? describe : describe.skip
const suffix = randomUUID().replaceAll('-', '')
const database = 'runtime_contract_test_' + suffix, role = 'runtime_test_' + suffix
const password = randomUUID()
const expected = [{ name: 'synthetic_release', checksum: 'a'.repeat(64) }]
let admin: PrismaClient, owner: PrismaClient, runtime: PrismaClient
let databaseCreated = false, roleCreated = false

suite('actual restricted runtime role and exact release identity', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(selected!)
    // All grants below are restricted to these explicitly named synthetic tables
    // in a new disposable loopback database. No production/default grants exist.
    admin = new PrismaClient({ datasources: { db: { url: selected } } })
    await admin.$executeRawUnsafe(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`)
    roleCreated = true
    await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`)
    databaseCreated = true
    const url = new URL(selected!); url.pathname = '/' + database
    owner = new PrismaClient({ datasources: { db: { url: url.href } } })
    url.username = role; url.password = password
    runtime = new PrismaClient({ datasources: { db: { url: url.href } } })
    await owner.$executeRawUnsafe('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
    await owner.$executeRawUnsafe('CREATE TABLE "_prisma_migrations" (migration_name text, checksum text, finished_at timestamptz, rolled_back_at timestamptz)')
    await owner.$executeRawUnsafe(`INSERT INTO "_prisma_migrations" VALUES ('synthetic_release','${expected[0].checksum}',now(),NULL)`)
    await owner.$executeRawUnsafe('CREATE TABLE users (id SERIAL PRIMARY KEY, name text)')
    await owner.$executeRawUnsafe('CREATE TABLE parent_report_publications (id text PRIMARY KEY)')
    await owner.$executeRawUnsafe('CREATE TABLE registered_assessment_resources (id text PRIMARY KEY)')
    await owner.$executeRawUnsafe('CREATE TABLE reporting_specs (id text PRIMARY KEY)')
    await owner.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`)
    await owner.$executeRawUnsafe(`GRANT SELECT ON "_prisma_migrations" TO "${role}"`)
    await owner.$executeRawUnsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON users,parent_report_publications,registered_assessment_resources,reporting_specs TO "${role}"`)
    await owner.$executeRawUnsafe(`GRANT USAGE,SELECT ON SEQUENCE users_id_seq TO "${role}"`)
  })
  afterAll(async () => {
    await runtime?.$disconnect(); await owner?.$disconnect()
    if (databaseCreated) await admin.$executeRawUnsafe(`DROP DATABASE "${database}" WITH (FORCE)`)
    if (roleCreated) await admin.$executeRawUnsafe(`DROP ROLE "${role}"`)
    await admin?.$disconnect()
  })
  it('allows real runtime writes, rejects newly missing grants and sequence privilege', async () => {
    expect(await verifyRuntimePrivileges(runtime)).toMatchObject({ restrictedRuntimeRole: true, runtimeTables: 5, runtimeSequences: 1 })
    await runtime.$executeRawUnsafe("INSERT INTO users(name) VALUES ('synthetic')")
    await runtime.$executeRawUnsafe("INSERT INTO parent_report_publications VALUES ('synthetic')")
    await owner.$executeRawUnsafe(`REVOKE INSERT ON parent_report_publications FROM "${role}"`)
    await expect(verifyRuntimePrivileges(runtime)).rejects.toThrow('RUNTIME_PRIVILEGES_INCOMPLETE')
    await owner.$executeRawUnsafe(`GRANT INSERT ON parent_report_publications TO "${role}"`)
    await owner.$executeRawUnsafe(`REVOKE USAGE ON SEQUENCE users_id_seq FROM "${role}"`)
    await expect(verifyRuntimePrivileges(runtime)).rejects.toThrow('RUNTIME_PRIVILEGES_INCOMPLETE')
    await owner.$executeRawUnsafe(`GRANT USAGE ON SEQUENCE users_id_seq TO "${role}"`)
    await owner.$executeRawUnsafe(`GRANT INSERT ON "_prisma_migrations" TO "${role}"`)
    await expect(verifyRuntimePrivileges(runtime)).rejects.toThrow('RUNTIME_PRIVILEGES_INCOMPLETE')
    await owner.$executeRawUnsafe(`REVOKE INSERT ON "_prisma_migrations" FROM "${role}"`)
    expect((await verifyRuntimePrivileges(runtime)).restrictedRuntimeRole).toBe(true)
  })
  it('rejects owner credentials and an elevated runtime principal', async () => {
    await expect(verifyRuntimePrivileges(owner)).rejects.toThrow('RUNTIME_ROLE_NOT_RESTRICTED')
    await admin.$executeRawUnsafe(`ALTER ROLE "${role}" CREATEDB`)
    await expect(verifyRuntimePrivileges(runtime)).rejects.toThrow('RUNTIME_ROLE_NOT_RESTRICTED')
    await admin.$executeRawUnsafe(`ALTER ROLE "${role}" NOCREATEDB`)
    expect((await verifyRuntimePrivileges(runtime)).restrictedRuntimeRole).toBe(true)
  })
  it('binds the actual migration ledger to the exact release and rejects changed, missing, extra or unfinished migrations', async () => {
    expect(await verifyReleaseSchema(runtime, expected)).toMatchObject({ migrationCount: 1 })
    await expect(verifyReleaseSchema(runtime, [])).rejects.toThrow('RELEASE_MIGRATION_IDENTITY_MISMATCH')
    await expect(verifyReleaseSchema(runtime, [...expected, { name: 'missing', checksum: 'b'.repeat(64) }])).rejects.toThrow('RELEASE_MIGRATION_IDENTITY_MISMATCH')
    await expect(verifyReleaseSchema(runtime, [{ name: 'synthetic_release', checksum: 'b'.repeat(64) }])).rejects.toThrow('RELEASE_MIGRATION_IDENTITY_MISMATCH')
    await owner.$executeRawUnsafe("INSERT INTO \"_prisma_migrations\" VALUES ('unfinished','b',NULL,NULL)")
    await expect(verifyReleaseSchema(runtime, expected)).rejects.toThrow('RELEASE_MIGRATION_IDENTITY_MISMATCH')
    await owner.$executeRawUnsafe("DELETE FROM \"_prisma_migrations\" WHERE migration_name='unfinished'")
    expect((await verifyReleaseSchema(runtime, expected)).migrationCount).toBe(1)
  })
  it('never substitutes owner credentials for deployment and labels owner-only disposable gates explicitly', async () => {
    try {
      vi.stubEnv('DATABASE_URL_RUNTIME', '')
      vi.stubEnv('DATABASE_URL', 'postgresql://synthetic:synthetic@127.0.0.1:5432/ptool')
      vi.stubEnv('CI', 'true'); vi.stubEnv('NODE_ENV', 'production')
      await expect(verifyConfiguredRuntime({ allowIsolatedTestAbsence: true })).rejects.toThrow('DATABASE_URL_RUNTIME_REQUIRED')
      vi.stubEnv('NODE_ENV', 'test')
      await expect(verifyConfiguredRuntime()).rejects.toThrow('DATABASE_URL_RUNTIME_REQUIRED')
      expect(await verifyConfiguredRuntime({ allowIsolatedTestAbsence: true })).toEqual({ runtimeRoleVerified: false, reason: 'owner_only_disposable_code_gate' })
      vi.stubEnv('DATABASE_URL', '')
      await expect(verifyConfiguredRuntime({ current: true, allowIsolatedTestAbsence: true })).rejects.toThrow('DATABASE_URL_RUNTIME_REQUIRED')
      vi.stubEnv('DATABASE_URL', 'postgresql://synthetic:synthetic@127.0.0.1:5432/production')
      await expect(verifyConfiguredRuntime({ allowIsolatedTestAbsence: true })).rejects.toThrow('DATABASE_URL_RUNTIME_REQUIRED')
      vi.stubEnv('DATABASE_URL_RUNTIME', 'postgresql://synthetic:synthetic@127.0.0.1:5432/another')
      await expect(verifyConfiguredRuntime()).rejects.toThrow('RUNTIME_DATABASE_MISMATCH')
    } finally { vi.unstubAllEnvs() }
  })
})
