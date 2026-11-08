import { describe, expect, it, vi, beforeEach } from 'vitest'

const getDefinition = vi.hoisted(() => vi.fn())
vi.mock('../../modules/composite/whole-questionnaire.service', () => ({
  getWholeQuestionnaireDefinition: getDefinition,
}))

import { startResponseWithInlineWholeDefinition } from '../../modules/composite/whole-start-inline'

const definition = { attemptId: 'attempt-1', attemptEpoch: 1, slotSetHash: 'a'.repeat(64), contextSnapshotHash: null, units: [], formSections: [] }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('whole definition inline delivery with START (X-05A)', () => {
  it('attaches the whole definition only for WHOLE_LOCAL attempts when delivery=whole is requested', async () => {
    getDefinition.mockResolvedValue(definition)
    const data = { attempt: { id: 'attempt-1', executionMode: 'WHOLE_LOCAL' }, recoveryToken: null }
    const result = await startResponseWithInlineWholeDefinition(true, data, { userId: 'user-1' })
    expect(getDefinition).toHaveBeenCalledWith('attempt-1', { userId: 'user-1' })
    expect(result).toEqual({ ...data, wholeDefinition: definition })
  })

  it('returns the plain START payload without touching the definition endpoint', async () => {
    getDefinition.mockResolvedValue(definition)
    const base = { attempt: { id: 'attempt-1', executionMode: 'WHOLE_LOCAL' }, recoveryToken: null }
    await expect(startResponseWithInlineWholeDefinition(false, base, { userId: 'user-1' })).resolves.toBe(base)
    await expect(startResponseWithInlineWholeDefinition(true, { attempt: { id: 'attempt-1', executionMode: 'STEPPED' } }, { userId: 'user-1' })).resolves.toMatchObject({ attempt: { executionMode: 'STEPPED' } })
    await expect(startResponseWithInlineWholeDefinition(true, { attempt: { executionMode: 'WHOLE_LOCAL' } }, { userId: 'user-1' })).resolves.toMatchObject({ attempt: { executionMode: 'WHOLE_LOCAL' } })
    expect(getDefinition).not.toHaveBeenCalled()
  })

  it('falls back to the plain START payload when the inline definition projection fails', async () => {
    getDefinition.mockRejectedValue(new Error('整份交卷入口暂未开启'))
    const base = { attempt: { id: 'attempt-1', executionMode: 'WHOLE_LOCAL' }, recoveryToken: null }
    await expect(startResponseWithInlineWholeDefinition(true, base, { userId: 'user-1' })).resolves.toBe(base)
  })
})
