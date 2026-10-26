import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertNonOwner, batchManifestSchema, requireDisposableBatchUrl, materializeBatchEntry } from '../../../../scripts/scale-content-batch'
import { getScaleInstrumentSource } from '../../../modules/scale/onboarding/instrument-registry'
import { materializeScaleInstrumentContent } from '../../../modules/scale/onboarding/materialize'
import { installScaleInstrument } from '../../../modules/scale/onboarding/install'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'

const selected = process.env.SCALE_BATCH_DATABASE_URL
const suite = selected ? describe : describe.skip
suite('Wave9 independently reviewed BPSES5 Chinese draft in task-owned PostgreSQL', { timeout: 30_000 }, () => {
  const db = new PrismaClient({ datasources: { db: { url: requireDisposableBatchUrl(selected) } } })
  const manifest = batchManifestSchema.parse(JSON.parse(readFileSync(resolve('../../docs/scale-instruments/batches/20261026-wave9/manifest.json'), 'utf8')))
  const keys = ['bpses5_zh_cn_research']
  let actorUserId: string
  let beforeRows: unknown, beforeSnapshots: unknown
  const reports: unknown[] = []
  const oldRows = () => db.scale.findMany({ where: { code: { notIn: keys } }, orderBy: { code: 'asc' }, select: { id: true, code: true, instrumentVersion: true, status: true, visibility: true, definitionHash: true, definition: true, tags: true } })
  const oldSnapshots = () => db.$queryRaw`SELECT axis_hash,source_hash,axes,source_snapshot FROM scale_axis_snapshots WHERE scale_id IN (SELECT id FROM scales WHERE code NOT IN ('bpses5_zh_cn_research')) ORDER BY axis_hash`
  beforeAll(async () => {
    await assertNonOwner(db)
    expect(manifest.sources.map(s => s.instrumentKey)).toEqual(keys)
    actorUserId = (await db.user.findUniqueOrThrow({ where: { username: 'scale-batch-pilot-admin-20261026' } })).id
    beforeRows = await oldRows(); beforeSnapshots = await oldSnapshots()
  })
  afterAll(async () => {
    if (process.env.SCALE_WAVE9_REPORT_OUT) writeFileSync(process.env.SCALE_WAVE9_REPORT_OUT, JSON.stringify(reports, null, 2) + '\n')
    await db.$disconnect()
  })
  it('starts with fourteen prior synthetic definitions and sixteen frozen snapshots under a non-owner role', async () => {
    expect(await db.scale.count()).toBe(14)
    expect(beforeRows).toHaveLength(14); expect(beforeSnapshots).toHaveLength(16)
    expect(await assertNonOwner(db)).toEqual({ role: 'scale_app', superuser: false, database_owner: false, table_owner: false, schema_owner: false, bypass_rls: false, create_db: false, create_role: false })
  })
  for (const entry of manifest.sources) {
    const key = entry.instrumentKey
    it(key + ' rolls back new draft and frozen snapshot together', async () => {
      expect(await db.scale.findUnique({ where: { code: key } })).toBeNull()
      await expect(db.$transaction(async tx => {
        await materializeScaleInstrumentContent(tx, { ...entry, actorUserId })
        throw new Error('WAVE9_SYNTHETIC_ROLLBACK')
      })).rejects.toThrow('WAVE9_SYNTHETIC_ROLLBACK')
      expect(await db.scale.findUnique({ where: { code: key } })).toBeNull()
      expect((await db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM scale_axis_snapshots`)[0].n).toBe(BigInt(16 + keys.indexOf(key)))
    })
    it(key + ' materializes pinned content once with exact axes and rich catalog snapshot', async () => {
      const first = await materializeBatchEntry(db, process.cwd(), entry, actorUserId)
      const again = await materializeBatchEntry(db, process.cwd(), entry, actorUserId)
      expect(first.created).toBe(true); expect(again.created).toBe(false)
      expect(again.scaleId).toBe(first.scaleId)
      expect(again.status).toBe('DRAFT'); expect(again.visibility).toBe('HIDDEN')
      const row = await db.scale.findUniqueOrThrow({ where: { code: key } }), source = getScaleInstrumentSource(key, entry.instrumentVersion)!
      const snaps = await db.$queryRaw<Array<{ axes: any; source_snapshot: any }>>`SELECT axes,source_snapshot FROM scale_axis_snapshots WHERE scale_id=${row.id}`
      expect(snaps).toHaveLength(1)
      expect(snaps[0].axes).toMatchObject({ instrumentVersion: '1.0.0', scoringVersion: '1.0.0', reportVersion: '1.0.0', localizationVersion: '1.0.0', catalogManifestVersion: 1, referenceVersions: [] })
      expect(snaps[0].source_snapshot.catalog).toEqual(source.catalog)
      expect(snaps[0].source_snapshot.catalog.construct.constructOverlapTags.length).toBeGreaterThanOrEqual(35)
      expect(row.definition).toEqual(source.executable!.definition)
      expect(row.definitionHash).toBe(hashScaleDefinition(source.executable!.definition))
      // Existing materializer persists only the primary domain in row.tags; richer discovery remains a functional-line gap.
      expect(row.tags).toEqual([source.catalog.construct.primaryDomain])
    })
    it(key + ' generates exact real result samples from persisted definition without reference or invented bands', async () => {
      const row = await db.scale.findUniqueOrThrow({ where: { code: key } }), source = getScaleInstrumentSource(key, entry.instrumentVersion)!
      for (const fixture of source.executable!.goldenCases) {
        const result = parseScaleResultV2(buildScaleResult({ scaleId: row.id, instrumentKey: key, instrumentVersion: row.instrumentVersion, name: row.name, definition: row.definition as never, answers: fixture.answers }))
        expect(Object.fromEntries(result.scores.map(s => [s.key, s.value]))).toEqual(fixture.expected.scores)
        expect(result.quality.status).toBe(fixture.expected.quality)
        expect(result.method).toMatchObject({ instrumentVersion: '1.0.0', scoringVersion: '1.0.0', reportVersion: '1.0.0', localizationVersion: '1.0.0', referenceVersions: [] })
        expect(result.references).toEqual([])
        expect(result.interpretations).toHaveLength(fixture.expected.quality === 'invalid' ? 0 : source.executable!.definition.scoring.scores.length)
        expect(result.interpretations.every(i => i.label === null && i.referenceVersion === null && i.guidance.length > 0)).toBe(true)
        reports.push({ instrumentKey: key, fixture: fixture.name, result })
      }
    })
    it(key + ' freezes its complete source against mutation or deletion', async () => {
      const row = await db.scale.findUniqueOrThrow({ where: { code: key } })
      await expect(db.$executeRaw`UPDATE scale_axis_snapshots SET source_hash=${'f'.repeat(64)} WHERE scale_id=${row.id}`).rejects.toThrow()
      await expect(db.$executeRaw`DELETE FROM scale_axis_snapshots WHERE scale_id=${row.id}`).rejects.toThrow()
      expect((await db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM scale_axis_snapshots WHERE scale_id=${row.id}`)[0].n).toBe(1n)
    })
    it(key + ' refuses activation of its unpublished DRAFT despite open source rights', async () => {
      await expect(installScaleInstrument(db, { ...entry, actorUserId, deploymentPolicy: { schemaVersion: 1, revision: 1, locale: 'zh-CN', territory: 'CN', commercialNature: 'NON_COMMERCIAL', deploymentModes: ['STANDALONE'], requiredRightsActions: ['electronicAdministration', 'scoring', 'display'], authorizationRefs: ['synthetic-no-grant'], runtimePolicyHash: 'a'.repeat(64), localizationVersion: '1.0.0', inFlightCompletion: 'FROZEN_DEADLINE' } })).rejects.toThrow('EXECUTABLE_NOT_PUBLISHED')
    })
  }
  it('preserves all previous definitions and snapshots and adds only one DRAFT/HIDDEN row without references or deployment', async () => {
    expect(await oldRows()).toEqual(beforeRows); expect(await oldSnapshots()).toEqual(beforeSnapshots)
    expect(await db.scale.count()).toBe(15)
    expect((await db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM scale_axis_snapshots`)[0].n).toBe(17n)
    expect(await db.scale.count({ where: { status: 'DRAFT', visibility: 'HIDDEN' } })).toBe(15)
    expect(await db.assessmentReferenceSet.count()).toBe(0)
    expect(await db.scaleDeploymentPolicy.count()).toBe(0)
  })
})
