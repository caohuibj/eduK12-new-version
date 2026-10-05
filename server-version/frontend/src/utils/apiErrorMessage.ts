/** API client errors are plain objects; do not infer a permission failure from their shape. */
export function apiErrorMessage(error: unknown, fallback = '操作未完成，请稍后重试。'): string {
  const value = error as { status?: number; message?: unknown; code?: unknown } | null
  if (value?.status && value.status >= 500) return '服务暂时不可用，请稍后重试。'
  if (value?.status === 401) return '登录已过期，请重新登录。'
  if (value?.status === 403) return '当前没有此操作权限，请联系组织管理员核对授权。'
  if (value?.status === 404) return '资源不存在或当前不可访问，请刷新并核对所选对象与授权。'
  if (typeof value?.message === 'string' && value.message && !/^Request failed with status code/.test(value.message)) return value.message
  return fallback
}
