import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptCognitivePayload, decryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { inspectPublishedReportPolicy, auditPublishedCognitiveReports } from '../../modules/cognitive/report-rollout-audit'
import { freezeAssignmentProfile } from '../../modules/cognitive/profile-freeze'
import { requireCognitiveRegistryEntry, listCognitiveRegistryEntries } from '../../modules/cognitive/cognitive.registry'
import { cognitiveSeeds } from '../../modules/cognitive/generated/seeds'

const identity = { testType: 'reaction', engineVersion: '1.0.0', scoringVersion: '1.1.0', configVersion: '1.1.0' }
const assignment = (encrypted: string | null) => ({ id: 'assignment-one', title: '本地合成发布任务', config: identity, profile: 'standard', publishedAt: new Date('2026-10-01T08:00:00Z'), listedStandalone: true, resolvedReportSnapshotEncrypted: encrypted })
const freeze = () => freezeAssignmentProfile({ entry: requireCognitiveRegistryEntry('reaction', '1.0.0', '1.1.0'), baseConfig: cognitiveSeeds.find(seed => seed.testType === 'reaction' && seed.scoringVersion === '1.1.0')!.config, profile: 'standard' })
beforeEach(() => { process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64) })

describe('read-only report rollout inventory', () => {
  it('distinguishes current, historical, missing, unsupported, composite and unreadable frozen paths', () => {
    const frozen = freeze()
    expect(inspectPublishedReportPolicy(assignment(frozen.resolvedReportSnapshotEncrypted)).state).toBe('current_two_audiences')
    const old = decryptCognitivePayload<any>(frozen.resolvedReportSnapshotEncrypted)
    delete old.participantPresentation.reportReading.popular
    delete old.participantPresentation.reportReading.professional
    expect(inspectPublishedReportPolicy(assignment(encryptCognitivePayload(old))).state).toBe('historical_reading')
    expect(inspectPublishedReportPolicy(assignment(null)).state).toBe('missing_snapshot')
    expect(inspectPublishedReportPolicy(assignment('broken-encrypted-snapshot')).state).toBe('unreadable_snapshot')
    expect(inspectPublishedReportPolicy({ ...assignment(null), config: { ...identity, scoringVersion: '99.0.0' } }).state).toBe('unsupported_identity')
    expect(inspectPublishedReportPolicy({ ...assignment('do-not-decrypt'), listedStandalone: false }).state).toBe('original_composite_flow')
    const mismatch = decryptCognitivePayload<any>(frozen.resolvedReportSnapshotEncrypted)
    mismatch.participantPresentation.testType = 'memory'
    expect(inspectPublishedReportPolicy(assignment(encryptCognitivePayload(mismatch))).state).toBe('unreadable_snapshot')
  })
  it('checks every real exact identity and declared profile can freeze a two-audience policy', () => {
    const entries = listCognitiveRegistryEntries().filter(entry => entry.testType !== 'fake')
    expect(entries).toHaveLength(28)
    for (const entry of entries) {
      const seed = cognitiveSeeds.find(seed => seed.testType === entry.testType && seed.engineVersion === entry.engineVersion && seed.scoringVersion === entry.scoringVersion)!
      expect(seed, entry.testType).toBeDefined()
      for (const profile of Object.keys(entry.profiles) as Array<'experience' | 'standard' | 'research'>) {
        const frozen = freezeAssignmentProfile({ entry, baseConfig: seed.config, profile })
        const row = { ...assignment(frozen.resolvedReportSnapshotEncrypted), profile, config: { ...seed, configVersion: seed.configVersion } }
        expect(inspectPublishedReportPolicy(row).state, `${entry.testType}/${entry.scoringVersion}/${profile}`).toBe('current_two_audiences')
      }
    }
  })
  it('reports actual stored versions without writes, participant queries, or encrypted payloads in output', async () => {
    const frozen = freeze()
    const records = [assignment(frozen.resolvedReportSnapshotEncrypted), { ...assignment(null), id: 'legacy-assignment' }]
    const before = JSON.stringify(records)
    const findAssignments = vi.fn().mockResolvedValue(records)
    const db = { cognitiveAssignment: { findMany: findAssignments }, cognitiveTestConfig: { findMany: vi.fn().mockResolvedValue([{ id: 'config-one', name: '本地配置', ...identity, accessPolicy: 'OPEN' }]) } }
    const result = await auditPublishedCognitiveReports(db as any, 'disposable-local-test-db')
    expect(result.status).toBe('NEEDS_REVIEW')
    expect(result.summary.pendingAssignments).toBe(1)
    expect(result.summary.counts.current_two_audiences).toBe(1)
    expect(result.acceptance.formalBrowserFlow).toBe('not_checked')
    expect(JSON.stringify(result)).not.toContain('resolvedReportSnapshotEncrypted')
    expect(JSON.stringify(records)).toBe(before)
    expect(findAssignments.mock.calls[0][0].where.status).toBe('PUBLISHED')
  })
  it('does not mark an empty published directory as fully upgraded', async () => {
    const db = { cognitiveAssignment: { findMany: vi.fn().mockResolvedValue([]) }, cognitiveTestConfig: { findMany: vi.fn().mockResolvedValue([]) } }
    expect((await auditPublishedCognitiveReports(db as any, 'empty-local-db')).status).toBe('NO_PUBLISHED_ASSIGNMENTS')
    await expect(auditPublishedCognitiveReports(db as any, '')).rejects.toThrow('scope label')
  })
})
