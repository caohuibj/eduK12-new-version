import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { capabilitiesApi } from '../api/capabilities'
import { cognitiveBuildEnabled } from '../modules/cognitive/feature'
interface CapabilitiesContextType {
  parentPortalEnabled: boolean
  cognitiveEnabled: boolean
  isLoading: boolean
  status: 'loading' | 'ready' | 'error'
  retry: () => void
}
const CapabilitiesContext = createContext<CapabilitiesContextType>({
  parentPortalEnabled: false,
  cognitiveEnabled: false,
  isLoading: true,
  status: 'loading',
  retry: () => {},
})
export const CapabilitiesProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState({
      parentPortalEnabled: false,
      cognitiveEnabled: false,
      status: 'loading' as CapabilitiesContextType['status'],
    }),
    [revision, setRevision] = useState(0)
  const status = useRef(state.status)
  status.current = state.status
  const retry = useCallback(() => setRevision((n) => n + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    if (status.current !== 'ready')
      setState((previous) => ({ ...previous, status: 'loading' }))
    const load = async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          const response = await Promise.race([
            capabilitiesApi.get(controller.signal),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error('Capability timeout')),
                3000,
              )
            }),
          ])
          if (controller.signal.aborted) return
          if (
            response.code !== 0 ||
            typeof response.data?.cognitive !== 'boolean' ||
            typeof response.data?.parentPortal !== 'boolean'
          )
            throw new Error('Invalid capabilities')
          setState({
            parentPortalEnabled: response.data.parentPortal,
            cognitiveEnabled: cognitiveBuildEnabled && response.data.cognitive,
            status: 'ready',
          })
          return
        } catch {
          if (controller.signal.aborted) return
        } finally {
          clearTimeout(timer)
        }
      }
      if (!controller.signal.aborted)
        setState({
          parentPortalEnabled: false,
          cognitiveEnabled: false,
          status: 'error',
        })
    }
    void load()
    return () => controller.abort()
  }, [revision])
  useEffect(() => {
    window.addEventListener('focus', retry)
    return () => window.removeEventListener('focus', retry)
  }, [retry])
  return (
    <CapabilitiesContext.Provider
      value={{ ...state, isLoading: state.status === 'loading', retry }}
    >
      {children}
    </CapabilitiesContext.Provider>
  )
}
export const useCapabilities = () => useContext(CapabilitiesContext)
export const useCognitiveEnabled = () => useCapabilities().cognitiveEnabled
