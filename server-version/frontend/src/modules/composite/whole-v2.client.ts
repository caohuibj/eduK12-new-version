import apiClient, { sessionFetch } from '../../api/client'
import type { ApiResponse } from '../../types'
import type { AssessmentVideoCapabilitySources } from '../assessment-media/types'
import type {
  WholeV2CheckpointPutInput,
  WholeV2CheckpointSnapshot,
  WholeV2Client,
  WholeV2Meta,
  WholeV2Receipt,
  WholeV2SubmitInput,
  WholeV2Template,
} from './whole-v2.types'

const MAX_TEMPLATE_CACHE = 64
const templateCache = new Map<string, WholeV2Template>()

export function clearWholeV2TemplateCacheForTests(): void {
  templateCache.clear()
}

function cacheTemplate(hash: string, template: WholeV2Template): void {
  if (templateCache.size >= MAX_TEMPLATE_CACHE && !templateCache.has(hash)) {
    const oldest = templateCache.keys().next().value
    if (oldest) templateCache.delete(oldest)
  }
  templateCache.set(hash, template)
}

const wrapped = <T,>(data: T): ApiResponse<T> => ({ code: 0, message: '成功', data })

export type EducationRawApi = <T>(
  path: string,
  method?: string,
  data?: unknown,
  options?: { responseType?: 'blob' },
) => Promise<T>

/** Training authenticated & public Whole V2 client (reuses shared apiClient + sessionFetch). */
export function createTrainingWholeV2Client(
  attemptId: string,
  options?: { publicMode?: boolean; recoveryToken?: string },
): WholeV2Client {
  const publicMode = Boolean(options?.publicMode)
  const headers = publicMode && options?.recoveryToken
    ? { 'X-Recovery-Token': options.recoveryToken }
    : undefined
  const config = headers ? { headers } : undefined
  const base = `${publicMode ? '/public' : ''}/composite-assessments/attempts/${encodeURIComponent(attemptId)}`

  return {
    loadMeta: () => apiClient.get<WholeV2Meta>(`${base}/v2/whole`, config),
    loadTemplate: async (templateHash: string) => {
      const cached = templateCache.get(templateHash)
      if (cached) return wrapped(cached)
      const res = await apiClient.get<WholeV2Template>(
        `${base}/v2/whole/template/${encodeURIComponent(templateHash)}`,
        config,
      )
      if (res.code === 0 && res.data) cacheTemplate(templateHash, res.data)
      return res
    },
    readCheckpoint: () => apiClient.get<WholeV2CheckpointSnapshot>(`${base}/v2/checkpoint`, config),
    saveCheckpoint: (input: WholeV2CheckpointPutInput) =>
      apiClient.put<WholeV2CheckpointSnapshot>(`${base}/v2/checkpoint`, input, config),
    clearCheckpoint: () => apiClient.delete<{ cleared: boolean }>(`${base}/v2/checkpoint`, config),
    submitWhole: (input: WholeV2SubmitInput) =>
      apiClient.post<WholeV2Receipt>(`${base}/v2/whole/submit`, input, config),
    loadSlotImage: async (slotKey: string, assetId: string) => {
      const url = `/api${base}/slots/${encodeURIComponent(slotKey)}/assets/${encodeURIComponent(assetId)}/content`
      const response = await sessionFetch(url, headers ? { headers } : undefined)
      if (!response.ok) {
        throw Object.assign(new Error('视觉内容加载失败'), { status: response.status })
      }
      return response.blob()
    },
    issueSlotVideo: (slotKey: string, videoKey: string) =>
      apiClient.post<AssessmentVideoCapabilitySources>(
        `${base}/slots/${encodeURIComponent(slotKey)}/video-capabilities`,
        { videoKey },
        config,
      ),
  }
}

/** School / Teacher / Student-Eval Whole V2 client bound to the host's cookie/CSRF transport. */
export function createEducationWholeV2Client(
  api: EducationRawApi,
  attemptBasePath: string,
): WholeV2Client {
  return {
    loadMeta: async () => wrapped(await api<WholeV2Meta>(`${attemptBasePath}/v2/whole`)),
    loadTemplate: async (templateHash: string) => {
      const cached = templateCache.get(templateHash)
      if (cached) return wrapped(cached)
      const data = await api<WholeV2Template>(
        `${attemptBasePath}/v2/whole/template/${encodeURIComponent(templateHash)}`,
      )
      cacheTemplate(templateHash, data)
      return wrapped(data)
    },
    readCheckpoint: async () => wrapped(await api<WholeV2CheckpointSnapshot>(`${attemptBasePath}/v2/checkpoint`)),
    saveCheckpoint: async (input: WholeV2CheckpointPutInput) =>
      wrapped(await api<WholeV2CheckpointSnapshot>(`${attemptBasePath}/v2/checkpoint`, 'PUT', input)),
    clearCheckpoint: async () =>
      wrapped(await api<{ cleared: boolean }>(`${attemptBasePath}/v2/checkpoint`, 'DELETE')),
    submitWhole: async (input: WholeV2SubmitInput) =>
      wrapped(await api<WholeV2Receipt>(`${attemptBasePath}/v2/whole/submit`, 'POST', input)),
    loadSlotImage: async (slotKey: string, assetId: string) => {
      const data = await api<Blob>(
        `${attemptBasePath}/slots/${encodeURIComponent(slotKey)}/assets/${encodeURIComponent(assetId)}/content`,
        'GET',
        undefined,
        { responseType: 'blob' },
      )
      if (!(data instanceof Blob)) throw new Error('测评素材响应无效')
      return data
    },
    issueSlotVideo: async (slotKey: string, videoKey: string) =>
      wrapped(await api<AssessmentVideoCapabilitySources>(
        `${attemptBasePath}/slots/${encodeURIComponent(slotKey)}/video-capabilities`,
        'POST',
        { videoKey },
      )),
  }
}
