import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function seedAdmin() {
  // 检查是否已有管理员账号
  const existingAdmin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN }
  })

  if (existingAdmin) {
    console.log('管理员账号已存在，跳过创建')
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

// D1 基础：幂等写入 fake Cognitive 配置 v1（PUBLISHED）。
// 不参与任何加密；仅作为 D2 scorer/registry 后续引用的已发布配置。
async function seedFakeCognitiveConfig() {
  const result = await prisma.cognitiveTestConfig.upsert({
    where: { testType_configVersion: { testType: 'fake', configVersion: '1.0.0' } },
    create: {
      testType: 'fake',
      configVersion: '1.0.0',
      name: 'Fake Cognitive Test v1.0.0',
      status: 'PUBLISHED',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      config: {
        trialCount: 3,
        trialDurationMs: 1000,
        allowPractice: false,
        maxRtMs: 60000,
      },
    },
    update: {
      name: 'Fake Cognitive Test v1.0.0',
      status: 'PUBLISHED',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      config: {
        trialCount: 3,
        trialDurationMs: 1000,
        allowPractice: false,
        maxRtMs: 60000,
      },
    },
  })
  console.log(`Fake Cognitive 配置已就绪: testType=${result.testType} configVersion=${result.configVersion} status=${result.status}`)
}

async function main() {
  console.log('开始初始化数据库...')
  await seedAdmin()
  await seedFakeCognitiveConfig()
  console.log('数据库初始化完成。')
}

main()
  .catch((e) => {
    console.error('初始化失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
