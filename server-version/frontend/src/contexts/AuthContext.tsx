import React, { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { authApi } from '../api/auth'
import { clearReauthReturn, readReauthReturn, rememberReauthReturn, type ReauthReturn } from '../components/app-shell/access'
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

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<User | null>(null)
  const [reauthReturn, setReauthReturn] = useState<ReauthReturn | null>(readReauthReturn)
  const [isLoading, setIsLoading] = useState(true)
  const userRef = useRef(user)
  userRef.current = user
  const authEpochRef = useRef(0)
  const lastAuthTransitionAtRef = useRef(0)

  const setUser = (nextUser: User | null) => {
    authEpochRef.current += 1
    lastAuthTransitionAtRef.current = Date.now()
    setUserState(nextUser)
  }

  const prepareReauthentication = useCallback((target: string) => {
    if (!userRef.current) return
    setReauthReturn({ userId: userRef.current.id, role: userRef.current.role, target })
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
      const requestStartedAt = Number((event as CustomEvent<{ requestStartedAt?: number }>).detail?.requestStartedAt || 0)
      // A protected request that started before a newer login must not sign
      // that newer session out when its late 401 finally arrives.
      if (requestStartedAt > 0 && requestStartedAt < lastAuthTransitionAtRef.current) return
      prepareReauthentication(`${window.location.pathname}${window.location.search}${window.location.hash}`)
      authEpochRef.current += 1
      lastAuthTransitionAtRef.current = Date.now()
      // A 401 from login/public capability endpoints is not reported by the
      // transport as session expiry. For an authenticated API request, clear
      // the in-memory identity so ProtectedRoute can redirect normally.
      setUserState(null)
    }

    window.addEventListener('auth:expired', handleAuthExpired)
    return () => window.removeEventListener('auth:expired', handleAuthExpired)
  }, [prepareReauthentication])

  useEffect(() => {
    const initAuth = async () => {
      const requestEpoch = authEpochRef.current
      try {
        const response = await authApi.me()
        if (requestEpoch === authEpochRef.current && response.code === 0 && response.data) {
          lastAuthTransitionAtRef.current = Date.now()
          setUserState(response.data)
        }
      } catch {
        // An absent or expired HttpOnly cookie simply means signed out.
      }
      setIsLoading(false)
    }
    initAuth()
  }, [])

  const login = async (username: string, password: string) => {
    const requestEpoch = ++authEpochRef.current
    await authApi.csrf()
    const response = await authApi.login({ username, password })
    if (requestEpoch !== authEpochRef.current) return
    if (response.code === 0 && response.data) {
      lastAuthTransitionAtRef.current = Date.now()
      setUserState(response.data.user)
    } else {
      throw new Error(response.message || '登录失败')
    }
  }

  const setAuthenticatedUser = (userData: User) => {
    authEpochRef.current += 1
    lastAuthTransitionAtRef.current = Date.now()
    setUserState(userData)
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
    setUserState(null)
  }

  return (
    <AuthContext.Provider value={{
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
    }}>
      {children}
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
