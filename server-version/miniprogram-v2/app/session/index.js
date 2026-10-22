const { resolveRole } = require('../router/index')
const { resolveCapabilities } = require('../capabilities/index')
function createSession({account, jar, telemetry, clearPrivateData = async () => {}, studentOnly = false}) {
  const product = studentOnly ? 'training-student' : undefined
  let state = {product, status: 'idle', user: null, capabilities: {}, runtime: {}}
  let flight = null; const listeners = new Set()
  const publish = value => { state = value; listeners.forEach(listener => listener(state)) }
  async function expire(expectedEpoch) {
    if (expectedEpoch !== undefined && expectedEpoch !== jar.epoch()) return
    flight = null
    publish({product, status: 'ready', user: null, capabilities: {}, runtime: {}})
    telemetry.clear(); await jar.clear()
  }
  async function refresh() {
    if (flight) return flight
    const epoch = jar.epoch()
    publish(Object.assign({}, state, {status: 'loading'}))
    const operation = (async () => {
      try {
        const [user, runtime] = await Promise.all([account.me(), account.capabilities()])
        if (epoch !== jar.epoch()) return state
        if (studentOnly && (!user || user.role !== 'STUDENT' || !['LEGACY','TRAINING'].includes(user.accountDomain))) {
          const error = new Error('此小程序仅供 Training 学员使用，请使用学员账号登录'); error.trainingIdentity = true; throw error
        }
        const role = resolveRole(user)
        let capabilities = resolveCapabilities(user.mobile)
        if (studentOnly) {
          const allowed = ['canReadProfile','canReadOwnAssessments','canUseAssessmentRuntime','canReadStudentTasks','canReadCourses','canReadAssignments','canReadCheckins']
          capabilities = Object.freeze(Object.fromEntries(Object.entries(capabilities).map(([key,value]) => [key,allowed.includes(key) && value])))
        }
        publish({product, status: 'ready', user, capabilities, runtime, availableRoles: role.availableRoles, activeRole: role.activeRole})
        return state
      } catch (error) {
        if (epoch !== jar.epoch()) return state
        if (studentOnly && (error.trainingIdentity || error.kind === 'capabilityMismatch')) {await expire(epoch); await clearPrivateData(); throw error}
        if (error.status === 401) { await expire(epoch); return state }
        publish(Object.assign({}, state, {status: 'error', error})); throw error
      }
    })()
    flight = operation
    try { return await operation } finally { if (flight === operation) flight = null }
  }
  return {
    get: () => state, subscribe(listener) {listeners.add(listener); return () => listeners.delete(listener)}, expire, refresh,
    async restore() {await jar.restore(); return refresh()},
    async login(values) {await expire(); await account.login(values); return refresh()},
    async logout() {
      try { await account.logout() } finally { try { await expire() } finally { await clearPrivateData() } }
    },
    async changePassword(values) {await account.changePassword(values); return refresh()},
  }
}
module.exports = { createSession }
