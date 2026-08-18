/**
 * 课堂 Socket.IO 连接管理 Hook
 * 
 * 功能：
 * - Socket.IO 连接管理
 * - 断线重连
 * - 事件监听
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

interface UseClassroomSocketOptions {
  classroomId: string
  role: 'teacher' | 'student' | 'bigscreen'
  userId?: string
  studentId?: string
  autoConnect?: boolean
}

interface SocketEvents {
  // 教师端事件
  'teacher:joined'?: (data: any) => void
  'broadcast:stats'?: (data: any) => void
  'broadcast:online'?: (data: any) => void

  // 学生端事件
  'student:joined'?: (data: any) => void
  'student:submitted'?: (data: any) => void
  'broadcast:question'?: (data: any) => void
  'broadcast:finished'?: (data: any) => void
  'broadcast:next'?: (data: any) => void
  'broadcast:closed'?: (data: any) => void

  // 大屏端事件
  'bigscreen:joined'?: (data: any) => void

  // 错误事件
  error?: (data: any) => void
}

export function useClassroomSocket(options: UseClassroomSocketOptions) {
  const { classroomId, role, userId, studentId, autoConnect = true } = options

  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const socketRef = useRef<Socket | null>(null)

  // 连接 Socket
  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return
    }

    // 使用当前域名，不添加 /api 前缀
    const socketUrl = window.location.origin

    socketRef.current = io(`${socketUrl}/classroom`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })

    const socket = socketRef.current

    // 连接成功
    socket.on('connect', () => {
      setIsConnected(true)
      setError(null)

      // 根据角色加入课堂
      if (role === 'teacher') {
        socket.emit('teacher:join', { classroomId, role, userId })
      } else if (role === 'student') {
        socket.emit('student:join', { classroomId, role, studentId })
      } else if (role === 'bigscreen') {
        socket.emit('bigscreen:join', { classroomId, role })
      }
    })

    // 连接错误
    socket.on('connect_error', (err) => {
      setError(`连接失败: ${err.message}`)
      setIsConnected(false)
    })

    // 断开连接
    socket.on('disconnect', (reason) => {
      setIsConnected(false)
      if (reason === 'io server disconnect') {
        // 服务器主动断开，需要手动重连
        socket.connect()
      }
    })

    // 错误处理
    socket.on('error', (data) => {
      setError(data.message || '发生错误')
    })
  }, [classroomId, role, userId, studentId])

  // 断开连接
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      if (role === 'student') {
        socketRef.current.emit('student:leave', { classroomId })
      }
      socketRef.current.disconnect()
      socketRef.current = null
      setIsConnected(false)
    }
  }, [classroomId, role])

  // 监听事件
  const on = useCallback(<K extends keyof SocketEvents>(event: K, handler: SocketEvents[K]) => {
    if (socketRef.current) {
      socketRef.current.on(event, handler as any)
    }
  }, [])

  // 取消监听
  const off = useCallback(<K extends keyof SocketEvents>(event: K, handler?: SocketEvents[K]) => {
    if (socketRef.current) {
      socketRef.current.off(event, handler as any)
    }
  }, [])

  // 发送事件
  const emit = useCallback((event: string, data: any) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit(event, data)
    } else {
      console.warn(`无法发送事件 "${event}"：socket 未连接`)
    }
  }, [isConnected])

  // 自动连接
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
