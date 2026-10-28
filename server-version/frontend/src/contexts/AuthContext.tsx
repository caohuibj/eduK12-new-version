import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import { authApi, type LoginRequest, type AdminMfaInput } from '../api/auth'
import {
  clearReauthReturn,
  isAuthPath,
  readReauthReturn,
  rememberReauthReturn,
  type ReauthReturn,
} from '../components/app-shell/access'
import type { User } from '../types'
import {userForAccountView,type AccountView} from '../admin/accountView'

interface AuthContextType {
  user: User | null
  reauthReturn: ReauthReturn | null
  prepareReauthentication: (target: string) => void
  clearReauthentication: () => void
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string, expectedRole?: LoginRequest['expectedRole'], entrance?: 'admin', mfa?: AdminMfaInput) => Promise<User | undefined>
  setAuthenticatedUser: (userData: User) => void
  logout: () => Promise<void>
  setUser: (user: User | null) => void
}

export const AUTH_SESSION_SIGNAL = 'huisurvey:session-changed'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUserState] = useState<User | null>(null)
  const [reauthReturn, setReauthReturn] = useState<ReauthReturn | null>(
    readReauthReturn,
  )
  const [isLoading, setIsLoading] = useState(true)
  const [identityGeneration, setIdentityGeneration] = useState(0)
  const userRef = useRef(user)
  userRef.current = user
  const authEpochRef = useRef(0)
  const lastAuthTransitionAtRef = useRef(0)
  const sessionChannel = useRef<BroadcastChannel | null>(null)
  const localLoginPending = useRef<number | null>(null)
  const renderEpoch = authEpochRef.current
  const notifySessionChanged = () => {
    // Only a change nonce is shared: never credentials, identity or tokens.
    let nonce: string
    try { nonce = crypto.randomUUID() } catch {
      sessionChannel.current?.postMessage(AUTH_SESSION_SIGNAL)
      return
    }
    sessionChannel.current?.postMessage({type: AUTH_SESSION_SIGNAL, nonce})
    try {
      localStorage.setItem(AUTH_SESSION_SIGNAL, nonce)
    } catch {
      /* Focus revalidation remains available. */
    }
  }

  const replaceIdentity = useCallback((next: User | null) => {
    // Preserve the initial login component until its navigation completes.
    // An existing account changing or leaving must discard its workspace state.
    // Login pages keep their completion hook through an intentional account switch.
    if (
      userRef.current &&
      userRef.current.id !== next?.id &&
      !isAuthPath(window.location.pathname)
    ) {
      setIdentityGeneration((generation) => generation + 1)
    }
    userRef.current = next
    setUserState(next)
  }, [])

  const setUser = (nextUser: User | null) => {
    const current = userRef.current
    // Profile reads cannot restore a departed account or change auth authority.
    // Login/registration and /me are the identity-changing paths.
    if (nextUser && (!current || current.id !== nextUser.id)) return
    // A departed page may still hold a password/profile completion callback.
    if (
      !nextUser &&
      (!current ||
        current.id !== user?.id ||
        renderEpoch !== authEpochRef.current)
    )
      return
    authEpochRef.current += 1
    lastAuthTransitionAtRef.current = Date.now()
    replaceIdentity(
      nextUser && current
        ? {
            ...current,
            ...nextUser,
            role: current.role,
            platformRole: current.platformRole,
            businessRole: current.businessRole,
            entryGrants: current.entryGrants,
          }
        : null,
    )
    setIsLoading(false)
    // Ordinary profile refreshes must not reset another tab's draft or trigger
    // a profile-fetch/broadcast/remount loop between same-account tabs.
    if (!nextUser && current) notifySessionChanged()
  }

  const prepareReauthentication = useCallback((target: string) => {
    if (!userRef.current) return
    setReauthReturn({
      userId: userRef.current.id,
      role: userRef.current.role,
      target,
    })
    rememberReauthReturn(userRef.current, target)
  }, [])

  const clearReauthentication = useCallback(() => {
    setReauthReturn(null)
    clearReauthReturn()
  }, [])

  useEffect(() => {
    const handleAuthExpired = (event: Event) => {
      // An anonymous initial /me 401 is not expiry of a signed-in session.
      // It must not invalidate a login that is already in flight.
      if (!userRef.current) return
      const requestStartedAt = Number(
        (event as CustomEvent<{ requestStartedAt?: number }>).detail
          ?.requestStartedAt || 0,
      )
      // A protected request that started before a newer login must not sign
      // that newer session out when its late 401 finally arrives.
      if (
        requestStartedAt > 0 &&
        requestStartedAt < lastAuthTransitionAtRef.current
      )
        return
      prepareReauthentication(
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      )
      authEpochRef.current += 1
      lastAuthTransitionAtRef.current = Date.now()
      // A 401 from login/public capability endpoints is not reported by the
      // transport as session expiry. For an authenticated API request, clear
      // the in-memory identity so ProtectedRoute can redirect normally.
      replaceIdentity(null)
      setIsLoading(false)
    }

    window.addEventListener('auth:expired', handleAuthExpired)
    return () => window.removeEventListener('auth:expired', handleAuthExpired)
  }, [prepareReauthentication, replaceIdentity])

  useEffect(() => {
    let alive = true
    let validation = 0
    const pendingEpochs = new Set<number>()
    const validateSession = async (changed = false, initial = false) => {
      if (!changed && localLoginPending.current) return
      // Focus and visibility commonly fire together. Share only an in-flight
      // check for this identity epoch; identity-change notifications stay fresh.
      if (!changed && pendingEpochs.has(authEpochRef.current)) return
      if (changed) {
        authEpochRef.current += 1
        lastAuthTransitionAtRef.current = Date.now()
        replaceIdentity(null)
        setIsLoading(true)
      }
      const requestEpoch = authEpochRef.current
      const sequence = ++validation
      pendingEpochs.add(requestEpoch)
      try {
        const response = await authApi.me()
        if (
          !alive ||
          sequence !== validation ||
          requestEpoch !== authEpochRef.current
        )
          return
        const next = response.code === 0 && response.data ? response.data : null
        lastAuthTransitionAtRef.current = Date.now()
        replaceIdentity(next)
      } catch (error) {
        if (
          !alive ||
          sequence !== validation ||
          requestEpoch !== authEpochRef.current
        )
          return
        const status =
          (error as { response?: { status?: number }; status?: number })
            ?.response?.status ?? (error as { status?: number })?.status
        // A transient focus request failure alone does not erase a valid draft.
        // A notified identity change already removed the old account and form.
        if (changed || initial || status === 401) {
          replaceIdentity(null)
        }
      } finally {
        pendingEpochs.delete(requestEpoch)
        if (alive && sequence === validation) setIsLoading(false)
      }
    }
    const seenChanges = new Set<string>()
    const changed = (nonce?: string) => {
      if (nonce) {
        if (seenChanges.has(nonce)) return
        seenChanges.add(nonce)
        if (seenChanges.size > 32) seenChanges.delete(seenChanges.values().next().value!)
      }
      void validateSession(true)
    }
    const storageChanged = (event: StorageEvent) => {
      if (event.key === AUTH_SESSION_SIGNAL) changed(event.newValue || undefined)
    }
    const focus = () => {
      void validateSession()
    }
    const visible = () => {
      if (document.visibilityState === 'visible') focus()
    }
    if (typeof BroadcastChannel !== 'undefined') {
      sessionChannel.current = new BroadcastChannel(AUTH_SESSION_SIGNAL)
      sessionChannel.current.onmessage = (event) => {
        if (event.data === AUTH_SESSION_SIGNAL) changed()
        else if (event.data?.type === AUTH_SESSION_SIGNAL && typeof event.data.nonce === 'string' && event.data.nonce.length > 0 && event.data.nonce.length <= 128) changed(event.data.nonce)
      }
    }
    window.addEventListener('storage', storageChanged)
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', visible)
    void validateSession(false, true)
    return () => {
      alive = false
      window.removeEventListener('storage', storageChanged)
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', visible)
      sessionChannel.current?.close()
      sessionChannel.current = null
    }
  }, [replaceIdentity])

  const login = async (username: string, password: string, expectedRole?: LoginRequest['expectedRole'], entrance?: 'admin', mfa?: AdminMfaInput) => {
    const requestEpoch = ++authEpochRef.current
    localLoginPending.current = requestEpoch
    try {
      await authApi.csrf()
      if (requestEpoch !== authEpochRef.current) return
      const data = { username, password, ...(expectedRole ? { expectedRole } : {}) }
      const response = await (entrance ? mfa ? authApi.login(data, entrance, mfa) : authApi.login(data, entrance) : authApi.login(data))
      if (requestEpoch !== authEpochRef.current) return
      if (response.code === 0 && response.data) {
        lastAuthTransitionAtRef.current = Date.now()
        replaceIdentity(response.data.user)
        setIsLoading(false)
        notifySessionChanged()
        return response.data.user
      } else {
        throw new Error(response.message || '登录失败')
      }
    } finally {
      if (localLoginPending.current === requestEpoch)
        localLoginPending.current = null
    }
  }

  const setAuthenticatedUser = (userData: User) => {
    authEpochRef.current += 1
    lastAuthTransitionAtRef.current = Date.now()
    replaceIdentity(userData)
    setIsLoading(false)
    notifySessionChanged()
  }

  const logout = async () => {
    if (
      user?.id !== userRef.current?.id ||
      renderEpoch !== authEpochRef.current
    )
      return
    const requestEpoch = ++authEpochRef.current
    lastAuthTransitionAtRef.current = Date.now()
    try {
      await authApi.csrf()
      if (requestEpoch !== authEpochRef.current) return
      await authApi.logout()
    } catch {
      // Clearing local state is still safe if the session has already expired.
    }
    if (requestEpoch !== authEpochRef.current) return
    replaceIdentity(null)
    setIsLoading(false)
    notifySessionChanged()
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        reauthReturn,
        prepareReauthentication,
        clearReauthentication,
        isAuthenticated: !!user,
        isLoading,
        login,
        setAuthenticatedUser,
        logout,
        setUser,
      }}
    >
      <React.Fragment key={identityGeneration}>{children}</React.Fragment>
    </AuthContext.Provider>
  )
}

export function AccountViewProvider({view,children}:{view:AccountView;children:ReactNode}){
  const current=useAuth()
  const user=useMemo(()=>userForAccountView(current.user,view),[current.user,view])
  return <AuthContext.Provider value={{...current,user}}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
