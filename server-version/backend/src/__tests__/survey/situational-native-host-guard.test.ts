import { describe, expect, it, vi } from 'vitest'
vi.mock('../../config/database', () => ({ prisma: {} }))
import { assertEmbeddedSituationalAttemptBinding, assertSituationalAttemptOwner,
  SITUATIONAL_ATTEMPT_SELECT, SITUATIONAL_ATTEMPT_COMMIT_SELECT } from '../../modules/situational/situational-runtime.service'

describe('native Survey SJT cannot enter historical host authority helpers', () => {
  it('loads the host identity for both ordinary reads and locked commit reads', () => {
    expect(SITUATIONAL_ATTEMPT_SELECT.surveyAttemptId).toBe(true)
    expect(SITUATIONAL_ATTEMPT_COMMIT_SELECT.surveyAttemptId).toBe(true)
  })
  it('rejects Survey ownership even if legacy user fields were accidentally supplied', () => {
    expect(() => assertSituationalAttemptOwner({surveyAttemptId: 'survey-parent', userId: 'user', participantKey: 'irrelevant'}, 'user'))
      .toThrow('无权限操作此情境化测评')
  })
  it('rejects Survey ownership before evaluating otherwise matching composite access', () => {
    const row = {surveyAttemptId: 'survey-parent', userId: null, participantKey: 'synthetic',
      compositeAttemptId: 'training-parent', compositeItemId: 'item', compositeSlotKey: 'situational:item',
      compositeAttempt: {id: 'training-parent', userId: null, recoveryTokenHash: 'proof', status: 'IN_PROGRESS'}}
    expect(() => assertEmbeddedSituationalAttemptBinding(row as Parameters<typeof assertEmbeddedSituationalAttemptBinding>[0],
      {compositeAttemptId: 'training-parent', compositeItemId: 'item', compositeSlotKey: 'situational:item', recoveryTokenHash: 'proof'}))
      .toThrow('情境化测评与综合测评槽位绑定不一致')
  })
})
