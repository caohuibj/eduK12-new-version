/**
 * 匿名打卡安全测试
 * 
 * 测试项：
 * 1. 令牌防伪造
 * 2. 过期检测
 * 3. 访问限制
 * 4. 防重复提交
 */

import { checkinTokenService } from '../../services/checkinTokenService'
import { prisma } from '../../config/database'

describe('匿名打卡安全机制测试', () => {
  let testCheckinId: string
  let testUserId: string

  beforeAll(async () => {
    // 创建测试用户
    const user = await prisma.user.create({
      data: {
        username: 'security_test_user',
        passwordHash: 'test_hash',
        role: 'TEACHER',
      },
    })
    testUserId = user.id

    // 创建测试课程
    const course = await prisma.course.create({
      data: {
        title: '安全测试课程',
        courseCode: 'SECURITY_TEST_COURSE',
        creatorId: testUserId,
        status: 'PUBLISHED',
      },
    })

    // 创建测试打卡（允许匿名）
    const checkin = await prisma.checkin.create({
      data: {
        title: '安全测试打卡',
        courseId: course.id,
        creatorId: testUserId,
        allowAnonymous: true,
      },
    })
    testCheckinId = checkin.id
  })

  afterAll(async () => {
    // 清理测试数据
    await prisma.checkinAccessToken.deleteMany({
      where: { checkinId: testCheckinId },
    })
    
    await prisma.checkinSubmission.deleteMany({
      where: { checkinId: testCheckinId },
    })
    
    await prisma.checkin.deleteMany({
      where: { id: testCheckinId },
    })
    
    const course = await prisma.course.findFirst({
      where: { courseCode: 'SECURITY_TEST_COURSE' },
    })
    if (course) {
      await prisma.course.delete({ where: { id: course.id } })
    }
    
    await prisma.user.delete({ where: { id: testUserId } })
    
    await prisma.$disconnect()
  })

  describe('1. 令牌防伪造测试', () => {
    it('令牌应使用安全的随机字符集', () => {
      const token = checkinTokenService.generateToken()
      
      // 令牌应以 'ck_' 开头
      expect(token.startsWith('ck_')).toBe(true)
      
      // 提取随机部分
      const randomPart = token.substring(3)
      
      // 应该只包含安全字符集（排除容易混淆的字符：0, O, l, I, 1）
      const safeCharPattern = /^[a-hj-km-np-z2-9]+$/
      expect(safeCharPattern.test(randomPart)).toBe(true)
    })

    it('令牌应具有足够的随机性（熵值）', () => {
      // 16位字符，每位36种可能（排除4个易混淆字符）
      // 熵值 = 16 * log2(32) ≈ 80 bits
      const tokens = new Set<string>()
      const sampleSize = 10000
      
      for (let i = 0; i < sampleSize; i++) {
        tokens.add(checkinTokenService.generateToken())
      }
      
      // 所有令牌应唯一
      expect(tokens.size).toBe(sampleSize)
    })

    it('无效令牌格式应被拒绝', async () => {
      const invalidTokens = [
        'invalid_token',
        'ck_short',
        'ck_12345678901234', // 包含易混淆字符
        'ck_ABCDEFGHIJKLMNO', // 包含大写字母（不在字符集中）
        '',
        'ck_' + 'a'.repeat(15), // 长度不足
        'ck_' + 'a'.repeat(17), // 长度超长
      ]

      for (const token of invalidTokens) {
        const validation = await checkinTokenService.validateToken(token)
        expect(validation.valid).toBe(false)
      }
    })
  })

  describe('2. 过期检测测试', () => {
    it('过期令牌应被拒绝', async () => {
      // 创建一个已过期的令牌
      const expiredDate = new Date(Date.now() - 1000) // 1秒前过期
      const tokenData = await checkinTokenService.createToken({
        checkinId: testCheckinId,
        createdBy: testUserId,
        expiresAt: expiredDate,
      })

      const validation = await checkinTokenService.validateToken(tokenData.token)
      
      expect(validation.valid).toBe(false)
      expect(validation.expired).toBe(true)
    })

    it('即将过期的令牌应该仍然有效', async () => {
      // 创建一个1秒后过期的令牌
      const expiresSoon = new Date(Date.now() + 1000)
      const tokenData = await checkinTokenService.createToken({
        checkinId: testCheckinId,
        createdBy: testUserId,
        expiresAt: expiresSoon,
      })

      const validation = await checkinTokenService.validateToken(tokenData.token)
      
      expect(validation.valid).toBe(true)
    })

    it('长期有效的令牌应该正常工作', async () => {
      // 创建一个30天后过期的令牌
      const expiresFar = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      const tokenData = await checkinTokenService.createToken({
        checkinId: testCheckinId,
        createdBy: testUserId,
        expiresAt: expiresFar,
      })

      const validation = await checkinTokenService.validateToken(tokenData.token)
      
      expect(validation.valid).toBe(true)
    })
  })

  describe('3. 访问限制测试', () => {
    it('无限制令牌（maxUses=0）应可无限访问', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const tokenData = await checkinTokenService.createToken({
        checkinId: testCheckinId,
        createdBy: testUserId,
        expiresAt,
        maxUses: 0, // 无限制
      })

      // 访问10次
      for (let i = 0; i < 10; i++) {
        await checkinTokenService.recordAccess(tokenData.id)
      }

      // 仍然应该有效
      const validation = await checkinTokenService.validateToken(tokenData.token)
      expect(validation.valid).toBe(true)
    })

    it('有限制令牌应正确限制访问次数', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const tokenData = await checkinTokenService.createToken({
        checkinId: testCheckinId,
        createdBy: testUserId,
        expiresAt,
        maxUses: 5,
      })

      // 访问4次（应该有效）
      for (let i = 0; i < 4; i++) {
        await checkinTokenService.recordAccess(tokenData.id)
      }

      let validation = await checkinTokenService.validateToken(tokenData.token)
      expect(validation.valid).toBe(true)

      // 第5次访问（达到限制）
      await checkinTokenService.recordAccess(tokenData.id)

      validation = await checkinTokenService.validateToken(tokenData.token)
      expect(validation.valid).toBe(false)
      expect(validation.overLimit).toBe(true)
    })

    it('禁用的令牌应被拒绝', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const tokenData = await checkinTokenService.createToken({
        checkinId: testCheckinId,
        createdBy: testUserId,
        expiresAt,
      })

      // 禁用令牌
      await checkinTokenService.disableToken(tokenData.id)

      const validation = await checkinTokenService.validateToken(tokenData.token)
      expect(validation.valid).toBe(false)
      expect(validation.disabled).toBe(true)
    })
  })

  describe('4. 防重复提交测试', () => {
    it('相同会话ID应无法重复提交', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const tokenData = await checkinTokenService.createToken({
        checkinId: testCheckinId,
        createdBy: testUserId,
        expiresAt,
      })

      const sessionId = checkinTokenService.generateSessionId()

      // 第一次提交
      const submission1 = await prisma.checkinSubmission.create({
        data: {
          checkinId: testCheckinId,
          studentId: null,
          content: '第一次提交',
          sessionId,
          tokenId: tokenData.id,
          isAnonymous: true,
        },
      })

      expect(submission1).toBeDefined()

      // 尝试用相同会话ID再次提交
      try {
        await prisma.checkinSubmission.create({
          data: {
            checkinId: testCheckinId,
            studentId: null,
            content: '第二次提交',
            sessionId, // 相同的会话ID
            tokenId: tokenData.id,
            isAnonymous: true,
          },
        })
        // 如果没有抛出错误，说明测试失败
        fail('应该抛出唯一约束错误')
      } catch (error: any) {
        // 应该是唯一约束错误
        expect(error.code).toBe('P2002')
        expect(error.meta?.target).toEqual(expect.arrayContaining(['checkin_id', 'session_id']))
      }
    })

    it('不同会话ID应可以分别提交', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const tokenData = await checkinTokenService.createToken({
        checkinId: testCheckinId,
        createdBy: testUserId,
        expiresAt,
        maxUses: 0, // 无限制
      })

      const sessionId1 = checkinTokenService.generateSessionId()
      const sessionId2 = checkinTokenService.generateSessionId()

      // 两个不同的会话应该可以分别提交
      const submission1 = await prisma.checkinSubmission.create({
        data: {
          checkinId: testCheckinId,
          studentId: null,
          content: '会话1提交',
          sessionId: sessionId1,
          tokenId: tokenData.id,
          isAnonymous: true,
        },
      })

      const submission2 = await prisma.checkinSubmission.create({
        data: {
          checkinId: testCheckinId,
          studentId: null,
          content: '会话2提交',
          sessionId: sessionId2,
          tokenId: tokenData.id,
          isAnonymous: true,
        },
      })

      expect(submission1).toBeDefined()
      expect(submission2).toBeDefined()
      expect(submission1.id).not.toBe(submission2.id)
    })

    it('会话ID应具有足够的随机性', () => {
      const sessionIds = new Set<string>()
      const sampleSize = 10000
      
      for (let i = 0; i < sampleSize; i++) {
        sessionIds.add(checkinTokenService.generateSessionId())
      }
      
      // 所有会话ID应唯一
      expect(sessionIds.size).toBe(sampleSize)
      
      // 验证格式
      for (const sessionId of sessionIds) {
        expect(sessionId.startsWith('session_')).toBe(true)
        expect(sessionId.length).toBe(24) // 'session_' (8) + 16位随机字符
      }
    })
  })

  describe('5. 综合安全测试', () => {
    it('未开启匿名打卡的打卡项应拒绝令牌访问', async () => {
      // 创建不允许匿名的打卡
      const normalCheckin = await prisma.checkin.create({
        data: {
          title: '普通打卡',
          courseId: (await prisma.course.findFirst({
            where: { creatorId: testUserId },
          }))!.id,
          creatorId: testUserId,
          allowAnonymous: false, // 不允许匿名
        },
      })

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      
      // 尝试创建令牌应该失败（在控制器层会检查，这里测试数据库约束）
      const tokenData = await checkinTokenService.createToken({
        checkinId: normalCheckin.id,
        createdBy: testUserId,
        expiresAt,
      })

      // 验证令牌时应该失败
      const validation = await checkinTokenService.validateToken(tokenData.token)
      expect(validation.valid).toBe(false)

      // 清理
      await prisma.checkinAccessToken.delete({
        where: { id: tokenData.id },
      })
      await prisma.checkin.delete({
        where: { id: normalCheckin.id },
      })
    })
  })
})
