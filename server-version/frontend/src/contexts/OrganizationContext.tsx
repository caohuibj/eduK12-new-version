import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import {
  organizationApi,
  type AccessibleOrganization,
  type OrganizationContextProjection,
  type PlatformRole,
} from '../api/organizations'

interface OrganizationProductContextValue {
  platformRole: PlatformRole | null
  allowedActions: string[]
  organizations: AccessibleOrganization[]
  total: number
  isLoading: boolean
  error: string | null
  active: OrganizationContextProjection | null
  activeLoading: boolean
  activeError: string | null
  refresh: () => Promise<void>
  selectOrganization: (organizationId: string) => Promise<OrganizationContextProjection | null>
  clearActiveOrganization: () => void
}

const OrganizationProductContext = createContext<OrganizationProductContextValue | undefined>(undefined)

const errorMessage = (value: unknown, fallback: string) => {
  const message = (value as { message?: unknown } | null)?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

export const OrganizationProvider: React.FC<{ children: ReactNode; suspended?: boolean }> = ({ children, suspended = false }) => {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth()
  const principal = isAuthenticated ? user?.id ?? null : null
  const [statePrincipal, setStatePrincipal] = useState(principal)
  const [platformRole, setPlatformRole] = useState<PlatformRole | null>(null)
  const [allowedActions, setAllowedActions] = useState<string[]>([])
  const [organizations, setOrganizations] = useState<AccessibleOrganization[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(Boolean(principal) && !suspended)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<OrganizationContextProjection | null>(null)
  const [activeLoading, setActiveLoading] = useState(false)
  const [activeError, setActiveError] = useState<string | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active
  const discoveryEpochRef = useRef(0)
  const activeEpochRef = useRef(0)

  const reset = useCallback(() => {
    discoveryEpochRef.current += 1
    activeEpochRef.current += 1
    setPlatformRole(null)
    setAllowedActions([])
    setOrganizations([])
    setTotal(0)
    setError(null)
    setActive(null)
    setActiveError(null)
    setIsLoading(false)
    setActiveLoading(false)
  }, [])

  // Reset this provider before rendering descendants for the new principal.
  // Do not key/remount the route tree: login navigation and account-recovery
  // state must survive the authentication update that they initiated.
  if (statePrincipal !== principal) {
    setStatePrincipal(principal)
    reset()
  }

  const refresh = useCallback(async () => {
    if (!principal || suspended) {
      reset()
      return
    }
    const discoveryEpoch = ++discoveryEpochRef.current
    const activeEpochAtStart = activeEpochRef.current
    setIsLoading(true)
    setError(null)
    try {
      const projection = await organizationApi.list(1, 100)
      if (discoveryEpoch !== discoveryEpochRef.current) return
      setPlatformRole(projection.platformRole)
      setAllowedActions(projection.allowedActions ?? [])
      setOrganizations(projection.list)
      setTotal(projection.total)
      // Discovery is paginated and is not an authority refresh. Re-read the
      // selected exact context, including roles/grants changed on the server.
      const selected = activeRef.current
      if (projection.total === 0 && activeEpochRef.current === activeEpochAtStart) {
        activeEpochRef.current += 1
        setActive(null)
        setActiveError(null)
        setActiveLoading(false)
      } else if (selected && activeEpochRef.current === activeEpochAtStart) {
        setActiveLoading(true)
        try {
          const next = await organizationApi.context(selected.organization.id)
          if (discoveryEpoch === discoveryEpochRef.current && activeEpochRef.current === activeEpochAtStart) {
            setActive(next)
            setActiveError(null)
          }
        } catch (err) {
          if (discoveryEpoch === discoveryEpochRef.current && activeEpochRef.current === activeEpochAtStart) {
            setActive(null)
            setActiveError(errorMessage(err, '组织权限已失效'))
          }
        } finally {
          if (discoveryEpoch === discoveryEpochRef.current && activeEpochRef.current === activeEpochAtStart) setActiveLoading(false)
        }
      }
    } catch (err) {
      if (discoveryEpoch !== discoveryEpochRef.current) return
      setError(errorMessage(err, '无法加载组织列表'))
      setPlatformRole(null)
      setAllowedActions([])
      setOrganizations([])
      setTotal(0)
      if (activeEpochRef.current === activeEpochAtStart) setActive(null)
    } finally {
      if (discoveryEpoch === discoveryEpochRef.current) setIsLoading(false)
    }
  }, [principal, reset, suspended])

  const selectOrganization = useCallback(async (organizationId: string) => {
    if (suspended || !principal || !organizationId) return null
    const activeEpoch = ++activeEpochRef.current
    setActiveLoading(true)
    setActive(null)
    setActiveError(null)
    try {
      const projection = await organizationApi.context(organizationId)
      if (activeEpoch !== activeEpochRef.current) return null
      setPlatformRole(projection.access.platformRole)
      setActive(projection)
      return projection
    } catch (err) {
      if (activeEpoch !== activeEpochRef.current) return null
      setActive(null)
      setActiveError(errorMessage(err, '无法加载组织权限上下文'))
      return null
    } finally {
      if (activeEpoch === activeEpochRef.current) setActiveLoading(false)
    }
  }, [principal, suspended])

  const clearActiveOrganization = useCallback(() => {
    activeEpochRef.current += 1
    setActive(null)
    setActiveError(null)
    setActiveLoading(false)
  }, [])

  useEffect(() => {
    if (suspended) { reset(); return }
    if (authLoading) return
    if (!isAuthenticated) {
      reset()
      return
    }
    void refresh()
  }, [authLoading, isAuthenticated, user?.id, refresh, reset, suspended])

  useEffect(() => {
    if (suspended || !isAuthenticated || authLoading) return
    const refreshOnFocus = () => { void refresh() }
    window.addEventListener('focus', refreshOnFocus)
    return () => window.removeEventListener('focus', refreshOnFocus)
  }, [isAuthenticated, authLoading, refresh, suspended])

  return (
    <OrganizationProductContext.Provider value={{
      platformRole,
      allowedActions,
      organizations,
      total,
      isLoading,
      error,
      active,
      activeLoading,
      activeError,
      refresh,
      selectOrganization,
      clearActiveOrganization,
    }}>
      {children}
    </OrganizationProductContext.Provider>
  )
}

export const useOrganization = () => {
  const context = useContext(OrganizationProductContext)
  if (!context) throw new Error('useOrganization must be used within an OrganizationProvider')
  return context
}
