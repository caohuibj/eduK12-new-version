/**
 * 统一日志工具
 * 支持不同级别日志，便于后期接入日志收集系统
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// 根据环境设置日志级别
const currentLevel = process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG :
                     process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.INFO

// 格式化时间
const formatTime = () => {
  return new Date().toISOString()
}

export const logger = {
  debug: (message: string, ...args: any[]) => {
    if (currentLevel <= LogLevel.DEBUG) {
      console.debug(`[${formatTime()}] [DEBUG] ${message}`, ...args)
    }
  },

  info: (message: string, ...args: any[]) => {
    if (currentLevel <= LogLevel.INFO) {
      console.info(`[${formatTime()}] [INFO] ${message}`, ...args)
    }
  },

  warn: (message: string, ...args: any[]) => {
    if (currentLevel <= LogLevel.WARN) {
      console.warn(`[${formatTime()}] [WARN] ${message}`, ...args)
    }
  },

  error: (message: string, error?: any) => {
    if (currentLevel <= LogLevel.ERROR) {
      console.error(`[${formatTime()}] [ERROR] ${message}`, error)
    }
  },
}
