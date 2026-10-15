import { afterEach, describe, expect, it, vi } from 'vitest'
import * as definitions from '../../modules/assessment-reference/reference'
import { loadFrozenReferenceSets, preloadFrozenReferenceDb, referenceSetHash } from '../../modules/assessment-runtime/reference-binding'
const reference = (key: string, mean: number) => {
  const raw = { schemaVersion: 1, instrumentType: 'scale', instrumentKey: key, referenceVersion: 'v1', status: 'ACTIVE', entries: ['total', 'dimension'].map(scoreKey => ({ scoreKey, referenceKind: 'descriptive_sample', evidenceLevel: 'local_pilot', provenanceType: 'local_observed', instrumentVersion: '1.0.0', scoringVersion: '1.0.0', population: { description: 'Synthetic task-local reference fixture' }, source: { citation: 'Test only' }, statistics: { mean } })) }
  const parsed = definitions.validateReferenceSetDefinition(raw)
  if (!parsed.definition || parsed.issues.some(issue => issue.severity === 'error')) throw new Error(JSON.stringify(parsed.issues))
  return parsed.definition
}
const row = (definition: ReturnType<typeof reference>) => ({ instrumentType: 'SCALE' as const, instrumentKey: definition.instrumentKey, referenceVersion: definition.referenceVersion, status: 'ACTIVE' as const, definition })
const unit = (definition: ReturnType<typeof reference>) => ({ instrumentType: 'SCALE' as const, instrumentKey: definition.instrumentKey, bindings: ['total', 'dimension'].map(scoreKey => ({ referenceKey: definition.instrumentKey, referenceVersion: definition.referenceVersion, referenceHash: referenceSetHash(definition), scoreKey })) })
afterEach(() => vi.restoreAllMocks())
describe('task-local frozen report reference batch', () => {
  it('uses one database read for two instruments sharing a version name and validates each version once', async () => {
    const a = reference('instrument-a', 1), b = reference('instrument-b', 99), findMany = vi.fn().mockResolvedValue([row(a), row(b)])
    const units = [unit(a), unit(b)], batch = await preloadFrozenReferenceDb({ assessmentReferenceSet: { findMany } }, units)
    const validate = vi.spyOn(definitions, 'validateReferenceSetDefinition')
    const loadedA = await loadFrozenReferenceSets(batch, units[0]), loadedB = await loadFrozenReferenceSets(batch, units[1])
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(validate).toHaveBeenCalledTimes(2)
    expect(loadedA).toHaveLength(2); expect(loadedB).toHaveLength(2)
    expect(loadedA.every(value => value.instrumentKey === 'instrument-a' && value.entries[0].statistics?.mean === 1)).toBe(true)
    expect(loadedB.every(value => value.instrumentKey === 'instrument-b' && value.entries[0].statistics?.mean === 99)).toBe(true)
  })
  it('checks every frozen hash and never substitutes another instrument with the same version', async () => {
    const a = reference('instrument-a', 1), b = reference('instrument-b', 99), units = [unit(a), unit(b)]
    const batch = await preloadFrozenReferenceDb({ assessmentReferenceSet: { findMany: async () => [row(a)] } }, units)
    await expect(loadFrozenReferenceSets(batch, units[1])).rejects.toThrow('was not found')
    units[0].bindings[1].referenceHash = '0'.repeat(64)
    await expect(loadFrozenReferenceSets(batch, units[0])).rejects.toThrow('hash mismatch')
  })
  it('does not keep reference payloads between jobs and rejects a changed immutable payload', async () => {
    const a = reference('instrument-a', 1), input = unit(a), db = { assessmentReferenceSet: { findMany: vi.fn().mockResolvedValue([row(a)]) } }
    await loadFrozenReferenceSets(await preloadFrozenReferenceDb(db, [input]), input)
    db.assessmentReferenceSet.findMany.mockResolvedValue([row(reference('instrument-a', 2))])
    await expect(loadFrozenReferenceSets(await preloadFrozenReferenceDb(db, [input]), input)).rejects.toThrow('hash mismatch')
    expect(db.assessmentReferenceSet.findMany).toHaveBeenCalledTimes(2)
  })
})
