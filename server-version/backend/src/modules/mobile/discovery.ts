import { UserRole } from '../../types'

/** UI discovery only. Resource handlers still authorize current DB facts.
 * Organization governance and individual report disclosure are never role grants. */
export function mobileDiscovery(role: UserRole, mustChangePassword: boolean, parentPortalEnabled = false) {
  const staff = role === UserRole.TEACHER || role === UserRole.ADMIN
  return {
    schemaVersion: 1,
    availableRoles: [role],
    activeRole: role,
    capabilities: {
      canReadProfile: true,
      canReadOwnAssessments: !mustChangePassword,
      canReadStudentTasks: !mustChangePassword && role === UserRole.STUDENT,
      canReadCourses: !mustChangePassword && (staff || role === UserRole.STUDENT),
      canManageCourse: !mustChangePassword && staff,
      canDiscoverOrganizations: !mustChangePassword,
      canReadUsers: !mustChangePassword && role === UserRole.ADMIN,
      canManageParentLinks: !mustChangePassword && parentPortalEnabled && (role === UserRole.STUDENT || role === UserRole.PARENT),
      canReadChildren: !mustChangePassword && parentPortalEnabled && role === UserRole.PARENT,
      canReadChildReports: !mustChangePassword && parentPortalEnabled && role === UserRole.PARENT,
    },
  }
}
