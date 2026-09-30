import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { capabilitiesApi } from '../api/capabilities'
import { cognitiveBuildEnabled } from '../modules/cognitive/feature'

interface CapabilitiesContextType {
  cognitiveEnabled: boolean
  isLoading: boolean
}

const CapabilitiesContext = createContext<CapabilitiesContextType>({
  cognitiveEnabled: false,
  isLoading: false,
})

export const CapabilitiesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [cognitiveEnabled, setCognitiveEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          const response = await Promise.race([
            capabilitiesApi.get(controller.signal),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Capability request timed out')), 3000) }),
          ])
          if (controller.signal.aborted) return
          if (response.code !== 0 || typeof response.data?.cognitive !== 'boolean') throw new Error('Invalid capabilities')
          setCognitiveEnabled(cognitiveBuildEnabled && response.data.cognitive)
          setIsLoading(false)
          return
        } catch { if (controller.signal.aborted) return }
        finally { clearTimeout(timer) }
      }
      if (!controller.signal.aborted) { setCognitiveEnabled(false); setIsLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [])

  return (
    <CapabilitiesContext.Provider value={{ cognitiveEnabled, isLoading }}>
      {children}
    </CapabilitiesContext.Provider>
  )
}

export const useCapabilities = () => useContext(CapabilitiesContext)

export const useCognitiveEnabled = () => useCapabilities().cognitiveEnabled
