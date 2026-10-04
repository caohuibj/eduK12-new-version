import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react'
import { authApi } from '../api/auth'
import {
  clearReauthReturn,
  isAuthPath,
  readReauthReturn,
  rememberReauthReturn,
  type ReauthReturn,
} from '../components/app-shell/access'
import type { User } from '../types'

interface AuthContextType {
  user: User | null
  reauthReturn: ReauthReturn | null
  prepareReauthentication: (target: string) => void
  clearReauthentication: () => void
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
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
  const localLoginPending = useRef(false)
  const notifySessionChanged = () => {
    // Only a change nonce is shared: never credentials, identity or tokens.
    sessionChannel.current?.postMessage(AUTH_SESSION_SIGNAL)
    try {
      localStorage.setItem(AUTH_SESSION_SIGNAL, crypto.randomUUID())
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
    authEpochRef.current += 1
    lastAuthTransitionAtRef.current = Date.now()
    replaceIdentity(
      nextUser && current
        ? {
            ...current,
            ...nextUser,
            role: current.role,
            platformRole: current.platformRole,
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
    const validateSession = async (changed = false, initial = false) => {
      if (!changed && localLoginPending.current) return
      if (changed) {
        authEpochRef.current += 1
        lastAuthTransitionAtRef.current = Date.now()
        replaceIdentity(null)
        setIsLoading(true)
      }
      const requestEpoch = authEpochRef.current
      const sequence = ++validation
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
        if (alive && sequence === validation) setIsLoading(false)
      }
    }
    const changed = () => {
      void validateSession(true)
    }
    const storageChanged = (event: StorageEvent) => {
      if (event.key === AUTH_SESSION_SIGNAL) changed()
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

  const login = async (username: string, password: string) => {
    const requestEpoch = ++authEpochRef.current
    localLoginPending.current = true
    try {
      await authApi.csrf()
      const response = await authApi.login({ username, password })
      if (requestEpoch !== authEpochRef.current) return
      if (response.code === 0 && response.data) {
        lastAuthTransitionAtRef.current = Date.now()
        replaceIdentity(response.data.user)
        setIsLoading(false)
        notifySessionChanged()
      } else {
        throw new Error(response.message || '登录失败')
      }
    } finally {
      localLoginPending.current = false
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
    authEpochRef.current += 1
    lastAuthTransitionAtRef.current = Date.now()
    try {
      await authApi.csrf()
      await authApi.logout()
    } catch {
      // Clearing local state is still safe if the session has already expired.
    }
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

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
