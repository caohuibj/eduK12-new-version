import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger'
import { buildDatabaseUrl } from './databasePool'
import { recordPrismaCall, recordPrismaError } from '../services/runtimeObservability'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaObservabilityClient?: PrismaClient
}

// 连接池配置 - 运行时把环境变量合并进 Prisma datasource URL。
// 已显式配置在 DATABASE_URL 中的参数优先，避免部署脚本被静默覆盖。
export { buildDatabaseUrl } from './databasePool'

const databaseUrl = buildDatabaseUrl(process.env.DATABASE_URL)
const prismaConfig = {
  log: process.env.NODE_ENV === 'development' 
    ? ([{ level: 'query', emit: 'stdout' }, { level: 'error', emit: 'stdout' }, { level: 'warn', emit: 'stdout' }] as const)
    : ([{ level: 'error', emit: 'stdout' }] as const),
  ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient(prismaConfig as any)

if (globalForPrisma.prismaObservabilityClient !== prisma) {
  prisma.$use(async (params, next) => {
    const startedAt = process.hrtime.bigint()
    try {
      return await next(params)
    } catch (error: any) {
      recordPrismaError(error?.code)
      recordPrismaError(error?.meta?.code)
      throw error
    } finally {
      recordPrismaCall(params.model, params.action, Number(process.hrtime.bigint() - startedAt) / 1_000_000)
    }
  })
  globalForPrisma.prismaObservabilityClient = prisma
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// 连接池监控
if (process.env.NODE_ENV === 'production') {
  setInterval(async () => {
    try {
      // 简单健康检查
      await prisma.$queryRaw`SELECT 1`
    } catch (err) {
      logger.error('[Prisma] 连接池健康检查失败', err)
    }
  }, 30000) // 每30秒检查一次
}
