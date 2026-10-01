import { describe, expect, it } from 'vitest'
import { assertEvaluationTarget, matchesClassTarget } from '../../modules/assessment-policy/target'
import { validDeliveryWindow } from '../../modules/organization/deliveryPolicy'

describe('content-owned evaluation targets', () => {
  it('fails closed without an owning target declaration', () => {
    expect(() => assertEvaluationTarget(undefined, { mode: 'ALL_CLASS_TEACHERS' })).toThrow()
    expect(() => assertEvaluationTarget(['HOMEROOM_TEACHER'], { mode: 'ALL_CLASS_TEACHERS' })).toThrow()
  })
  it('requires a bounded selection and rejects irrelevant user-provided identifiers', () => {
    expect(() => assertEvaluationTarget(['SELECTED_CLASS_TEACHERS'], { mode: 'SELECTED_CLASS_TEACHERS' })).toThrow()
    expect(() => assertEvaluationTarget(['HOMEROOM_TEACHER'], { mode: 'HOMEROOM_TEACHER', teacherMembershipIds: ['unrelated'] })).toThrow()
    expect(matchesClassTarget({ mode: 'SELECTED_CLASS_TEACHERS', teacherMembershipIds: ['a'] }, 'b', 'TEACHING')).toBe(false)
  })
  it('distinguishes homeroom from teaching relationships', () => {
    expect(matchesClassTarget({ mode: 'HOMEROOM_TEACHER' }, 'a', 'TEACHING')).toBe(false)
    expect(matchesClassTarget({ mode: 'ALL_CLASS_TEACHERS' }, 'a', 'TEACHING')).toBe(true)
  })
  it('validates finite and increasing grant windows', () => {
    expect(validDeliveryWindow(new Date('invalid'), null)).toBe(false)
    expect(validDeliveryWindow(new Date(20), new Date(10))).toBe(false)
    expect(validDeliveryWindow(new Date(10), new Date(10))).toBe(false)
    expect(validDeliveryWindow(new Date(10), new Date(20))).toBe(true)
  })
})
