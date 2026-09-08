import apiClient from '../../api/client'
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
  submit: (attemptId: string, payload: SituationalFinalSubmitPayload) => (
    apiClient.post<SituationalAttemptResponse>(`/situational/attempts/${encodeURIComponent(attemptId)}/submit`, payload)
  ),
  history: () => apiClient.get<{ list: SituationalAttemptResponse[]; total: number }>('/situational/history'),
}

