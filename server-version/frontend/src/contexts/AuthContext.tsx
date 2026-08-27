import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { authApi } from '../api/auth'
import type { User } from '../types'

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  setAuthenticatedUser: (userData: User) => void
  logout: () => Promise<void>
  setUser: (user: User | null) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const initAuth = async () => {
      try {
        const response = await authApi.me()
        if (response.code === 0 && response.data) setUser(response.data)
      } catch {
        // An absent or expired HttpOnly cookie simply means signed out.
      }
      setIsLoading(false)
    }
    initAuth()
  }, [])

  const login = async (username: string, password: string) => {
    await authApi.csrf()
    const response = await authApi.login({ username, password })
    if (response.code === 0 && response.data) {
      setUser(response.data.user)
    } else {
      throw new Error(response.message || '登录失败')
    }
  }

  const setAuthenticatedUser = (userData: User) => {
    setUser(userData)
  }

  const logout = async () => {
    try {
      await authApi.csrf()
      await authApi.logout()
    } catch {
      // Clearing local state is still safe if the session has already expired.
    }
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{
      user,
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
