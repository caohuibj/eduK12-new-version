import {createHash, randomUUID} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {PrismaClient} from '@prisma/client'
import {afterAll, describe, expect, it} from 'vitest'
import {prisma} from '../../config/database'
import {integrationDatabaseUrl, requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {publicTaskGroupArtifact, readTaskGroupArtifact, saveTaskGroupArtifact} from '../../modules/reporting/task-artifact'

const selected = integrationDatabaseUrl('GROUP_REPORT_QUALIFICATION_DATABASE_URL')
const suite = selected ? describe : describe.skip
let restored: PrismaClient | undefined
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
afterAll(async () => {await restored?.$disconnect(); await prisma.$disconnect()})
suite('exact main task artifact migration and native backup', () => {
  it('upgrades exact main, restores encrypted artifacts with native PostgreSQL and preserves immutable rows', async () => {
    requireIsolatedReleaseDatabase(selected!)
    const backendDir = fileURLToPath(new URL('../../../', import.meta.url))
    const sourceUrl = new URL(selected!), restoreUrl = new URL(process.env.GROUP_REPORT_RESTORE_DATABASE_URL!)
    expect(restoreUrl.hostname).toBe(sourceUrl.hostname); expect(restoreUrl.port).toBe(sourceUrl.port)
    expect(restoreUrl.pathname).toMatch(/_restore_test_/); expect(restoreUrl.pathname).not.toBe(sourceUrl.pathname)
    const baseDir = process.env.GROUP_REPORT_MAIN_PRISMA_DIR!
    const expected = readdirSync(resolve(baseDir, 'migrations'), {withFileTypes: true}).filter(row => row.isDirectory()).map(row => row.name).sort()
    const current = readdirSync(resolve(backendDir, 'prisma/migrations'), {withFileTypes: true}).filter(row => row.isDirectory()).map(row => row.name).sort()
    const baseNames = new Set(expected), expectedAdded = current.filter(name => !baseNames.has(name))
    expect(current).toEqual([...expected, ...expectedAdded].sort())
    const applied = await prisma.$queryRaw<Array<{name: string; ledger: unknown}>>`SELECT migration_name AS name,to_jsonb(m) AS ledger FROM _prisma_migrations m WHERE finished_at IS NOT NULL ORDER BY migration_name`
    const continuation = process.env.GROUP_REPORT_NATIVE_CONTINUE === '1'
    let source: {product: 'SURVEY'; containerId: string; taskId: string}, artifact: Awaited<ReturnType<typeof saveTaskGroupArtifact>>
    if (!continuation) {
    expect(applied.map(row => row.name)).toEqual(expected)
    expect((await prisma.$queryRaw<Array<{name: string | null}>>`SELECT to_regclass('reporting_task_artifacts')::text AS name`)[0].name).toBeNull()
    const migrationLog = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {encoding: 'utf8', env: process.env, cwd: backendDir})
    writeFileSync('/tmp/group-report-candidate-migrate.log', migrationLog)
    const added = await prisma.$queryRaw<Array<{name: string; ledger: unknown}>>`SELECT migration_name AS name,to_jsonb(m) AS ledger FROM _prisma_migrations m WHERE finished_at IS NOT NULL ORDER BY migration_name`
    expect(added.map(row => row.name)).toEqual(current)
    expect(added.filter(row => !baseNames.has(row.name)).map(row => row.name)).toEqual(expectedAdded)
    expect(added).toHaveLength(applied.length + expectedAdded.length)
    expect(added.filter(row => baseNames.has(row.name))).toEqual(applied)
    const owner = await prisma.user.create({data: {username: 'native-group-synthetic-' + randomUUID(), passwordHash: 'synthetic-only', role: 'STUDENT', accountDomain: 'SURVEY'}})
    source = {product: 'SURVEY' as const, containerId: randomUUID(), taskId: randomUUID()}
    artifact = await saveTaskGroupArtifact(prisma, {source, generatedBy: owner.id, selector: {kind: 'ALL'}, sourceBindings: {parents: []}, projection: {
      schemaVersion: 1, descriptionVersion: 'group-descriptive-v1', title: 'Synthetic native roundtrip', sourceLabel: 'Qualification only', populationLabel: 'No respondent data', cutoff: new Date().toISOString(), completedN: 0, countUnit: 'RESPONSE', assignedN: null,
      tool: {key: 'synthetic', title: 'Synthetic', kind: 'FORM'}, metrics: [], limitations: ['Synthetic artifact, no real answers.']}})
    } else {
      expect(applied.map(row => row.name)).toEqual(current)
      const rows = await prisma.$queryRaw<Array<{id: string; containerId: string; taskId: string}>>`SELECT id,container_id AS "containerId",task_id AS "taskId" FROM reporting_task_artifacts WHERE product='SURVEY'`
      expect(rows).toHaveLength(1)
      source = {product: 'SURVEY', containerId: rows[0].containerId, taskId: rows[0].taskId}
      artifact = publicTaskGroupArtifact((await readTaskGroupArtifact(prisma, source, rows[0].id))!)
    }
    restored = new PrismaClient({datasources: {db: {url: restoreUrl.href}}})
    if (!continuation) expect((await restored.$queryRaw<Array<{n: bigint}>>`SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public'`)[0].n).toBe(0n)
    const container = process.env.GROUP_REPORT_POSTGRES_CONTAINER!, env = {...process.env, PGPASSWORD: decodeURIComponent(sourceUrl.password)}
    const postgres = (program: string, args: string[], input?: Buffer) => execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD', container, program, '-h', '127.0.0.1', '-p', '5432', '-U', decodeURIComponent(sourceUrl.username), ...args], {env, input, maxBuffer: 32 * 1024 * 1024})
    const version = execFileSync('docker', ['exec', container, 'pg_dump', '--version'], {encoding: 'utf8'}).trim()
    const archive = continuation ? readFileSync('/tmp/group-report-native.dump') : postgres('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '-d', sourceUrl.pathname.slice(1)])
    if (!continuation) {
    writeFileSync('/tmp/group-report-native.dump', archive)
    postgres('pg_restore', ['--exit-on-error', '--no-owner', '--no-privileges', '-d', restoreUrl.pathname.slice(1)], archive)
    }
    const normalized = (bytes: Buffer) => bytes.toString('utf8').split('\n').filter(line => !/^\\(?:un)?restrict /.test(line)).join('\n')
    const schema = (database: string) => normalized(postgres('pg_dump', ['--schema-only', '--table=public.reporting_task_artifacts', '--no-owner', '--no-privileges', '-d', database]))
    const sourceSchema = sha(schema(sourceUrl.pathname.slice(1))), restoreSchema = sha(schema(restoreUrl.pathname.slice(1)))
    expect(restoreSchema).toBe(sourceSchema)
    const copy = await readTaskGroupArtifact(restored, source, artifact.artifactId)
    expect(copy).toMatchObject(artifact); expect(copy!.source).toEqual(source)
    await expect(restored.$executeRaw`UPDATE reporting_task_artifacts SET payload_hash=payload_hash WHERE id=${artifact.artifactId}`).rejects.toThrow(/reporting snapshot rows are immutable/)
    writeFileSync('/tmp/group-report-native.json', JSON.stringify({passed: true, synthetic: true, productionAccessed: false, base: '8cf07bfd35702222e279cbfeee2f64d73a938b55', baseMigrations: expected.length, addedMigrations: expectedAdded, candidateMigrations: current.length, pgVersion: version, nativeArchiveSHA256: sha(archive), nativeArchiveBytes: archive.length, sourceSchema, restoreSchema, schemaScope: 'new reporting_task_artifacts table, indexes, foreign key and immutable trigger', nativeRestorePerformedThisInvocation: !continuation, retainedNativeRestoreContinued: continuation, encryptedArtifactRead: true, immutableTriggerVerified: true, dumpUploaded: false}, null, 2) + '\n')
  }, 30000)
})
