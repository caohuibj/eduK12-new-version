/**
 * Socket.IO 服务
 * 
 * 功能：
 * - Socket.IO 服务器初始化
 * - 命名空间管理
 * - 房间管理
 * - 连接管理
 * - Redis Adapter 支持集群模式
 */

import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'
import { logger } from '../utils/logger'
import { getRedisUrl } from '../config/redis'
import { config } from '../config'

export class SocketService {
  private io: Server | null = null
  private classroomNamespace: any = null
  private redisClient: any = null
  private redisSubscriber: any = null

  /**
   * 初始化 Socket.IO 服务器
   */
  async initialize(server: HttpServer): Promise<void> {
    // 最大连接数限制
    const MAX_CONNECTIONS = parseInt(process.env.MAX_SOCKET_CONNECTIONS || '10000')
    
    this.io = new Server(server, {
      cors: {
        origin: config.corsOrigin,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000, // 60 秒
      pingInterval: 25000, // 25 秒
      maxHttpBufferSize: 1e6, // 限制消息大小 1MB
    })

    // 创建课堂命名空间
    this.classroomNamespace = this.io.of('/classroom')

    // 配置 Redis Adapter（支持 PM2 集群模式）
    try {
      const redisUrl = getRedisUrl()

      this.redisClient = createClient({ url: redisUrl })
      this.redisSubscriber = createClient({ url: redisUrl })
      
      await this.redisClient.connect()
      await this.redisSubscriber.connect()
      
      this.io.adapter(createAdapter(this.redisClient, this.redisSubscriber))
      
      logger.info('Redis Adapter 已配置 - 支持 PM2 集群模式')
      logger.info(`Redis 连接: ${redisUrl}`)
    } catch (error) {
      logger.error('Redis Adapter 配置失败，回退到单进程模式', error)
    }

    // 连接数限制中间件
    this.classroomNamespace.use((socket: Socket, next: (err?: Error) => void) => {
      const connectedClients = this.classroomNamespace.sockets.size
      
      if (connectedClients >= MAX_CONNECTIONS) {
        logger.warn(`Socket连接数达到上限: ${connectedClients}/${MAX_CONNECTIONS}`)
        return next(new Error('服务器连接数已达上限，请稍后重试'))
      }
      
      logger.info(`Socket连接: ${socket.id}, 当前连接数: ${connectedClients + 1}/${MAX_CONNECTIONS}`)
      next()
    })

    logger.info('Socket.IO 服务已初始化')
    logger.info('课堂命名空间: /classroom')
    logger.info(`最大连接数限制: ${MAX_CONNECTIONS}`)
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
      // 关闭 Redis 连接
      if (this.redisClient) {
        await this.redisClient.quit()
        logger.info('Redis 客户端已关闭')
      }
      if (this.redisSubscriber) {
        await this.redisSubscriber.quit()
        logger.info('Redis 订阅者已关闭')
      }
      
      // 关闭 Socket.IO
      if (this.io) {
        this.io.close(() => {
          logger.info('Socket.IO 服务已关闭')
        })
      }
    } catch (error) {
      logger.error('关闭 Socket.IO 服务错误', error)
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
    logger.debug(`广播消息到房间 ${room}`, { event, data })
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
    logger.debug(`发送消息到 Socket ${socketId}`, { event, data })
  }
}

// 单例模式
export const socketService = new SocketService()
