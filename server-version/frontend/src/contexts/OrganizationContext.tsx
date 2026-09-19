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

const errorMessage = (value: unknown, fallback: string) => value instanceof Error && value.message
  ? value.message
  : fallback

export const OrganizationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth()
  const [platformRole, setPlatformRole] = useState<PlatformRole | null>(null)
  const [organizations, setOrganizations] = useState<AccessibleOrganization[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<OrganizationContextProjection | null>(null)
  const [activeLoading, setActiveLoading] = useState(false)
  const [activeError, setActiveError] = useState<string | null>(null)
  const discoveryEpochRef = useRef(0)
  const activeEpochRef = useRef(0)

  const reset = useCallback(() => {
    discoveryEpochRef.current += 1
    activeEpochRef.current += 1
    setPlatformRole(null)
    setOrganizations([])
    setTotal(0)
    setError(null)
    setActive(null)
    setActiveError(null)
    setIsLoading(false)
    setActiveLoading(false)
  }, [])

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
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
      setOrganizations(projection.list)
      setTotal(projection.total)
      if (activeEpochRef.current === activeEpochAtStart) {
        setActive((current) => current && projection.list.some((item) => item.id === current.organization.id)
          ? current
          : null)
      }
    } catch (err) {
      if (discoveryEpoch !== discoveryEpochRef.current) return
      setError(errorMessage(err, '无法加载组织列表'))
      setPlatformRole(null)
      setOrganizations([])
      setTotal(0)
      if (activeEpochRef.current === activeEpochAtStart) setActive(null)
    } finally {
      if (discoveryEpoch === discoveryEpochRef.current) setIsLoading(false)
    }
  }, [isAuthenticated, reset])

  const selectOrganization = useCallback(async (organizationId: string) => {
    if (!isAuthenticated || !organizationId) return null
    const activeEpoch = ++activeEpochRef.current
    setActiveLoading(true)
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
  }, [isAuthenticated])

  const clearActiveOrganization = useCallback(() => {
    activeEpochRef.current += 1
    setActive(null)
    setActiveError(null)
    setActiveLoading(false)
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) {
      reset()
      return
    }
    void refresh()
  }, [authLoading, isAuthenticated, user?.id, refresh, reset])

  return (
    <OrganizationProductContext.Provider value={{
      platformRole,
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
