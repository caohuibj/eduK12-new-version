import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { seedAdmin } from './seeds/users'
import { seedScalePackages } from './seeds/scales'
import { seedCognitiveConfigs } from './seeds/cognitive'

// `npm run db:seed` is also used directly by bare-metal deployment scripts,
// outside Prisma CLI's environment loading path.
dotenv.config()

const prisma = new PrismaClient()

async function main(): Promise<void> {
  console.log('开始初始化数据库...')
  const adminId = await seedAdmin(prisma)
  await seedScalePackages(prisma, adminId)
  await seedCognitiveConfigs(prisma)
  console.log('数据库初始化完成。')
}

main()
  .catch((error) => {
    console.error('初始化失败:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
