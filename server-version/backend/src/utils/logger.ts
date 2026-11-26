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

const SENSITIVE_KEY = /(authorization|password|secret|token|credential|start[_-]?intent|cookie|set-cookie|answer|score|feedback|content|rawbody|body|message|query|sql|error|err)/i
const SENSITIVE_TEXT = /(Bearer\s+)[^\s,}]+|((?:token|password|secret|code|sessionId|resumeToken|authorization)=)[^&\s,}]+/gi

const redactText = (value: string): string => value
  .replace(SENSITIVE_TEXT, (_match, bearerPrefix, keyPrefix) => `${bearerPrefix || keyPrefix}[REDACTED]`)
  .replace(/((?:["']?start[_-]?intent["']?)\s*[:=]\s*["']?)[A-Za-z0-9_-]+/gi, '$1[REDACTED]')

const redactStack = (error: Error): string | undefined => {
  // V8 prefixes the frames with the entire message, which may span many lines.
  const header = Error.prototype.toString.call(error) + '\n'
  const stack = error.stack
  if (typeof stack !== 'string' || !stack.startsWith(header)) return undefined
  return stack.slice(header.length).split('\n')
    .filter(line => /^\s+at /.test(line))
    .map(redactText)
    .join('\n')
}

const redactLogValue = (value: unknown, key?: string): unknown => {
  if (value instanceof Error) {
    return {
      name: value.constructor?.name || 'Error',
      // Error messages can contain database values or request input.  Keep
      // the class and sanitized stack for server-side diagnosis, never the
      // raw message.
      message: '[REDACTED]',
      stack: redactStack(value),
    }
  }
  if (key && SENSITIVE_KEY.test(key)) return '[REDACTED]'
  if (typeof value === 'string') return redactText(value)
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
      console.debug(`[${formatTime()}] [DEBUG] ${redactText(message)}`, ...safeArgs(args))
    }
  },

  info: (message: string, ...args: unknown[]) => {
    if (currentLevel <= LogLevel.INFO) {
      console.info(`[${formatTime()}] [INFO] ${redactText(message)}`, ...safeArgs(args))
    }
  },

  warn: (message: string, ...args: unknown[]) => {
    if (currentLevel <= LogLevel.WARN) {
      console.warn(`[${formatTime()}] [WARN] ${redactText(message)}`, ...safeArgs(args))
    }
  },

  error: (message: string, error?: unknown) => {
    if (currentLevel <= LogLevel.ERROR) {
      console.error(`[${formatTime()}] [ERROR] ${redactText(message)}`, redactLogValue(error))
    }
  },
}
