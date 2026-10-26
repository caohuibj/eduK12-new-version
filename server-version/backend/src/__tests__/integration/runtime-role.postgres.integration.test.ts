import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { runtimeTablePolicy, verifyConfiguredRuntime, verifyRuntimePrivileges } from '../../../scripts/runtime-role-contract.mjs'
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
    await owner.$executeRawUnsafe('CREATE TABLE reporting_analysis_specs (id text PRIMARY KEY)')
    await owner.$executeRawUnsafe('CREATE TABLE "_legacy_import_batches" (id SERIAL PRIMARY KEY)')
    await owner.$executeRawUnsafe('CREATE TABLE "_legacy_import_id_map" (id text PRIMARY KEY)')
    await owner.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`)
    await owner.$executeRawUnsafe(`GRANT SELECT ON "_prisma_migrations" TO "${role}"`)
    await owner.$executeRawUnsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON users,parent_report_publications,registered_assessment_resources,reporting_analysis_specs TO "${role}"`)
    await owner.$executeRawUnsafe(`GRANT USAGE,SELECT ON SEQUENCE users_id_seq TO "${role}"`)
  })
  afterAll(async () => {
    await runtime?.$disconnect(); await owner?.$disconnect()
    if (databaseCreated) await admin.$executeRawUnsafe(`DROP DATABASE "${database}" WITH (FORCE)`)
    if (roleCreated) await admin.$executeRawUnsafe(`DROP ROLE "${role}"`)
    await admin?.$disconnect()
  })
  it('allows real runtime writes, rejects newly missing grants and sequence privilege', async () => {
    expect(await verifyRuntimePrivileges(runtime)).toMatchObject({ restrictedRuntimeRole: true, runtimeTables: 7, runtimeSequences: 2 })
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
    for (const privilege of ['TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      await owner.$executeRawUnsafe(`GRANT ${privilege} ON "_prisma_migrations" TO "${role}"`)
      await expect(verifyRuntimePrivileges(runtime)).rejects.toThrow('RUNTIME_PRIVILEGES_INCOMPLETE')
      await owner.$executeRawUnsafe(`REVOKE ${privilege} ON "_prisma_migrations" FROM "${role}"`)
    }
    await expect(runtime.$executeRawUnsafe('TRUNCATE "_prisma_migrations"')).rejects.toThrow()
    expect((await runtime.$queryRawUnsafe('SELECT count(*)::int AS count FROM "_prisma_migrations"') as { count: number }[])[0].count).toBe(1)
    expect((await verifyRuntimePrivileges(runtime)).restrictedRuntimeRole).toBe(true)
  })
  it('requires no operator-table authority and rejects unclassified tables instead of demanding blanket CRUD', async () => {
    for (const name of ['_legacy_import_batches','_legacy_import_id_map']) {
      await expect(runtime.$queryRawUnsafe(`SELECT * FROM "${name}"`)).rejects.toThrow()
      await expect(runtime.$executeRawUnsafe(`INSERT INTO "${name}" DEFAULT VALUES`)).rejects.toThrow()
      await owner.$executeRawUnsafe(`GRANT SELECT ON "${name}" TO "${role}"`)
      await expect(verifyRuntimePrivileges(runtime)).rejects.toThrow('RUNTIME_PRIVILEGES_INCOMPLETE')
      await owner.$executeRawUnsafe(`REVOKE SELECT ON "${name}" FROM "${role}"`)
    }
    await owner.$executeRawUnsafe('CREATE TABLE unclassified_operator_evidence (id text)')
    try { await expect(verifyRuntimePrivileges(runtime)).rejects.toThrow('RUNTIME_PRIVILEGES_INCOMPLETE') }
    finally { await owner.$executeRawUnsafe('DROP TABLE unclassified_operator_evidence') }
    expect((await verifyRuntimePrivileges(runtime)).restrictedRuntimeRole).toBe(true)
  })
  it('classifies every table in the actual migrated release without treating operator records as runtime data', async () => {
    const actual=await admin.$queryRawUnsafe("SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')") as {name:string}[]
    expect(actual.map(row=>row.name).sort()).toEqual(Object.keys(runtimeTablePolicy.tables).sort())
    expect(Object.values(runtimeTablePolicy.tables).filter(value=>value==='OPERATOR_ONLY')).toHaveLength(2)
  })
  it('reconciles the full migrated schema with a restricted runtime and rejects the old missing-table policy',async()=>{
    const source=readFileSync(new URL('../../../scripts/runtime-role-defaults.sql',import.meta.url),'utf8')
    const client=new Client({connectionString:selected}),runtimeUrl=new URL(selected!)
    runtimeUrl.username=role;runtimeUrl.password=password
    const full=new PrismaClient({datasources:{db:{url:runtimeUrl.href}}})
    const unknown='unclassified_runtime_probe_'+suffix
    let unknownCreated=false
    const literal=(v:string)=>"'"+v.replaceAll("'","''")+"'"
    await client.connect()
    try{
      const {rows:[identity]}=await client.query('SELECT current_user AS owner,current_database() AS database')
      const sql=(policy:typeof runtimeTablePolicy)=>source.replaceAll(":'target_database'",literal(identity.database))
        .replaceAll(":'migration_owner'",literal(identity.owner)).replaceAll(":'runtime_role'",literal(role))
        .replaceAll(":'table_policy'",literal(JSON.stringify(policy)))
      await client.query(`GRANT USAGE ON SCHEMA public TO "${role}"`)
      const old=structuredClone(runtimeTablePolicy)
      delete old.tables.anonymous_study_codes;delete old.tables.anonymous_study_participation_events
      await expect(client.query(sql(old))).rejects.toMatchObject({code:'P0001',message:'UNCLASSIFIED_RUNTIME_TABLE'})
      await client.query('ROLLBACK')
      await client.query(sql(runtimeTablePolicy))
      expect(await verifyRuntimePrivileges(full)).toMatchObject({runtimeTables:Object.keys(runtimeTablePolicy.tables).length,restrictedRuntimeRole:true})
      // This reads the actual complete migration ledger, not the synthetic one above.
      expect((await verifyReleaseSchema(full)).migrationCount).toBeGreaterThanOrEqual(229)
      const user=await full.user.create({data:{username:'runtime-participation-'+suffix,passwordHash:'synthetic-only',accountDomain:'TRAINING'}})
      const study=randomUUID(),code=randomUUID(),participant=randomUUID(),event=randomUUID()
      await full.$executeRaw`INSERT INTO anonymous_studies(id,owner_user_id,title,participation_mode) VALUES(${study},${user.id},'Synthetic restricted runtime','SELF_CODE')`
      await full.$executeRaw`INSERT INTO anonymous_study_codes(id,study_id,prefix) VALUES(${code},${study},'001')`
      await full.$executeRaw`UPDATE anonymous_study_codes SET credential_version=1 WHERE id=${code}`
      expect(await full.$queryRaw`SELECT credential_version FROM anonymous_study_codes WHERE id=${code}`).toEqual([{credential_version:1}])
      await full.$executeRaw`INSERT INTO anonymous_study_participants(id,study_id,credential_hash,display_code) VALUES(${participant},${study},${'a'.repeat(64)},'synthetic-runtime-participant')`
      await full.$executeRaw`UPDATE anonymous_study_codes SET participant_id=${participant} WHERE id=${code}`
      await full.$executeRaw`INSERT INTO anonymous_study_participation_events(id,study_id,participant_id,actor_user_id,action) VALUES(${event},${study},${participant},${user.id},'CONFIGURED')`
      await expect(full.$executeRaw`UPDATE anonymous_study_codes SET prefix='002' WHERE id=${code}`).rejects.toThrow('immutable')
      await expect(full.$executeRaw`DELETE FROM anonymous_study_codes WHERE id=${code}`).rejects.toThrow('retained')
      await expect(full.$executeRaw`UPDATE anonymous_study_participation_events SET action='RESET_ISSUED' WHERE id=${event}`).rejects.toThrow('immutable')
      await expect(full.$executeRaw`DELETE FROM anonymous_study_participation_events WHERE id=${event}`).rejects.toThrow('immutable')
      await client.query(`CREATE TABLE "${unknown}" (id text)`);unknownCreated=true
      await expect(client.query(sql(runtimeTablePolicy))).rejects.toMatchObject({code:'P0001',message:'UNCLASSIFIED_RUNTIME_TABLE'})
      await client.query('ROLLBACK')
      await expect(full.$queryRawUnsafe(`SELECT * FROM "${unknown}"`)).rejects.toThrow('permission denied')
      await expect(full.$executeRawUnsafe(`INSERT INTO "${unknown}" VALUES ('synthetic')`)).rejects.toThrow('permission denied')
    }finally{
      await client.query('ROLLBACK')
      if(unknownCreated)await client.query(`DROP TABLE "${unknown}"`)
      await full.$disconnect()
      // Only this test's temporary principal; no runtime/account in any other environment.
      await client.query(`DROP OWNED BY "${role}"`)
      await client.end()
    }
  },60000)
  it('rejects owner credentials and an elevated runtime principal', async () => {
    await expect(verifyRuntimePrivileges(owner)).rejects.toThrow('RUNTIME_ROLE_NOT_RESTRICTED')
    await admin.$executeRawUnsafe(`ALTER ROLE "${role}" CREATEDB`)
    await expect(verifyRuntimePrivileges(runtime)).rejects.toThrow('RUNTIME_ROLE_NOT_RESTRICTED')
    await admin.$executeRawUnsafe(`ALTER ROLE "${role}" NOCREATEDB`)
    expect((await verifyRuntimePrivileges(runtime)).restrictedRuntimeRole).toBe(true)
  })
  it('binds explicit ACL reconciliation to the exact scope and classifies future tables before granting authority', async () => {
    const [{ name: ownerName }] = await owner.$queryRawUnsafe('SELECT current_user AS name') as { name: string }[]
    const source = readFileSync(new URL('../../../scripts/runtime-role-defaults.sql', import.meta.url), 'utf8')
    const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'"
    const sql = (target: string, migrationOwner: string, runtimeRole: string) => source
      .replaceAll(":'target_database'", literal(target))
      .replaceAll(":'migration_owner'", literal(migrationOwner))
      .replaceAll(":'runtime_role'", literal(runtimeRole))
      .replaceAll(":'table_policy'", literal(JSON.stringify(runtimeTablePolicy)))
    const url = new URL(selected!); url.pathname = '/' + database
    const client = new Client({ connectionString: url.href })
    await client.connect()
    try {
      await owner.$executeRawUnsafe(`GRANT INSERT ON "_prisma_migrations" TO "${role}"`)
      for (const args of [[database + '_wrong', ownerName, role], [database, role, role], [database, ownerName, ownerName]]) {
        await expect(client.query(sql(...args as [string, string, string]))).rejects.toThrow('EXACT_RUNTIME_PROVISION_SCOPE_MISMATCH')
        await client.query('ROLLBACK')
      }
      // Invalid plans must not silently revoke or grant anything.
      await expect(verifyRuntimePrivileges(runtime)).rejects.toThrow('RUNTIME_PRIVILEGES_INCOMPLETE')
      await owner.$executeRawUnsafe('GRANT SELECT ON "_legacy_import_batches" TO PUBLIC')
      await expect(client.query(sql(database, ownerName, role))).rejects.toThrow('INHERITED_RUNTIME_PRIVILEGE_FORBIDDEN')
      await client.query('ROLLBACK')
      await owner.$executeRawUnsafe('REVOKE SELECT ON "_legacy_import_batches" FROM PUBLIC')
      // An inherited operator grant must roll back ledger reconciliation too.
      await expect(verifyRuntimePrivileges(runtime)).rejects.toThrow('RUNTIME_PRIVILEGES_INCOMPLETE')
      await client.query(sql(database, ownerName, role))
      await client.query(sql(database, ownerName, role)) // idempotent
      await owner.$executeRawUnsafe('CREATE TABLE courses (id SERIAL PRIMARY KEY, name text)')
      await expect(runtime.$executeRawUnsafe("INSERT INTO courses(name) VALUES ('future')")).rejects.toThrow()
      await expect(verifyRuntimePrivileges(runtime)).rejects.toThrow('RUNTIME_PRIVILEGES_INCOMPLETE')
      await client.query(sql(database, ownerName, role))
      await runtime.$executeRawUnsafe("INSERT INTO courses(name) VALUES ('future')")
      await runtime.$executeRawUnsafe("UPDATE courses SET name='updated'")
      expect((await runtime.$queryRawUnsafe('SELECT name FROM courses') as { name: string }[])[0].name).toBe('updated')
      await runtime.$executeRawUnsafe('DELETE FROM courses')
      await expect(runtime.$queryRawUnsafe('SELECT * FROM "_legacy_import_batches"')).rejects.toThrow()
      await owner.$executeRawUnsafe('CREATE TABLE unclassified_operator_evidence (id text)')
      await expect(client.query(sql(database, ownerName, role))).rejects.toThrow('UNCLASSIFIED_RUNTIME_TABLE')
      await client.query('ROLLBACK')
      await owner.$executeRawUnsafe('DROP TABLE unclassified_operator_evidence')
      await expect(runtime.$executeRawUnsafe('TRUNCATE "_prisma_migrations"')).rejects.toThrow()
      expect((await verifyRuntimePrivileges(runtime)).restrictedRuntimeRole).toBe(true)
    } finally {
      await client.query('ROLLBACK')
      await client.end()
      await owner.$executeRawUnsafe('DROP TABLE IF EXISTS courses,unclassified_operator_evidence')
    }
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
