import { afterEach, describe, expect, it, vi } from 'vitest'
import { campusStudentReference } from '../../modules/campus/studentReference'

describe('Huischool student reference isolation',()=>{
  afterEach(()=>vi.unstubAllEnvs())
  it('is stable across login changes but scoped by school and internal identity',()=>{
    vi.stubEnv('CAMPUS_ELIGIBILITY_HMAC_KEY','ab'.repeat(32))
    const original=campusStudentReference('school-a','student-1')
    expect(original).toMatch(/^林-[0-9A-F]{12}$/)
    expect(campusStudentReference('school-a','student-1')).toBe(original)
    expect(campusStudentReference('school-a','student-2')).not.toBe(original)
    expect(campusStudentReference('school-b','student-1')).not.toBe(original)
    expect(original).not.toContain('student-1')
  })
  it('does not silently fall back to predictable identifiers without a secret',()=>{
    vi.stubEnv('CAMPUS_ELIGIBILITY_HMAC_KEY','')
    expect(()=>campusStudentReference('school-a','student-1')).toThrow('CAMPUS_REFERENCE_KEY_UNAVAILABLE')
  })
})
