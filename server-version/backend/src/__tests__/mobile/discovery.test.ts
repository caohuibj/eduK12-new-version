import { describe, expect, it } from 'vitest'
import { mobileDiscovery } from '../../modules/mobile/discovery'
import { UserRole } from '../../types'

describe('mobile navigation discovery preserves authorization boundaries', () => {
  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.TEACHER, UserRole.ADMIN])('resolves %s without disclosing child data or organization grants', role => {
    const mobile = mobileDiscovery(role, false)
    expect(mobile.schemaVersion).toBe(1)
    expect(mobile.availableRoles).toEqual([role])
    expect(mobile.activeRole).toBe(role)
    expect(mobile.capabilities.canReadChildren).toBe(false)
    expect(mobile.capabilities.canReadChildReports).toBe(false)
    expect(mobile.capabilities).not.toHaveProperty('canGovernOrganization')
  })
  it('student tasks and legacy user list capabilities match existing route role guards', () => {
    expect(mobileDiscovery(UserRole.STUDENT, false).capabilities.canReadStudentTasks).toBe(true)
    expect(mobileDiscovery(UserRole.PARENT, false).capabilities.canReadCourses).toBe(false)
    expect(mobileDiscovery(UserRole.TEACHER, false).capabilities.canReadUsers).toBe(false)
    expect(mobileDiscovery(UserRole.ADMIN, false).capabilities.canReadUsers).toBe(true)
  })
  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.TEACHER, UserRole.ADMIN])('password change blocks business discovery for %s', role => {
    const values = mobileDiscovery(role, true).capabilities
    expect(values.canReadProfile).toBe(true)
    expect(Object.entries(values).filter(([key]) => key !== 'canReadProfile').every(([, value]) => !value)).toBe(true)
  })
})
