const { ApiError } = require('../../core/errors/index')
const names = ['canReadProfile','canReadOwnAssessments','canReadStudentTasks','canReadCourses','canManageCourse','canDiscoverOrganizations','canReadUsers','canManageParentLinks','canReadChildren','canReadChildReports','canReadAssignments','canReadCheckins','canReadStudents','canReadClassrooms','canReadCatalog','canReadTeacherCodes','canJoinClassroom','canUseClassroomRuntime','canManageParentToolDisclosure']
function resolveCapabilities(mobile) {
  if (!mobile || mobile.schemaVersion !== 1 || !mobile.capabilities) throw new ApiError('capabilityMismatch', '客户端与服务版本不匹配，请联系管理员')
  return Object.freeze(Object.fromEntries(names.map(name => [name, mobile.capabilities[name] === true])))
}
module.exports = { resolveCapabilities }
