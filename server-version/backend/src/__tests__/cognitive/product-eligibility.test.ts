import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'
const mock = vi.hoisted(() => ({ config: vi.fn(), course: vi.fn(), list: vi.fn(), write: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: {
  course: { findUnique: mock.course }, cognitiveTestConfig: { findUnique: mock.config, findMany: mock.list, updateMany: mock.write },
  cognitiveAssignment: { create: mock.write },
} }))
import { assertCognitiveProductEligible, isCognitiveProductEligible } from '../../modules/cognitive/product-eligibility'
import { createAssignment, ensureTeacherPublishedAssignment, listPublishedConfigs } from '../../modules/cognitive/assignment.service'
import { publishCognitiveConfig } from '../../modules/cognitive/release.service'
import { listCognitiveTestsCatalog } from '../../modules/cognitive/catalog.service'
import { createCognitiveSessionConfigSnapshot, createUnifiedCognitiveSessionConfigSnapshot } from '../../modules/cognitive/session.service'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { COGNITIVE_SEEDS } from '../../../prisma/seeds/cognitive'
const fake = { id: 'fake-published', testType: 'fake', status: 'PUBLISHED', engineVersion: '1.0.0', scoringVersion: '1.0.0', configVersion: '1.0.0', config: {} }
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('NODE_ENV', 'production'); mock.config.mockResolvedValue(fake); mock.course.mockResolvedValue({ id: 'course', creatorId: 'teacher' }) })
afterEach(() => vi.unstubAllEnvs())
describe('framework fixture production exclusion', () => {
  it('cannot be opened by the fixture flag outside NODE_ENV=test', () => {
    vi.stubEnv('COGNITIVE_TEST_FIXTURES_ENABLED', 'true')
    expect(isCognitiveProductEligible('fake')).toBe(false)
    expect(() => assertCognitiveProductEligible('fake')).toThrow(/框架测试任务/)
    expect(isCognitiveProductEligible('reaction')).toBe(true)
  })
  it('requires an explicit fixture admission inside tests', () => {
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('COGNITIVE_TEST_FIXTURES_ENABLED', 'false')
    expect(isCognitiveProductEligible('fake')).toBe(false)
    vi.stubEnv('COGNITIVE_TEST_FIXTURES_ENABLED', 'true')
    expect(isCognitiveProductEligible('fake')).toBe(true)
  })
  it('does not list fake even when an existing database row is PUBLISHED', async () => {
    mock.list.mockResolvedValue([fake])
    expect(await listPublishedConfigs('admin', UserRole.ADMIN)).toEqual([])
    expect(listCognitiveTestsCatalog().list.some(entry => entry.testType === 'fake')).toBe(false)
    expect(getCognitiveRegistryEntry('fake', '1.0.0', '1.0.0')).toBeDefined()
  })
  it('rejects direct assignment creation using an already published fake config', async () => {
    await expect(createAssignment('teacher', UserRole.TEACHER, { courseId: 'course', configId: fake.id, profile: 'experience' } as any)).rejects.toThrow(/框架测试任务/)
    expect(mock.write).not.toHaveBeenCalled()
  })
  it('rejects new wrapper materialization even when the source has a historical frozen identity', async () => {
    const tx = { cognitiveTestConfig: { findUnique: mock.config } }
    await expect(ensureTeacherPublishedAssignment(tx as any, { userId: 'teacher', courseId: 'course', configId: fake.id, title: 'new', instruction: null, sourceFreeze: { profile: 'standard' } as any })).rejects.toThrow(/框架测试任务/)
  })
  it('rejects config publication independently of old DB lifecycle', async () => {
    await expect(publishCognitiveConfig(fake.id)).rejects.toThrow(/框架测试任务/)
    expect(mock.write).not.toHaveBeenCalled()
  })
  it('blocks new standalone/public/embedded session snapshot construction before any DB work', async () => {
    expect(() => createCognitiveSessionConfigSnapshot(fake)).toThrow(/框架测试任务/)
    await expect(createUnifiedCognitiveSessionConfigSnapshot(fake)).rejects.toThrow(/框架测试任务/)
  })
  it('defaults the fixture seed to DRAFT without deleting or rewriting existing rows', () => {
    expect(COGNITIVE_SEEDS.find(seed => seed.testType === 'fake')?.status).toBe('DRAFT')
  })
})
