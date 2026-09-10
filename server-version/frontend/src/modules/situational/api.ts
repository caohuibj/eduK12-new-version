import apiClient, { sessionFetch } from '../../api/client'
import type { AssessmentVideoCapabilitySources } from '../assessment-media/types'
import type {
  SituationalAttemptResponse,
  SituationalInstrument,
} from './types'

export interface SituationalFinalSubmitPayload {
  submissionId: string
  attemptEpoch: number
  definitionHash: string
  instrumentVersion: string
  compiledRuntimeHash: string
  scoringVersion: string
  responses: Array<{
    sceneKey: string
    channelKey: string
    responseValue: string | number
    responseTimeMs?: number
    answeredAt?: string
  }>
}

export interface SituationalRunnerClient {
  start: (input: { instrumentKey: string; instrumentVersion?: string }) => Promise<Awaited<ReturnType<typeof situationalApi.start>>>
  resume: (attemptId: string) => Promise<Awaited<ReturnType<typeof situationalApi.resume>>>
  result: (attemptId: string) => Promise<Awaited<ReturnType<typeof situationalApi.result>>>
  submit: (attemptId: string, payload: SituationalFinalSubmitPayload) => Promise<Awaited<ReturnType<typeof situationalApi.submit>>>
  loadAsset: (attemptId: string, assetId: string) => Promise<Blob>
  loadVideoSources: (attemptId: string, sceneKey: string) => Promise<Awaited<ReturnType<typeof situationalApi.loadVideoSources>>>
}

const embeddedPath = (parentAttemptId: string, itemId: string, situationalAttemptId: string, publicMode: boolean) => (
  `${publicMode ? '/public' : ''}/composite-assessments/attempts/${encodeURIComponent(parentAttemptId)}/items/${encodeURIComponent(itemId)}/situational/${encodeURIComponent(situationalAttemptId)}`
)

const embeddedClient = (parentAttemptId: string, itemId: string, recoveryToken?: string, publicMode = Boolean(recoveryToken)): SituationalRunnerClient => {
  const config = publicMode && recoveryToken ? { headers: { 'X-Recovery-Token': recoveryToken } } : undefined
  const assetConfig = publicMode && recoveryToken ? { headers: { 'X-Recovery-Token': recoveryToken } } : undefined
  const path = (attemptId: string, suffix = '') => `${embeddedPath(parentAttemptId, itemId, attemptId, publicMode)}${suffix}`
  const loadAsset = async (attemptId: string, assetId: string): Promise<Blob> => {
    const response = await sessionFetch(`/api${path(attemptId, `/assets/${encodeURIComponent(assetId)}/content`)}`, assetConfig)
    if (!response.ok) throw Object.assign(new Error('视觉内容加载失败'), { status: response.status })
    return response.blob()
  }
  return {
    // Embedded attempts are created with their parent. The runner never
    // creates a second child attempt, so start is intentionally unavailable.
    start: async () => { throw new Error('综合测评情境化模块必须从已冻结槽位进入') },
    resume: (attemptId) => apiClient.get(path(attemptId), config),
    result: (attemptId) => apiClient.get(path(attemptId), config),
    submit: (attemptId, payload) => apiClient.post(`${path(attemptId, '/submit')}`, payload, config),
    loadAsset,
    loadVideoSources: (attemptId, sceneKey) => apiClient.get<AssessmentVideoCapabilitySources>(
      path(attemptId, `/scenes/${encodeURIComponent(sceneKey)}/video-sources`),
      config,
    ),
  }
}

export const situationalApi = {
  listInstruments: () => apiClient.get<{ list: SituationalInstrument[] }>('/situational/instruments'),
  getInstrument: (instrumentKey: string, instrumentVersion?: string) => apiClient.get<SituationalInstrument>(
    `/situational/instruments/${encodeURIComponent(instrumentKey)}${instrumentVersion ? `?version=${encodeURIComponent(instrumentVersion)}` : ''}`,
  ),
  start: (input: { instrumentKey: string; instrumentVersion?: string }) => (
    apiClient.post<SituationalAttemptResponse>('/situational/attempts', input)
  ),
  resume: (attemptId: string) => apiClient.get<SituationalAttemptResponse>(`/situational/attempts/${encodeURIComponent(attemptId)}`),
  resumePost: (attemptId: string) => apiClient.post<SituationalAttemptResponse>(`/situational/attempts/${encodeURIComponent(attemptId)}/resume`, {}),
  result: (attemptId: string) => apiClient.get<SituationalAttemptResponse>(`/situational/attempts/${encodeURIComponent(attemptId)}/result`),
  loadAsset: async (attemptId: string, assetId: string) => {
    const response = await sessionFetch(`/api/situational/attempts/${encodeURIComponent(attemptId)}/assets/${encodeURIComponent(assetId)}/content`)
    if (!response.ok) throw Object.assign(new Error('视觉内容加载失败'), { status: response.status })
    return response.blob()
  },
  loadVideoSources: (attemptId: string, sceneKey: string) => apiClient.get<AssessmentVideoCapabilitySources>(
    `/situational/attempts/${encodeURIComponent(attemptId)}/scenes/${encodeURIComponent(sceneKey)}/video-sources`,
  ),
  submit: (attemptId: string, payload: SituationalFinalSubmitPayload) => (
    apiClient.post<SituationalAttemptResponse>(`/situational/attempts/${encodeURIComponent(attemptId)}/submit`, payload)
  ),
  history: () => apiClient.get<{ list: SituationalAttemptResponse[]; total: number }>('/situational/history'),
}

export const embeddedSituationalApi = (parentAttemptId: string, itemId: string): SituationalRunnerClient => (
  embeddedClient(parentAttemptId, itemId)
)

export const publicEmbeddedSituationalApi = (parentAttemptId: string, itemId: string, recoveryToken: string): SituationalRunnerClient => (
  embeddedClient(parentAttemptId, itemId, recoveryToken, true)
)
