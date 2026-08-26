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

const SENSITIVE_KEY = /(authorization|password|secret|token|credential|cookie|set-cookie|answer|score|feedback|content|rawbody|body|message|query|sql)/i
const SENSITIVE_TEXT = /(Bearer\s+)[^\s,}]+/gi

const redactText = (value: string): string => value.replace(SENSITIVE_TEXT, '$1[REDACTED]')

const redactLogValue = (value: unknown, key?: string): unknown => {
  if (key && SENSITIVE_KEY.test(key)) return '[REDACTED]'
  if (typeof value === 'string') return redactText(value)
  if (value instanceof Error) {
    return {
      name: value.name,
      // Error messages can contain database values or request input.  Keep
      // the class and sanitized stack for server-side diagnosis, never the
      // raw message.
      message: '[REDACTED]',
      stack: value.stack ? redactText(value.stack) : undefined,
    }
  }
  if (Array.isArray(value)) return value.map((item) => redactLogValue(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactLogValue(entryValue, entryKey),
      ])
    )
  }
  return value
}

const safeArgs = (args: unknown[]) => args.map((arg) => redactLogValue(arg))

export const logger = {
  debug: (message: string, ...args: unknown[]) => {
    if (currentLevel <= LogLevel.DEBUG) {
      console.debug(`[${formatTime()}] [DEBUG] ${message}`, ...safeArgs(args))
    }
  },

  info: (message: string, ...args: unknown[]) => {
    if (currentLevel <= LogLevel.INFO) {
      console.info(`[${formatTime()}] [INFO] ${message}`, ...safeArgs(args))
    }
  },

  warn: (message: string, ...args: unknown[]) => {
    if (currentLevel <= LogLevel.WARN) {
      console.warn(`[${formatTime()}] [WARN] ${message}`, ...safeArgs(args))
    }
  },

  error: (message: string, error?: unknown) => {
    if (currentLevel <= LogLevel.ERROR) {
      console.error(`[${formatTime()}] [ERROR] ${message}`, redactLogValue(error))
    }
  },
}
