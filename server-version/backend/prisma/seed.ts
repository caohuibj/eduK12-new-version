import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { seedCognitiveConfigs } from '../src/bootstrap/cognitive'

const prisma = new PrismaClient()

async function seedAdmin() {
  const existingAdmin = await prisma.user.findFirst({ where: { role: UserRole.ADMIN } })
  if (existingAdmin) {
    console.log('管理员账号已存在，跳过创建')
    return
  }

  const adminUsername = process.env.ADMIN_USERNAME
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminUsername || !adminPassword) {
    throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD must be set before running the database seed')
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10)
  const admin = await prisma.user.create({
    data: {
      username: adminUsername,
      passwordHash: hashedPassword,
      role: UserRole.ADMIN,
      nickname: '系统管理员',
    },
  })

  console.log(`默认管理员账号创建成功: ${admin.username}`)
}

async function main() {
  console.log('开始初始化数据库...')
  await seedAdmin()
  await seedCognitiveConfigs(prisma)
  console.log('数据库初始化完成。')
}

main()
  .catch((error) => {
    console.error('初始化失败:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
