import type { ApiResponse } from '../../types'
import { sessionFetch } from '../../api/client'
import type { AssessmentVideoCapabilitySources } from './types'

const isCapabilitySources = (value: unknown): value is AssessmentVideoCapabilitySources => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const source = value as Record<string, unknown>
  if (typeof source.videoUrl !== 'string' || !source.videoUrl) return false
  if (source.posterUrl !== undefined && typeof source.posterUrl !== 'string') return false
  if (source.expiresAt !== undefined && typeof source.expiresAt !== 'number') return false
  if (source.captions !== undefined && !Array.isArray(source.captions)) return false
  return true
}

export const requestAssessmentVideoCapabilities = async (
  path: string,
  init: RequestInit = {},
): Promise<AssessmentVideoCapabilitySources> => {
  const response = await sessionFetch(path, { ...init, method: 'POST' })
  let body: ApiResponse<unknown> | null = null
  try {
    body = await response.json() as ApiResponse<unknown>
  } catch {
    // Preserve a stable user-facing error below when the server did not return JSON.
  }
  if (!response.ok || !body || body.code !== 0) {
    throw new Error(body?.message || `视频授权失败 (${response.status})`)
  }
  if (!isCapabilitySources(body.data)) throw new Error('视频授权响应无效')
  return body.data
}
