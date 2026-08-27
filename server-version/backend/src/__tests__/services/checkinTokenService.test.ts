/**
 * 打卡令牌服务测试
 */

import { checkinTokenService } from '../../services/checkinTokenService'
import { prisma } from '../../config/database'

describe('CheckinTokenService', () => {
  let testCheckinId: string
  let testUserId: string
  let testTokenId: string

  beforeAll(async () => {
    // 创建测试用户
    const user = await prisma.user.create({
      data: {
        username: 'test_checkin_token_user',
        passwordHash: 'test_hash',
        role: 'TEACHER',
      },
    })
    testUserId = user.id

    // 创建测试课程
    const course = await prisma.course.create({
      data: {
        title: '测试课程',
        courseCode: 'TEST_COURSE_TOKEN',
        creatorId: testUserId,
        status: 'PUBLISHED',
      },
    })

    // 创建测试打卡（允许匿名）
    const checkin = await prisma.checkin.create({
      data: {
        title: '测试打卡',
        courseId: course.id,
        creatorId: testUserId,
        allowAnonymous: true,
      },
    })
    testCheckinId = checkin.id
  })

  afterAll(async () => {
    // 清理测试数据
    if (testTokenId) {
      await prisma.checkinAccessToken.deleteMany({
        where: { id: testTokenId },
      })
    }
    
    await prisma.checkinSubmission.deleteMany({
      where: { checkinId: testCheckinId },
    })
    
    await prisma.checkin.deleteMany({
      where: { id: testCheckinId },
    })
    
    const course = await prisma.course.findFirst({
      where: { courseCode: 'TEST_COURSE_TOKEN' },
    })
    if (course) {
      await prisma.course.delete({ where: { id: course.id } })
    }
    
    await prisma.user.delete({ where: { id: testUserId } })
    
    await prisma.$disconnect()
  })

  describe('generateToken', () => {
    it('应该生成正确格式的令牌', () => {
      const token = checkinTokenService.generateToken()
      expect(token).toMatch(/^ck_[a-z0-9]{16}$/)
    })

    it('应该生成唯一的令牌', () => {
      const tokens = new Set<string>()
      for (let i = 0; i < 100; i++) {
        tokens.add(checkinTokenService.generateToken())
      }
      expect(tokens.size).toBe(100)
    })
  })

  describe('createToken', () => {
    it('应该成功创建令牌', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24小时后
      
      const token = await checkinTokenService.createToken({
        checkinId: testCheckinId,
        createdBy: testUserId,
        expiresAt,
        maxUses: 10,
      })

      expect(token).toBeDefined()
      expect(token.token).toMatch(/^ck_[a-z0-9]{16}$/)
      expect(token.checkinId).toBe(testCheckinId)
      expect(token.createdBy).toBe(testUserId)
      expect(token.maxUses).toBe(10)
      expect(token.usedCount).toBe(0)
      expect(token.isActive).toBe(true)

      testTokenId = token.id
    })
  })

  describe('validateToken', () => {
    it('应该验证有效令牌', async () => {
      // 先创建一个令牌
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const tokenData = await checkinTokenService.createToken({
        checkinId: testCheckinId,
        createdBy: testUserId,
        expiresAt,
      })

      const validation = await checkinTokenService.validateToken(tokenData.token)
      
      expect(validation.valid).toBe(true)
      expect(validation.expired).toBe(false)
      expect(validation.overLimit).toBe(false)
      expect(validation.disabled).toBe(false)
      expect(validation.token).toBeDefined()
      expect(validation.checkin).toBeDefined()
    })

    it('应该拒绝无效令牌', async () => {
      const validation = await checkinTokenService.validateToken('ck_invalid_token')
      
      expect(validation.valid).toBe(false)
    })

    it('应该检测过期令牌', async () => {
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

    it('应该检测超过访问限制的令牌', async () => {
      // 创建一个只能访问1次的令牌
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const tokenData = await checkinTokenService.createToken({
        checkinId: testCheckinId,
        createdBy: testUserId,
        expiresAt,
        maxUses: 1,
      })

      // 访问一次
      await checkinTokenService.recordAccess(tokenData.id)

      // 再次验证应该超限
      const validation = await checkinTokenService.validateToken(tokenData.token)
      
      expect(validation.valid).toBe(false)
      expect(validation.overLimit).toBe(true)
    })

    it('uses maxUses for atomic submission slots without consuming page views', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const tokenData = await checkinTokenService.createToken({
        checkinId: testCheckinId,
        createdBy: testUserId,
        expiresAt,
        maxUses: 1,
      })

      expect(await checkinTokenService.claimSubmissionSlot(tokenData.id)).toBe(true)
      expect(await checkinTokenService.claimSubmissionSlot(tokenData.id)).toBe(false)
      expect((await checkinTokenService.validateToken(tokenData.token)).overLimit).toBe(true)
      expect((await checkinTokenService.validateToken(tokenData.token, { ignoreUsageLimit: true })).valid).toBe(true)

      await prisma.checkinAccessToken.delete({ where: { id: tokenData.id } })
    })
  })

  describe('recordAccess', () => {
    it('应该正确记录访问次数', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const tokenData = await checkinTokenService.createToken({
        checkinId: testCheckinId,
        createdBy: testUserId,
        expiresAt,
      })

      // 记录访问
      await checkinTokenService.recordAccess(tokenData.id)

      // 检查访问次数
      const token = await prisma.checkinAccessToken.findUnique({
        where: { id: tokenData.id },
      })
      
      expect(token?.usedCount).toBe(1)
    })
  })

  describe('disableToken', () => {
    it('应该正确禁用令牌', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const tokenData = await checkinTokenService.createToken({
        checkinId: testCheckinId,
        createdBy: testUserId,
        expiresAt,
      })

      // 禁用令牌
      await checkinTokenService.disableToken(tokenData.id)

      // 验证应该显示禁用
      const validation = await checkinTokenService.validateToken(tokenData.token)
      
      expect(validation.valid).toBe(false)
      expect(validation.disabled).toBe(true)
    })
  })

  describe('getTokensByCheckin', () => {
    it('应该获取打卡的所有令牌', async () => {
      const tokens = await checkinTokenService.getTokensByCheckin(testCheckinId)
      
      expect(Array.isArray(tokens)).toBe(true)
      // 应该包含我们创建的测试令牌
      expect(tokens.length).toBeGreaterThan(0)
    })
  })

  describe('generateSessionId', () => {
    it('应该生成正确格式的会话ID', () => {
      const sessionId = checkinTokenService.generateSessionId()
      expect(sessionId).toMatch(/^session_[a-z0-9]{16}$/)
    })

    it('应该生成唯一的会话ID', () => {
      const sessionIds = new Set<string>()
      for (let i = 0; i < 100; i++) {
        sessionIds.add(checkinTokenService.generateSessionId())
      }
      expect(sessionIds.size).toBe(100)
    })
  })
})
