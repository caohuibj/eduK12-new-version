/**
 * Socket.IO 服务
 *
 * Classroom sockets use server-derived authentication and resource context.
 * Anonymous connections are accepted only so the student code-join flow can
 * establish a restricted student session.
 */

import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'
import { logger } from '../utils/logger'
import { getRedisUrl } from '../config/redis'
import { config } from '../config'
import { verifyToken } from '../utils/jwt'
import { prisma } from '../config/database'
import { inactiveAccountMessage } from '../utils/accountStatus'
import { UserRole } from '../types'
import { getCookieValue } from '../utils/authCookies'

type SocketNext = (error?: Error) => void

const getSocketToken = (socket: Socket): string | null => {
  const cookieToken = getCookieValue(socket.handshake.headers.cookie, 'ptool_session')
  return cookieToken
}

export class SocketService {
  private io: Server | null = null
  private classroomNamespace: any = null
  private redisClient: any = null
  private redisSubscriber: any = null

  /**
   * 初始化 Socket.IO 服务器
   */
  async initialize(server: HttpServer): Promise<void> {
    const MAX_CONNECTIONS = parseInt(process.env.MAX_SOCKET_CONNECTIONS || '10000')

    this.io = new Server(server, {
      cors: {
        origin: config.corsOrigin,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      maxHttpBufferSize: 1e6,
    })

    this.classroomNamespace = this.io.of('/classroom')

    // 配置 Redis Adapter（支持 PM2 集群模式）。连接串不得写入日志。
    try {
      const redisUrl = getRedisUrl()

      this.redisClient = createClient({ url: redisUrl })
      this.redisSubscriber = createClient({ url: redisUrl })

      await this.redisClient.connect()
      await this.redisSubscriber.connect()

      this.io.adapter(createAdapter(this.redisClient, this.redisSubscriber))

      logger.info('Redis Adapter 已配置 - 支持 PM2 集群模式')
    } catch {
      logger.error('Redis Adapter 配置失败，回退到单进程模式')
    }

    // 连接数限制和 Socket JWT 认证中间件
    this.classroomNamespace.use(async (socket: Socket, next: SocketNext) => {
      try {
        const connectedClients = this.classroomNamespace.sockets.size
        if (connectedClients >= MAX_CONNECTIONS) {
          logger.warn('Socket连接数达到上限', {
            connectedClients,
            maxConnections: MAX_CONNECTIONS,
          })
          return next(new Error('服务器连接数已达上限，请稍后重试'))
        }

        const token = getSocketToken(socket)
        socket.data.authenticated = false

        if (token) {
          const payload = verifyToken(token)
          if (
            !payload ||
            typeof payload.userId !== 'string' ||
            !Number.isInteger(payload.tokenVersion)
          ) {
            return next(new Error('Socket认证失败'))
          }

          const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: {
              id: true,
              role: true,
              isActive: true,
              isFrozen: true,
              expiresAt: true,
              teacherApproved: true,
              tokenVersion: true,
              mustChangePassword: true,
            },
          })

          const rejection = inactiveAccountMessage(user)
          if (rejection) {
            return next(new Error(rejection))
          }

          if (payload.tokenVersion !== user!.tokenVersion) {
            return next(new Error('Socket认证令牌已失效'))
          }

          if (user!.mustChangePassword) {
            return next(new Error('首次登录必须先修改密码'))
          }

          socket.data.authenticated = true
          socket.data.userId = user!.id
          socket.data.tokenVersion = payload.tokenVersion
          // Always use the current database role, never the JWT role or a
          // client-supplied role.
          socket.data.userRole = user!.role
        }

        logger.debug('Socket连接认证完成', {
          authenticated: socket.data.authenticated,
        })
        return next()
      } catch {
        return next(new Error('Socket认证失败'))
      }
    })

    logger.info('Socket.IO 服务已初始化')
    logger.info('课堂命名空间: /classroom')
    logger.info('Socket最大连接数限制已启用')
  }

  /**
   * Re-check the account behind an already-connected privileged socket.
   * Handshake authentication is not enough because an administrator can
   * freeze, deactivate, expire, or change the role of an account while the
   * socket remains open.
   */
  async refreshAuthenticatedSocket(socket: Socket): Promise<boolean> {
    if (
      socket.data.authenticated !== true ||
      typeof socket.data.userId !== 'string'
    ) {
      return false
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: socket.data.userId },
        select: {
          id: true,
          role: true,
          isActive: true,
          isFrozen: true,
          expiresAt: true,
          teacherApproved: true,
          tokenVersion: true,
          mustChangePassword: true,
        },
      })

      if (
        !user ||
        inactiveAccountMessage(user) ||
        user.mustChangePassword ||
        user.tokenVersion !== socket.data.tokenVersion
      ) {
        socket.data.authenticated = false
        socket.data.userId = undefined
        socket.data.userRole = undefined
        socket.data.tokenVersion = undefined
        return false
      }

      socket.data.userRole = user.role
      return true
    } catch {
      // Fail closed if the account cannot be revalidated.
      socket.data.authenticated = false
      socket.data.userId = undefined
      socket.data.userRole = undefined
      socket.data.tokenVersion = undefined
      return false
    }
  }

  /**
   * Revalidate every manager socket in a room before sensitive manager-only
   * data is broadcast. fetchSockets also covers sockets connected to another
   * process when the Redis adapter is active.
   */
  async revalidateManagerSockets(room: string): Promise<boolean> {
    if (!this.classroomNamespace) {
      return false
    }

    try {
      const sockets = await this.classroomNamespace.in(room).fetchSockets()
      await Promise.all(
        sockets.map(async (socket: any) => {
          const valid = await this.refreshAuthenticatedSocket(socket as Socket)
          const managerRole =
            socket.data.userRole === UserRole.ADMIN ||
            socket.data.userRole === UserRole.TEACHER

          if (!valid || !managerRole) {
            socket.disconnect(true)
          }
        })
      )
      return true
    } catch {
      // Do not send manager-only data when the room cannot be revalidated.
      logger.error('课堂 manager Socket 撤权校验失败')
      return false
    }
  }

  /**
   * 获取课堂命名空间
   */
  getClassroomNamespace(): any {
    if (!this.classroomNamespace) {
      throw new Error('Socket.IO 服务未初始化')
    }
    return this.classroomNamespace
  }

  /**
   * 获取 Socket.IO 服务器实例
   */
  getIO(): Server {
    if (!this.io) {
      throw new Error('Socket.IO 服务未初始化')
    }
    return this.io
  }

  /**
   * 关闭 Socket.IO 服务器
   */
  async close(): Promise<void> {
    try {
      if (this.redisClient) {
        await this.redisClient.quit()
        logger.info('Redis 客户端已关闭')
      }
      if (this.redisSubscriber) {
        await this.redisSubscriber.quit()
        logger.info('Redis 订阅者已关闭')
      }

      if (this.io) {
        await new Promise<void>((resolve) => {
          this.io!.close(() => {
            logger.info('Socket.IO 服务已关闭')
            resolve()
          })
        })
      }
    } catch {
      logger.error('关闭 Socket.IO 服务错误')
    }
  }

  /**
   * 获取房间内的所有 Socket ID
   */
  async getSocketsInRoom(room: string): Promise<string[]> {
    if (!this.classroomNamespace) {
      return []
    }

    const sockets = await this.classroomNamespace.in(room).fetchSockets()
    return sockets.map((socket: Socket) => socket.id)
  }

  /**
   * 获取房间内的连接数
   */
  async getRoomConnectionCount(room: string): Promise<number> {
    const sockets = await this.getSocketsInRoom(room)
    return sockets.length
  }

  /**
   * 向房间广播消息
   */
  broadcastToRoom(room: string, event: string, data: any): void {
    if (!this.classroomNamespace) {
      logger.error('课堂命名空间未初始化')
      return
    }

    this.classroomNamespace.to(room).emit(event, data)
    // Do not include payloads: question content and answers can be sensitive.
    logger.debug('课堂房间广播完成', { room, event })
  }

  /**
   * 向特定 Socket 发送消息
   */
  sendToSocket(socketId: string, event: string, data: any): void {
    if (!this.classroomNamespace) {
      logger.error('课堂命名空间未初始化')
      return
    }

    this.classroomNamespace.to(socketId).emit(event, data)
    logger.debug('课堂 Socket 消息发送完成', { event })
  }
}

export const socketService = new SocketService()
