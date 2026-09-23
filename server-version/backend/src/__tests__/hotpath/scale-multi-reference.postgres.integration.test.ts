import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { freezeExactReferenceBindings, loadFrozenReferenceSets } from '../../modules/assessment-runtime/reference-binding'
import { validateReferenceSetDefinition } from '../../modules/assessment-reference/reference'

const databaseUrl = integrationDatabaseUrl('PERF_INTEGRATION_DATABASE_URL')
const suite = databaseUrl ? describe : describe.skip

suite('PERF-01 shared Scale reference version with multiple score selections', () => {
  const instrumentKey = `perf01-ref-${randomUUID()}`
  const referenceVersion = 'perf01-v1'
  let db: PrismaClient
  let referenceId: string | null = null

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } })
    await db.$connect()
  })

  afterAll(async () => {
    if (referenceId) await db.assessmentReferenceSet.delete({ where: { id: referenceId } })
    await db?.$disconnect()
  })

  it('freezes two score selections against one authoritative active reference row', async () => {
    const definition = {
      schemaVersion: 1,
      instrumentType: 'scale',
      instrumentKey,
      referenceVersion,
      status: 'ACTIVE',
      entries: ['total', 'half'].map((scoreKey) => ({
        scoreKey, referenceKind: 'descriptive_sample', evidenceLevel: 'local_pilot',
        provenanceType: 'local_observed', instrumentVersion: '2.0.0', scoringVersion: '2.0.0',
        population: { description: 'Disposable isolated fixture' },
        source: { citation: 'PERF-01 isolated test fixture' },
        statistics: { mean: scoreKey === 'total' ? 20 : 10 },
      })),
    }
    expect(validateReferenceSetDefinition(definition).issues.filter((issue) => issue.severity === 'error')).toEqual([])
    const row = await db.assessmentReferenceSet.create({ data: {
      instrumentType: 'SCALE', instrumentKey, referenceVersion, status: 'ACTIVE',
      definition: definition as Prisma.InputJsonValue,
    } })
    referenceId = row.id
    const bindings = await freezeExactReferenceBindings(db, {
      instrumentType: 'SCALE', instrumentKey,
      selections: ['total', 'half'].map((scoreKey) => ({ scoreKey, referenceVersion, referenceKind: 'descriptive_sample' })),
    })
    expect(bindings).toHaveLength(2)
    expect(bindings[0]?.referenceHash).toBe(bindings[1]?.referenceHash)
    expect(bindings.map((binding) => binding.scoreKey)).toEqual(['total', 'half'])
    const resolved = await loadFrozenReferenceSets(db, { instrumentType: 'SCALE', instrumentKey, bindings })
    expect(resolved).toHaveLength(2)
    expect(resolved[0]?.entries.map((entry) => entry.scoreKey)).toEqual(['total', 'half'])
    expect(resolved[1]).toEqual(resolved[0])
  })
})
