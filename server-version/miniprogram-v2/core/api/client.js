const { ApiError, fromResponse } = require('../errors/index')
const PUBLIC_AUTH = /^\/auth\/(login|csrf|student-register|teacher-register|verify-teacher-code)$/
function createApiClient({platform, config, jar, network, telemetry, onExpired = () => {}}) {
  let csrfFlight = null
  function validate(path) {
    if (typeof path !== 'string' || !/^\/[a-zA-Z0-9]/.test(path) || /[\\#\r\n]/.test(path) || path.includes('://') || path.includes('..')) throw new ApiError('invalidRequest', '请求地址无效')
  }
  async function transport(method, path, data, scope, expectedEpoch) {
    if (!network.isOnline()) throw new ApiError('offline', '网络不可用，请检查连接', {retryable: true})
    if (expectedEpoch !== jar.epoch()) throw new ApiError('sessionChanged', '登录状态已变化，请重试')
    const header = {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}
    if (scope === 'session') {
      if (jar.header()) header.Cookie = jar.header()
      if (method !== 'GET' && jar.csrf()) header['X-CSRF-Token'] = jar.csrf()
    }
    const started = Date.now()
    const response = await new Promise((resolve, reject) => {
      platform.request({url: config.apiBase + path, method, data, header, timeout: config.timeout,
        success: resolve, fail: () => reject(new ApiError('network', '连接失败，请重试', {retryable: true}))})
    })
    if (scope === 'session' && expectedEpoch !== jar.epoch()) throw new ApiError('sessionChanged', '登录状态已变化，请重试')
    if (scope === 'session') await jar.absorb(response, expectedEpoch)
    telemetry.record({kind: 'request', status: response.statusCode, durationMs: Date.now() - started})
    if (response.statusCode < 200 || response.statusCode >= 300 || !response.data || response.data.code !== 0) {
      const error = fromResponse(response)
      if (error.status === 401 && scope === 'session' && !PUBLIC_AUTH.test(path.split('?')[0])) await onExpired(expectedEpoch)
      throw error
    }
    if (typeof response.data.message !== 'string' || !Object.prototype.hasOwnProperty.call(response.data, 'data')) throw new ApiError('invalidResponse', '服务响应无效，请重试')
    return response.data.data
  }
  async function ensureCsrf(expectedEpoch) {
    if (jar.csrf()) return
    if (!csrfFlight || csrfFlight.epoch !== expectedEpoch) {
      const promise = transport('GET', '/auth/csrf', undefined, 'session', expectedEpoch).then(data => {
        if (!data || typeof data.csrfToken !== 'string' || jar.csrf() !== data.csrfToken) throw new ApiError('invalidResponse', '无法验证登录安全状态，请重试')
      })
      csrfFlight = {epoch: expectedEpoch, promise}
      promise.finally(() => { if (csrfFlight && csrfFlight.promise === promise) csrfFlight = null }).catch(() => {})
    }
    return csrfFlight.promise
  }
  async function request(method, path, data, options = {}) {
    validate(path)
    method = method.toUpperCase()
    if (!['GET','POST','PUT','PATCH','DELETE'].includes(method)) throw new ApiError('invalidRequest', '请求方法无效')
    const scope = options.scope || (path.startsWith('/public/') || path.startsWith('/checkins/public/') ? 'public' : 'session')
    if (!['session','public'].includes(scope)) throw new ApiError('invalidRequest', '请求认证类型无效')
    const expectedEpoch = jar.epoch()
    if (scope === 'session' && method !== 'GET') await ensureCsrf(expectedEpoch)
    try { return await transport(method, path, data, scope, expectedEpoch) }
    catch (error) {
      // Never replay a mutation. One bounded retry for safe reads; Retry-After is surfaced to the UI.
      if (method === 'GET' && error.retryable && !error.retryAfterMs && options.retry !== false && error.status !== 429) return transport(method, path, data, scope, expectedEpoch)
      throw error
    }
  }
  return {request, get: (path, options) => request('GET', path, undefined, options), post: (path,data,options) => request('POST',path,data,options), put: (path,data,options) => request('PUT',path,data,options), patch: (path,data,options) => request('PATCH',path,data,options), delete: (path,options) => request('DELETE',path,undefined,options)}
}
module.exports = { createApiClient }
