class ApiError extends Error {
  constructor(kind, message, details = {}) {
    super(message); this.name = 'ApiError'; this.kind = kind; Object.assign(this, details)
  }
}
const kinds = {400: 'invalidInput', 401: 'unauthorized', 403: 'forbidden', 404: 'notFound', 409: 'conflict', 410: 'retired', 429: 'rateLimited'}
function fromResponse(response) {
  const body = response.data || {}
  const status = response.statusCode
  const headers = response.header || {}
  const header = name => headers[Object.keys(headers).find(key => key.toLowerCase() === name)]
  const rawRetry = header('retry-after')
  const retryAfterMs = rawRetry == null ? 0 : /^\d+$/.test(String(rawRetry)) ? Number(rawRetry) * 1000 : Math.max(0, Date.parse(rawRetry) - Date.now()) || 0
  const kind = kinds[status] || (status >= 500 ? 'serverUnavailable' : 'invalidResponse')
  const safeMessage = {invalidInput: '输入信息不符合要求，请核对账号、邀请码或表单', unauthorized: '登录已过期，请重新登录', forbidden: '您无权执行此操作', notFound: '内容不存在或已移除', conflict: '状态已变化，请刷新后重试', retired: '此入口已停用', rateLimited: '请求较多，请稍后重试', serverUnavailable: '服务暂时不可用，请稍后重试', invalidResponse: '服务响应无效，请重试'}[kind]
  // Do not expose arbitrary server messages, payloads, cookies or URL query strings to UI/logs.
  return new ApiError(kind, safeMessage, { status, code: body.code, retryAfterMs, requestId: String(header('x-request-id') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0,100), retryable: status === 429 || status >= 500 })
}
module.exports = { ApiError, fromResponse }
