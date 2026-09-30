import apiClient from './client'

export const capabilitiesApi = {
  get: (signal?: AbortSignal) => apiClient.get<{ cognitive: boolean }>('/capabilities', { timeout: 3000, signal }),
}
