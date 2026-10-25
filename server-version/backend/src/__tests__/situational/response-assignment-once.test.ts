import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../config/database', () => ({ prisma: {} }))
vi.mock('../../modules/situational/situation-assignment', async importOriginal => {
  const actual = await importOriginal<typeof import('../../modules/situational/situation-assignment')>()
  return { ...actual, deriveSituationalAssignment: vi.fn(actual.deriveSituationalAssignment) }
})
import { scientificFixture } from './vnext-fixture'
import { createSjtNativeV1Package } from '../fixtures/sjt-native-v1.fixture'
import { freezeSituationalRuntimeAtAttemptStart } from '../../modules/assessment-runtime/situational-runtime-snapshot'
import { deriveSituationalAssignment, assignedSituationalRunnerDefinition } from '../../modules/situational/situation-assignment'
import { situationalAttemptForResponse } from '../../modules/situational/situational-runtime.service'

describe('shared Training and Survey response assignment work', () => {
  beforeEach(() => vi.clearAllMocks())
  it('derives one assignment for both public metadata and runner definition without changing bytes', () => {
    const snapshot = freezeSituationalRuntimeAtAttemptStart({ instrumentKey: 'synthetic-vnext', instrumentVersion: '1.0.0', definition: scientificFixture() })
    const row = { id: 'synthetic-attempt', status: 'IN_PROGRESS' } as Parameters<typeof situationalAttemptForResponse>[0]
    if (snapshot.definition.schemaVersion !== 2) throw new Error('V2 fixture required')
    const expected = deriveSituationalAssignment(snapshot.definition, row.id, snapshot.definitionHash)
    const definition = assignedSituationalRunnerDefinition(snapshot.definition, expected)
    vi.mocked(deriveSituationalAssignment).mockClear()
    const response = situationalAttemptForResponse(row, snapshot, { suppressResult: true })
    expect(deriveSituationalAssignment).toHaveBeenCalledTimes(1)
    expect(response.instrument.assignment).toEqual(expected)
    expect(JSON.stringify(response.instrument.definition)).toBe(JSON.stringify(definition))
  })
  it('keeps ordinary V1 public definition unchanged without creating an assignment', () => {
    const pkg = createSjtNativeV1Package()
    const snapshot = freezeSituationalRuntimeAtAttemptStart({ instrumentKey: pkg.key, instrumentVersion: pkg.instrumentVersion, definition: pkg.definition })
    const response = situationalAttemptForResponse({ id: 'v1', status: 'IN_PROGRESS' } as Parameters<typeof situationalAttemptForResponse>[0], snapshot, { suppressResult: true })
    expect(deriveSituationalAssignment).not.toHaveBeenCalled()
    expect(response.instrument).not.toHaveProperty('assignment')
    expect(response.instrument.definition).toEqual(snapshot.runnerDefinition)
  })
  it('keeps each attempt response independent instead of sharing assignment or authority', () => {
    const snapshot = freezeSituationalRuntimeAtAttemptStart({ instrumentKey: 'synthetic-vnext', instrumentVersion: '1.0.0', definition: scientificFixture() })
    const response = (id: string) => situationalAttemptForResponse({ id, status: 'IN_PROGRESS' } as Parameters<typeof situationalAttemptForResponse>[0], snapshot, { suppressResult: true })
    const first = response('one'), second = response('two')
    expect(deriveSituationalAssignment).toHaveBeenCalledTimes(2)
    expect(first.instrument.assignment?.assignmentIdentity).not.toBe(second.instrument.assignment?.assignmentIdentity)
  })
})
