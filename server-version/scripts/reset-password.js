const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function resetPassword(username, newPassword) {
  try {
    // 查找用户
    const user = await prisma.user.findUnique({
      where: { username }
    })

    if (!user) {
      console.log(`❌ 用户 ${username} 不存在`)
      
      // 列出所有用户
      const users = await prisma.user.findMany({
        select: { username: true, role: true },
        orderBy: { createdAt: 'desc' }
      })
      console.log('\n现有用户列表:')
      users.forEach(u => console.log(`  - ${u.username} (${u.role})`))
      
      await prisma.$disconnect()
      return
    }

    // 生成新密码哈希
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    // 更新密码
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashedPassword }
    })

    console.log(`✅ 用户 ${username} 密码已重置为: ${newPassword}`)
    console.log(`   角色: ${user.role}`)
    console.log(`   昵称: ${user.nickname || '无'}`)
    
  } catch (error) {
    console.error('❌ 重置密码失败:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

// 从命令行获取参数
const username = process.argv[2] || 'rateK12admin'
const newPassword = process.argv[3] || 'admin123456'

resetPassword(username, newPassword)
