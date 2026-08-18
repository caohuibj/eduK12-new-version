import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { authApi, type LoginData } from '../api/auth'
import type { User, ApiResponse } from '../types'

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, nickname?: string, teacherCode?: string) => Promise<void>
  loginWithToken: (token: string, userData: User) => void
  logout: () => void
  setUser: (user: User | null) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token')
      if (token) {
        try {
          const response = await authApi.me()
          if (response.code === 0 && response.data) {
            setUser(response.data)
          } else {
            localStorage.removeItem('token')
          }
        } catch (error) {
          localStorage.removeItem('token')
        }
      }
      setIsLoading(false)
    }
    initAuth()
  }, [])

  const login = async (username: string, password: string) => {
    const response = await authApi.login({ username, password })
    if (response.code === 0 && response.data) {
      localStorage.setItem('token', response.data.token)
      localStorage.setItem('user', JSON.stringify(response.data.user))
      setUser(response.data.user)
    } else {
      throw new Error(response.message || '登录失败')
    }
  }

  const register = async (username: string, password: string, nickname?: string, teacherCode?: string) => {
    const response = await authApi.register({ username, password, nickname, teacherCode })
    if (response.code === 0 && response.data) {
      localStorage.setItem('token', response.data.token)
      localStorage.setItem('user', JSON.stringify(response.data.user))
      setUser(response.data.user)
    } else {
      throw new Error(response.message || '注册失败')
    }
  }

  const loginWithToken = (token: string, userData: User) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      register,
      loginWithToken,
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
