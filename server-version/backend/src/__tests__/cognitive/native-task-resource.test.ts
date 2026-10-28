import { describe, expect, it, vi } from 'vitest'
vi.mock('dotenv', () => ({ default: { config: () => ({ parsed: {} }) } }))
import { seedNativeMotConfig, nativeMotConfigSeed } from '../../../prisma/seeds/native-cognitive'
import { getCognitiveTaskResource, assertResourceConfigVersion } from '../../modules/cognitive/task-resource'
import { getCognitiveRegistryEntry, listCognitiveRegistryEntries } from '../../modules/cognitive/cognitive.registry'
import { freezeNativeAssignmentProfile, readFrozenReport } from '../../modules/cognitive/profile-freeze'
import { decryptCognitivePayload, encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { buildCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { evaluateCognitiveProductReadiness } from '../../modules/cognitive/library/product-readiness'
describe('native score-free task resources and real seed boundary', () => {
  it('retains lifecycle on repeat seed and refuses same-version divergent core without any write', async () => {
    const expected = nativeMotConfigSeed(), row = { ...expected, id: 'synthetic-existing-config', status: 'RETIRED', engineVersion: String(expected.engineVersion), publishedAt: new Date('2026-10-26T00:00:00Z') }
    const findUnique = vi.fn(async () => row), create = vi.fn()
    const db = { cognitiveTestConfig: { findUnique, create } } as unknown as Parameters<typeof seedNativeMotConfig>[0]
    const existing = await seedNativeMotConfig(db)
    expect(existing.created).toBe(false); expect(existing.config.status).toBe('RETIRED')
    expect(existing.config.publishedAt).toEqual(row.publishedAt)
    const divergent = { ...row, engineVersion: 'old-or-unknown-version' }
    findUnique.mockResolvedValueOnce(divergent)
    await expect(seedNativeMotConfig(db)).rejects.toThrow('divergent content')
    expect(create).not.toHaveBeenCalled()
  })
  it('resolves native metadata without a score method and preserves the exact real legacy entry', () => {
    const native = getCognitiveTaskResource('mot', '1.1.1', '1.1.0')!
    expect(native.kind).toBe('native'); expect(native).not.toHaveProperty('score')
    expect(Object.keys(native.profiles).sort()).toEqual(['experience', 'research'])
    expect(getCognitiveTaskResource('mot', '1.1.0', '1.1.0')).toBeUndefined()
    expect(() => assertResourceConfigVersion(native, 'wrong')).toThrow('configVersion')
    const entry = listCognitiveRegistryEntries()[0], legacy = getCognitiveTaskResource(entry.testType, entry.engineVersion, entry.scoringVersion)!
    expect(legacy.kind).toBe('legacy'); if (legacy.kind === 'legacy') expect(legacy.entry).toBe(getCognitiveRegistryEntry(entry.testType, entry.engineVersion, entry.scoringVersion))
  })
  it('rejects mixed native frozen report tuples and definition bytes rather than loading current defaults', () => {
    const resource = getCognitiveTaskResource('mot', '1.1.1', '1.1.0')!
    if (resource.kind !== 'native') throw Error('native expected')
    const snapshot = freezeNativeAssignmentProfile({ resource, baseConfig: nativeMotConfigSeed().config, profile: 'experience' })
    expect(readFrozenReport(snapshot.resolvedReportSnapshotEncrypted)?.nativeIdentity?.engineVersion).toBe('1.1.1')
    const frozen = decryptCognitivePayload<Record<string, unknown>>(snapshot.resolvedReportSnapshotEncrypted)
    const mixed = structuredClone(frozen); mixed.qualityDefinitionVersion = 'incompatible'
    expect(() => readFrozenReport(encryptCognitivePayload(mixed))).toThrow('IDENTITY')
    const changed = structuredClone(frozen); (changed.v2ReportDefinition as { title: string }).title = 'Unfrozen current report'
    expect(() => readFrozenReport(encryptCognitivePayload(changed))).toThrow('IDENTITY')
  })
  it('keeps the original standard-profile requirement for legacy product release', () => {
    const legacy = listCognitiveRegistryEntries().find(entry => entry.testType !== 'fake')!
    const definition = buildCognitiveV2TaskDefinition(legacy)
    const profiles = Object.fromEntries(Object.entries(definition.profiles).filter(([key]) => key !== 'standard'))
    const readiness = evaluateCognitiveProductReadiness({ ...definition, profiles })
    expect(readiness.ready).toBe(false)
    expect(readiness.blockers.some(blocker => blocker.message.includes('standard profile is required'))).toBe(true)
  })
})
