import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { capabilitiesApi } from '../api/capabilities'
import { cognitiveBuildEnabled } from '../modules/cognitive/feature'

interface CapabilitiesContextType {
  cognitiveEnabled: boolean
  isLoading: boolean
}

const CapabilitiesContext = createContext<CapabilitiesContextType>({
  cognitiveEnabled: cognitiveBuildEnabled,
  isLoading: false,
})

export const CapabilitiesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [cognitiveEnabled, setCognitiveEnabled] = useState(cognitiveBuildEnabled)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    capabilitiesApi.get()
      .then((response) => {
        if (cancelled) return
        if (response.code === 0 && typeof response.data?.cognitive === 'boolean') {
          setCognitiveEnabled(response.data.cognitive)
        }
      })
      .catch(() => {
        // Keep the build-time fallback when the capabilities endpoint is unreachable.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <CapabilitiesContext.Provider value={{ cognitiveEnabled, isLoading }}>
      {children}
    </CapabilitiesContext.Provider>
  )
}

export const useCognitiveEnabled = () => useContext(CapabilitiesContext).cognitiveEnabled
