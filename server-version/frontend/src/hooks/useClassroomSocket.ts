/**
 * 课堂 Socket.IO 连接管理 Hook
 *
 * 身份只通过 Socket.IO handshake auth 中的 token 传递。课堂教师/大屏
 * 事件不再携带 userId、role、studentId 或 sessionId；学生匿名加入携带
 * 课堂码和可选的服务端签发 resume token，session 仍由服务器推导。
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

interface UseClassroomSocketOptions {
  classroomId?: string
  classroomCode?: string
  role: 'teacher' | 'student' | 'bigscreen'
  autoConnect?: boolean
}

interface SocketEvents {
  'teacher:joined'?: (data: any) => void
  'broadcast:stats'?: (data: any) => void
  'broadcast:online'?: (data: any) => void
  'student:joined'?: (data: any) => void
  'student:submitted'?: (data: any) => void
  'broadcast:question'?: (data: any) => void
  'broadcast:finished'?: (data: any) => void
  'broadcast:next'?: (data: any) => void
  'broadcast:closed'?: (data: any) => void
  'bigscreen:joined'?: (data: any) => void
  error?: (data: any) => void
}

const resumeTokenKey = (classroomCode?: string): string | null => {
  return classroomCode ? `classroom-resume-token:${classroomCode}` : null
}

const readResumeToken = (key: string | null): string | null => {
  if (!key) {
    return null
  }

  try {
    const token = window.localStorage.getItem(key)
    return token?.trim() || null
  } catch {
    return null
  }
}

const saveResumeToken = (key: string | null, token: unknown): void => {
  if (!key || typeof token !== 'string' || !token.trim()) {
    return
  }

  try {
    window.localStorage.setItem(key, token)
  } catch {
    // A storage-disabled browser can still participate for the current socket.
  }
}

const clearResumeToken = (key: string | null): void => {
  if (!key) {
    return
  }

  try {
    window.localStorage.removeItem(key)
  } catch {
    // Ignore storage failures; the server remains the source of truth.
  }
}

export function useClassroomSocket(options: UseClassroomSocketOptions) {
  const {
    classroomId,
    classroomCode,
    role,
    autoConnect = true,
  } = options

  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const socketRef = useRef<Socket | null>(null)

  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return
    }

    const socketUrl = window.location.origin
    const token = localStorage.getItem('token')
    const studentResumeKey = role === 'student' ? resumeTokenKey(classroomCode) : null

    socketRef.current = io(socketUrl + '/classroom', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      auth: token ? { token } : undefined,
    })

    const socket = socketRef.current

    socket.on('student:joined', (data) => {
      if (role === 'student') {
        saveResumeToken(studentResumeKey, data?.resumeToken)
      }
    })

    socket.on('connect', () => {
      setIsConnected(true)
      setError(null)

      if (role === 'teacher') {
        if (classroomId) {
          socket.emit('teacher:join', { classroomId })
        }
      } else if (role === 'student') {
        if (classroomCode) {
          const storedResumeToken = readResumeToken(studentResumeKey)
          socket.emit('student:join', {
            code: classroomCode,
            ...(storedResumeToken ? { resumeToken: storedResumeToken } : {}),
          })
        }
      } else if (role === 'bigscreen') {
        if (classroomId) {
          socket.emit('bigscreen:join', { classroomId })
        }
      }
    })

    socket.on('connect_error', (err) => {
      setError('连接失败: ' + err.message)
      setIsConnected(false)
    })

    socket.on('disconnect', (reason) => {
      setIsConnected(false)
      if (reason === 'io server disconnect') {
        socket.connect()
      }
    })

    socket.on('error', (data) => {
      if (role === 'student' && data?.message === '学生会话无效') {
        clearResumeToken(studentResumeKey)
      }
      setError(data?.message || '发生错误')
    })
  }, [classroomCode, classroomId, role])

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      if (role === 'student') {
        socketRef.current.emit('student:leave')
      }
      socketRef.current.disconnect()
      socketRef.current = null
      setIsConnected(false)
    }
  }, [role])

  const on = useCallback(<K extends keyof SocketEvents>(
    event: K,
    handler: SocketEvents[K]
  ) => {
    if (socketRef.current) {
      socketRef.current.on(event, handler as any)
    }
  }, [])

  const off = useCallback(<K extends keyof SocketEvents>(
    event: K,
    handler?: SocketEvents[K]
  ) => {
    if (socketRef.current) {
      socketRef.current.off(event, handler as any)
    }
  }, [])

  const emit = useCallback((event: string, data?: unknown) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit(event, data)
    } else {
      console.warn('无法发送事件 "' + event + '"：socket 未连接')
    }
  }, [isConnected])

  useEffect(() => {
    if (autoConnect) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [autoConnect, connect, disconnect])

  return {
    isConnected,
    error,
    connect,
    disconnect,
    on,
    off,
    emit,
    socket: socketRef.current,
  }
}
