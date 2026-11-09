import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ getAttemptState: vi.fn(), campusAccess: vi.fn() }))
vi.mock('../../modules/composite/composite.service', () => ({ getAttemptState: m.getAttemptState }))
vi.mock('../../modules/campus/campus-composite-authority', () => ({ checkCampusCompositeAccessAuthority: m.campusAccess }))

import { attachInlineCurrentUnit, requestedInlineCurrentUnit } from '../../modules/composite/current-unit-start-inline'
import { logger } from '../../utils/logger'

const started = { state: 'STARTED' as const, runtimeBindingKind: 'COMPOSITE' as const, runtimeBindingRef: 'attempt-1' }
const currentUnit = { id: 'attempt-1', deliveryMode: 'FINAL_ONLY', status: 'IN_PROGRESS' }

describe('shared inline current-unit helper', () => {
  beforeEach(() => {
    m.getAttemptState.mockReset()
    m.campusAccess.mockReset()
    m.campusAccess.mockResolvedValue(true)
    vi.spyOn(logger, 'info').mockImplementation(() => {})
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
  })

  it('detects the School #667 opt-in flags', () => {
    expect(requestedInlineCurrentUnit({ body: { delivery: 'inline' } })).toBe(true)
    expect(requestedInlineCurrentUnit({ query: { view: 'current-unit' } })).toBe(true)
    expect(requestedInlineCurrentUnit({ query: { delivery: 'inline' } })).toBe(true)
    expect(requestedInlineCurrentUnit({ body: { view: 'current-unit' } })).toBe(true)
    expect(requestedInlineCurrentUnit({ query: { delivery: 'whole' }, body: {} })).toBe(false)
    expect(requestedInlineCurrentUnit({ query: {}, body: {} })).toBe(false)
  })

  it('returns the committed START payload when inline is not requested', async () => {
    await expect(attachInlineCurrentUnit({
      requested: false, started, attemptId: 'attempt-1', actorUserId: 'u1',
    })).resolves.toBe(started)
    expect(m.getAttemptState).not.toHaveBeenCalled()
  })

  it('attaches currentUnit from getAttemptState(current-unit)', async () => {
    m.getAttemptState.mockResolvedValue(currentUnit)
    await expect(attachInlineCurrentUnit({
      requested: true, started, attemptId: 'attempt-1', actorUserId: 'u1',
    })).resolves.toEqual({ ...started, currentUnit })
    expect(m.getAttemptState).toHaveBeenCalledWith('attempt-1', { userId: 'u1' }, undefined, 'current-unit')
    expect(m.campusAccess).not.toHaveBeenCalled()
  })

  it('falls back to the plain START payload when projection fails', async () => {
    m.getAttemptState.mockRejectedValue(Object.assign(new Error('gone'), { status: 404 }))
    await expect(attachInlineCurrentUnit({
      requested: true, started, attemptId: 'attempt-1', actorUserId: 'u1',
    })).resolves.toBe(started)
  })

  it('keeps the School campus authority check only when campusAuthority is set for a SCHOOL actor', async () => {
    m.campusAccess.mockResolvedValue(false)
    await expect(attachInlineCurrentUnit({
      requested: true, started, attemptId: 'attempt-1', actorUserId: 'student-1',
      accountDomain: 'SCHOOL', campusAuthority: true,
    })).resolves.toBe(started)
    expect(m.campusAccess).toHaveBeenCalledWith({ attemptId: 'attempt-1', userId: 'student-1' })
    expect(m.getAttemptState).not.toHaveBeenCalled()

    m.campusAccess.mockClear()
    m.getAttemptState.mockResolvedValue(currentUnit)
    await expect(attachInlineCurrentUnit({
      requested: true, started, attemptId: 'attempt-1', actorUserId: 'teacher-1',
      accountDomain: 'SCHOOL', campusAuthority: false,
    })).resolves.toEqual({ ...started, currentUnit })
    expect(m.campusAccess).not.toHaveBeenCalled()
  })
})
