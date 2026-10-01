import { describe, expect, it, vi } from 'vitest'
import { createRunPendingConsent } from '../../modules/assessment-run/consent'
const base = { subjectUserId: 'parent', respondentUserId: 'parent', respondentRole: 'PARENT', createdByUserId: 'owner', visibilityPolicyKey: 'SELF_V1', resourceKind: 'BUNDLE', resourceKey: 'self', resourceVersion: '1.0.0' }
describe('parent self and observer consent separation', () => {
  it('does not create observer consent for an exact SELF_REPORT identity', async () => {
    const create = vi.fn()
    expect(await createRunPendingConsent({ assessmentAttemptConsent: { create } } as never, { ...base, perspective: 'SELF_REPORT' })).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })
  it('keeps unrecognized parent observer visibility fail-closed', async () => {
    await expect(createRunPendingConsent({} as never, { ...base, subjectUserId: 'child', perspective: 'OBSERVER_REPORT' })).rejects.toMatchObject({ code: 'RUN_CONSENT_POLICY_UNSUPPORTED' })
    await expect(createRunPendingConsent({} as never, base)).rejects.toMatchObject({ code: 'RUN_CONSENT_POLICY_UNSUPPORTED' })
  })
})
