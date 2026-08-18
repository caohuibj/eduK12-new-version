import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// 连接池配置 - 2C4G服务器优化
// 通过 PRISMA_CONNECTION_POOL_SIZE 环境变量设置连接池大小
const prismaConfig = {
  log: process.env.NODE_ENV === 'development' 
    ? ([{ level: 'query', emit: 'stdout' }, { level: 'error', emit: 'stdout' }, { level: 'warn', emit: 'stdout' }] as const)
    : ([{ level: 'error', emit: 'stdout' }] as const),
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient(prismaConfig as any)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// 连接池监控
if (process.env.NODE_ENV === 'production') {
  setInterval(async () => {
    try {
      // 简单健康检查
      await prisma.$queryRaw`SELECT 1`
    } catch (err) {
      console.error('[Prisma] 连接池健康检查失败:', err)
    }
  }, 30000) // 每30秒检查一次
}
