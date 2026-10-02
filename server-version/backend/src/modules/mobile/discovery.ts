import { UserRole } from '../../types'

/** UI discovery only. Resource handlers still authorize current DB facts.
 * Organization governance and individual report disclosure are never role grants. */
export function mobileDiscovery(role: UserRole, mustChangePassword: boolean, parentPortalEnabled = false, miniClassroomEnabled = false, platformRole = 'STANDARD') {
  const staff = role === UserRole.TEACHER || role === UserRole.ADMIN
  return {
    schemaVersion: 1,
    availableRoles: [role],
    activeRole: role,
    capabilities: {
      canManageParentToolDisclosure: !mustChangePassword && platformRole === 'SYSTEM_ADMIN',
      canReadProfile: true,
      canReadOwnAssessments: !mustChangePassword,
      canReadStudentTasks: !mustChangePassword && role === UserRole.STUDENT,
      canReadCourses: !mustChangePassword && (staff || role === UserRole.STUDENT),
      canReadAssignments: !mustChangePassword && (staff || role === UserRole.STUDENT),
      canReadCheckins: !mustChangePassword && (staff || role === UserRole.STUDENT),
      canReadStudents: !mustChangePassword && staff,
      canJoinClassroom: !mustChangePassword && miniClassroomEnabled && role === UserRole.STUDENT,
      canUseClassroomRuntime: !mustChangePassword && miniClassroomEnabled && (staff || role === UserRole.STUDENT),
      canReadClassrooms: !mustChangePassword && staff,
      canReadCatalog: !mustChangePassword && (staff || role === UserRole.STUDENT),
      canReadTeacherCodes: !mustChangePassword && role === UserRole.ADMIN,
      canManageCourse: !mustChangePassword && staff,
      canDiscoverOrganizations: !mustChangePassword,
      canReadUsers: !mustChangePassword && role === UserRole.ADMIN,
      canManageParentLinks: !mustChangePassword && parentPortalEnabled && (role === UserRole.STUDENT || role === UserRole.PARENT),
      canReadChildren: !mustChangePassword && parentPortalEnabled && role === UserRole.PARENT,
      canReadChildReports: !mustChangePassword && parentPortalEnabled && role === UserRole.PARENT,
    },
  }
}
