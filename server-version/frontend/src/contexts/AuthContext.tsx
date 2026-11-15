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
import { isTrainingHost } from '../training/context'
import {
  isTrainingBusy,
  isTrainingUncertainRequestError,
  runTrainingRetry,
  runWithTrainingTimeout,
  TrainingRetryCancelledError,
} from '../services/trainingBusyRetry'
import { normalizeApiError } from '../utils/normalizeApiError'
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
  loginRetryMessage: string | null
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
  const [loginRetryMessage, setLoginRetryMessage] = useState<string | null>(null)
  const [identityGeneration, setIdentityGeneration] = useState(0)
  const userRef = useRef(user)
  userRef.current = user
  const authEpochRef = useRef(0)
  const lastAuthTransitionAtRef = useRef(0)
  const sessionChannel = useRef<BroadcastChannel | null>(null)
  const localLoginPending = useRef<number | null>(null)
  const unmountAbortRef = useRef<AbortController | null>(null)
  const loginAbortRef = useRef<AbortController | null>(null)
  const abortActiveLogin = useCallback(() => {
    loginAbortRef.current?.abort()
    loginAbortRef.current = null
  }, [])
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
    const unmountController = new AbortController()
    unmountAbortRef.current = unmountController
    window.addEventListener('storage', storageChanged)
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', visible)
    void validateSession(false, true)
    return () => {
      alive = false
      unmountController.abort()
      abortActiveLogin()
      window.removeEventListener('storage', storageChanged)
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', visible)
      sessionChannel.current?.close()
      sessionChannel.current = null
    }
  }, [abortActiveLogin, replaceIdentity])

  const login = async (username: string, password: string, expectedRole?: LoginRequest['expectedRole'], entrance?: 'admin', mfa?: AdminMfaInput) => {
    abortActiveLogin()
    const requestEpoch = ++authEpochRef.current
    const loginController = new AbortController()
    if (unmountAbortRef.current?.signal.aborted) {
      loginController.abort()
    }
    loginAbortRef.current = loginController
    localLoginPending.current = requestEpoch
    setLoginRetryMessage(null)
    const isCurrent = () => requestEpoch === authEpochRef.current && !loginController.signal.aborted
    try {
      await authApi.csrf({ signal: loginController.signal })
      if (!isCurrent()) return
      const data = { username, password, ...(expectedRole ? { expectedRole } : {}) }
      const requestLogin = (attemptSignal?: AbortSignal) => {
        const config = attemptSignal ? { signal: attemptSignal } : undefined
        return entrance
          ? mfa
            ? authApi.login(data, entrance, mfa, config)
            : authApi.login(data, entrance, undefined, config)
          : authApi.login(data, undefined, undefined, config)
      }
      const response = !entrance && isTrainingHost()
        ? await runTrainingRetry<Awaited<ReturnType<typeof authApi.login>>>(
          (attemptSignal) => requestLogin(attemptSignal),
          async (cause, context) => {
            if (isTrainingBusy(cause, ['LOGIN_VERIFY_BUSY', 'LOGIN_LOOKUP_BUSY'])) {
              return { kind: 'retry', retryAfterMs: normalizeApiError(cause).retryAfterMs }
            }
            if (!isTrainingUncertainRequestError(cause) || context.remainingWaitMs <= 0) {
              return { kind: 'stop' }
            }
            try {
              const sessionCheck = await runWithTrainingTimeout(
                (meSignal) => authApi.me({ signal: meSignal }),
                { timeoutMs: Math.min(10_000, context.remainingWaitMs), signal: loginController.signal, isCurrent },
              )
              if (sessionCheck.code === 0 && sessionCheck.data?.username === username) {
                return {
                  kind: 'return',
                  value: { code: 0, message: sessionCheck.message || 'OK', data: { user: sessionCheck.data } },
                }
              }
              // Only retry password login when /auth/me positively confirms no session exists.
              return sessionCheck.code !== 0 ? { kind: 'retry', retryAfterMs: 1_000 } : { kind: 'stop' }
            } catch (checkErr) {
              if (checkErr instanceof TrainingRetryCancelledError) throw checkErr
              return { kind: 'stop' }
            }
          },
          {
            signal: loginController.signal,
            isCurrent,
            onRetry: (delayMs) => setLoginRetryMessage(`登录繁忙，${Math.ceil(delayMs / 1000)} 秒后自动重试。`),
          },
        )
        : await requestLogin(loginController.signal)
      if (!isCurrent()) return
      if (response.code === 0 && response.data) {
        lastAuthTransitionAtRef.current = Date.now()
        replaceIdentity(response.data.user)
        setIsLoading(false)
        notifySessionChanged()
        return response.data.user
      } else {
        throw new Error(response.message || '登录失败')
      }
    } catch (error) {
      if (error instanceof TrainingRetryCancelledError && !isCurrent()) return
      throw error
    } finally {
      if (loginAbortRef.current === loginController) {
        loginAbortRef.current = null
      }
      if (localLoginPending.current === requestEpoch) {
        localLoginPending.current = null
        setLoginRetryMessage(null)
      }
    }
  }

  const setAuthenticatedUser = (userData: User) => {
    abortActiveLogin()
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
    abortActiveLogin()
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
        loginRetryMessage,
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
