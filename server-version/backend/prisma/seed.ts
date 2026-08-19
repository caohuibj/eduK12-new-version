import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('开始初始化数据库...')

  // 检查是否已有管理员账号
  const existingAdmin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN }
  })

  if (existingAdmin) {
    console.log('管理员账号已存在，跳过初始化')
    return
  }

  // 创建默认管理员账号（凭据优先来自环境变量，便于不同部署定制）
  const adminUsername = process.env.ADMIN_USERNAME || 'rateK12admin'
  const adminPassword = process.env.ADMIN_PASSWORD || '2026coding'
  const hashedPassword = await bcrypt.hash(adminPassword, 10)

  const admin = await prisma.user.create({
    data: {
      username: adminUsername,
      passwordHash: hashedPassword,
      role: UserRole.ADMIN,
      nickname: '系统管理员',
    }
  })

  console.log('默认管理员账号创建成功:')
  console.log(`  用户名: ${admin.username}`)
  console.log(`  密码: ${adminPassword}`)
}

main()
  .catch((e) => {
    console.error('初始化失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
