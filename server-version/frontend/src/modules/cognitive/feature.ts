import apiClient from '../../api/client'

export interface BackendCapabilities {
  cognitive: boolean
}

/**
 * The backend owns the runtime feature decision. A failed capability request
 * fails closed so the client never exposes a route the server will reject.
 */
export const loadCognitiveCapability = async (): Promise<boolean> => {
  try {
    const response = await apiClient.get<BackendCapabilities>('/capabilities')
    return response.code === 0 && response.data?.cognitive === true
  } catch {
    return false
  }
}

