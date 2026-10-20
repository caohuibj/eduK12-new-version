import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { isValidPassword } from '../../src/utils/password'

/** Legacy fixture identity only. System authority uses the operator-only CLI. */
export async function seedAdmin(prisma: PrismaClient): Promise<string> {
  const existingAdmin = await prisma.user.findFirst({ where: { role: UserRole.ADMIN } })
  if (existingAdmin) {
    // ADMIN -> SYSTEM_ADMIN is a one-time migration compatibility backfill.
    // Never repeat that inference here: an explicit later platform demotion
    // must survive every subsequent seed run.
    console.log('管理员账号已存在，跳过创建')
    return existingAdmin.id
  }

  const adminUsername = process.env.ADMIN_USERNAME?.trim()
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminUsername || !adminPassword) {
    throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD must be set before creating the initial administrator')
  }
  if (!isValidPassword(adminPassword)) {
    throw new Error('ADMIN_PASSWORD must be 8-128 characters and contain both letters and numbers')
  }

  const admin = await prisma.user.create({
    data: {
      username: adminUsername,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: UserRole.ADMIN,
      platformRole: 'STANDARD',
      nickname: '待授权管理账号',
    },
  })

  console.log('旧版管理身份已创建；无系统或入口管理权限，需受控授权:')
  console.log(`  用户名: ${admin.username}`)
  console.log('  密码: 已从受保护的部署环境读取（不会写入日志）')
  return admin.id
}
