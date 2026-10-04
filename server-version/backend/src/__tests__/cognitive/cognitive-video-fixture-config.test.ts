import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createCognitiveVideoFixtureConfig } from '../../../../e2e/cognitive-video-fixture-config'
import { requireCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { seeds } from '../../modules/cognitive/tasks/fake/seeds'

const entry = requireCognitiveRegistryEntry('fake', '1.0.0', '1.0.0')
const url = 'postgresql://fixture@127.0.0.1:54359/media7_test'
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('CI', 'false')
  vi.stubEnv('DATABASE_URL', url)
  vi.stubEnv('COGNITIVE_VIDEO_E2E_TEST_DATABASE_URL', url)
})
afterEach(() => vi.unstubAllEnvs())

it('creates its own published config with validated task content and does not read or publish the draft seed', async () => {
  const create = vi.fn(async ({ data }) => data)
  const db = { cognitiveTestConfig: { create } }
  const config = await createCognitiveVideoFixtureConfig(db as any, entry, 'unique-run')
  expect(create).toHaveBeenCalledTimes(1)
  expect(config).toMatchObject({ testType: 'fake', configVersion: 'media7-fixture-unique-run', status: 'PUBLISHED', config: seeds[0].config })
  expect(seeds[0]).toMatchObject({ configVersion: '1.0.0', status: 'DRAFT' })
})

it.each([
  ['NODE_ENV', 'production'],
  ['COGNITIVE_VIDEO_E2E_TEST_DATABASE_URL', ''],
  ['DATABASE_URL', 'postgresql://fixture@127.0.0.1:54359/another_test'],
  ['COGNITIVE_VIDEO_E2E_TEST_DATABASE_URL', 'postgresql://fixture@remote.example/media7_test'],
])('rejects unsafe %s before making a database call', async (name, value) => {
  vi.stubEnv(name, value)
  const create = vi.fn()
  await expect(createCognitiveVideoFixtureConfig({ cognitiveTestConfig: { create } } as any, entry, 'rejected')).rejects.toThrow()
  expect(create).not.toHaveBeenCalled()
})

it('rejects a loopback production database even when both URLs match', async () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://fixture@127.0.0.1:54359/eduk12')
  vi.stubEnv('COGNITIVE_VIDEO_E2E_TEST_DATABASE_URL', process.env.DATABASE_URL)
  const create = vi.fn()
  await expect(createCognitiveVideoFixtureConfig({ cognitiveTestConfig: { create } } as any, entry, 'rejected')).rejects.toThrow('isolated loopback test database')
  expect(create).not.toHaveBeenCalled()
})

it('accepts the existing explicitly selected isolated CI database', async () => {
  vi.stubEnv('CI', 'true')
  vi.stubEnv('DATABASE_URL', 'postgresql://fixture@localhost:5432/ptool?schema=public')
  vi.stubEnv('COGNITIVE_VIDEO_E2E_TEST_DATABASE_URL', process.env.DATABASE_URL)
  const create = vi.fn(async ({ data }) => data)
  await expect(createCognitiveVideoFixtureConfig({ cognitiveTestConfig: { create } } as any, entry, 'hosted')).resolves.toMatchObject({ configVersion: 'media7-fixture-hosted' })
})

it('rejects a different task version before making a database call', async () => {
  const create = vi.fn()
  await expect(createCognitiveVideoFixtureConfig({ cognitiveTestConfig: { create } } as any, { ...entry, engineVersion: '9.0.0' }, 'rejected')).rejects.toThrow('exact fake task contract')
  expect(create).not.toHaveBeenCalled()
})
