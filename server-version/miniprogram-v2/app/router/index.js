const { ApiError } = require('../../core/errors/index')
const ROLES = ['STUDENT','PARENT','TEACHER','ADMIN']
function resolveRole(user) {
  const mobile = user && user.mobile
  if (!user || !ROLES.includes(user.role) || !mobile || !Array.isArray(mobile.availableRoles) || !mobile.availableRoles.includes(mobile.activeRole) || mobile.activeRole !== user.role) throw new ApiError('capabilityMismatch', '身份信息无效，请重新登录')
  return {availableRoles: mobile.availableRoles.filter(role => ROLES.includes(role)), activeRole: mobile.activeRole}
}
function destination(session) {
  if (!session.user) return '/pages/auth/login/index'
  return session.user.mustChangePassword ? '/pages/auth/password/index' : '/pages/home/index'
}
module.exports = { ROLES, resolveRole, destination }
