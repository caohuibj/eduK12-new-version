import apiClient from './client'

export const capabilitiesApi = {
  get: () => apiClient.get<{ cognitive: boolean }>('/capabilities'),
}
