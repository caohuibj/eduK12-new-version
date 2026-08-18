/**
 * 匿名打卡功能集成测试
 * 
 * 测试流程：
 * 1. 教师创建打卡并开启匿名功能
 * 2. 教师创建访问令牌
 * 3. 匿名用户通过令牌访问打卡
 * 4. 匿名用户提交打卡
 * 5. 教师查看提交记录
 * 6. 验证现有登录打卡功能不受影响
 */

import { prisma } from '../../config/database'
import { checkinTokenService } from '../../services/checkinTokenService'

describe('匿名打卡功能集成测试', () => {
  let teacherId: string
  let studentId: string
  let courseId: string
  let checkinId: string
  let normalCheckinId: string
  let tokenId: string
  let sessionId: string

  beforeAll(async () => {
    // 创建测试教师
    const teacher = await prisma.user.create({
      data: {
        username: 'integration_teacher',
        passwordHash: 'test_hash',
        role: 'TEACHER',
        nickname: '集成测试教师',
      },
    })
    teacherId = teacher.id

    // 创建测试学生
    const student = await prisma.user.create({
      data: {
        username: 'integration_student',
        passwordHash: 'test_hash',
        role: 'STUDENT',
        nickname: '集成测试学生',
      },
    })
    studentId = student.id

    // 创建测试课程
    const course = await prisma.course.create({
      data: {
        title: '集成测试课程',
        courseCode: 'INTEGRATION_TEST',
        creatorId: teacherId,
        status: 'PUBLISHED',
      },
    })
    courseId = course.id

    // 学生加入课程
    await prisma.courseStudent.create({
      data: {
        courseId,
        studentId,
        status: 'APPROVED',
      },
    })
  })

  afterAll(async () => {
    // 清理测试数据
    await prisma.checkinSubmission.deleteMany({
      where: {
        checkin: { courseId },
      },
    })
    
    await prisma.checkinAccessToken.deleteMany({
      where: { checkinId },
    })
    
    await prisma.checkin.deleteMany({
      where: { courseId },
    })
    
    await prisma.courseStudent.deleteMany({
      where: { courseId },
    })
    
    await prisma.course.delete({ where: { id: courseId } })
    await prisma.user.delete({ where: { id: teacherId } })
    await prisma.user.delete({ where: { id: studentId } })
    
    await prisma.$disconnect()
  })

  describe('1. 教师创建打卡并开启匿名功能', () => {
    it('应该成功创建允许匿名的打卡', async () => {
      const checkin = await prisma.checkin.create({
        data: {
          title: '集成测试匿名打卡',
          courseId,
          creatorId: teacherId,
          allowAnonymous: true,
          content: '这是一个测试打卡',
        },
      })

      expect(checkin).toBeDefined()
      expect(checkin.allowAnonymous).toBe(true)
      checkinId = checkin.id
    })

    it('应该成功创建普通打卡（不允许匿名）', async () => {
      const checkin = await prisma.checkin.create({
        data: {
          title: '普通打卡',
          courseId,
          creatorId: teacherId,
          allowAnonymous: false,
          content: '这是普通打卡',
        },
      })

      expect(checkin).toBeDefined()
      expect(checkin.allowAnonymous).toBe(false)
      normalCheckinId = checkin.id
    })
  })

  describe('2. 教师创建访问令牌', () => {
    it('应该成功创建访问令牌', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const token = await checkinTokenService.createToken({
        checkinId,
        createdBy: teacherId,
        expiresAt,
        maxUses: 10,
      })

      expect(token).toBeDefined()
      expect(token.token).toMatch(/^ck_[a-z0-9]{16}$/)
      expect(token.maxUses).toBe(10)
      tokenId = token.id
    })
  })

  describe('3. 匿名用户通过令牌访问打卡', () => {
    it('应该成功验证有效令牌', async () => {
      const token = await prisma.checkinAccessToken.findUnique({
        where: { id: tokenId },
      })

      const validation = await checkinTokenService.validateToken(token!.token)

      expect(validation.valid).toBe(true)
      expect(validation.checkin).toBeDefined()
      expect(validation.checkin.id).toBe(checkinId)
    })

    it('应该生成会话ID', () => {
      sessionId = checkinTokenService.generateSessionId()
      expect(sessionId).toMatch(/^session_[a-z0-9]{16}$/)
    })
  })

  describe('4. 匿名用户提交打卡', () => {
    it('应该成功创建匿名提交', async () => {
      const token = await prisma.checkinAccessToken.findUnique({
        where: { id: tokenId },
      })

      const submission = await prisma.checkinSubmission.create({
        data: {
          checkinId,
          studentId: null,
          content: '匿名用户提交',
          sessionId,
          tokenId,
          isAnonymous: true,
        },
      })

      expect(submission).toBeDefined()
      expect(submission.isAnonymous).toBe(true)
      expect(submission.studentId).toBeNull()
      expect(submission.sessionId).toBe(sessionId)
    })

    it('相同会话ID应无法重复提交', async () => {
      try {
        await prisma.checkinSubmission.create({
          data: {
            checkinId,
            studentId: null,
            content: '重复提交',
            sessionId, // 相同的会话ID
            tokenId,
            isAnonymous: true,
          },
        })
        fail('应该抛出唯一约束错误')
      } catch (error: any) {
        expect(error.code).toBe('P2002')
      }
    })
  })

  describe('5. 教师查看提交记录', () => {
    it('应该能够看到匿名提交', async () => {
      const submissions = await prisma.checkinSubmission.findMany({
        where: { checkinId },
        include: {
          student: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
        },
      })

      expect(submissions.length).toBe(1)
      expect(submissions[0].isAnonymous).toBe(true)
      expect(submissions[0].student).toBeNull()
    })
  })

  describe('6. 验证现有登录打卡功能不受影响', () => {
    it('学生应该能够正常提交登录打卡', async () => {
      const submission = await prisma.checkinSubmission.create({
        data: {
          checkinId: normalCheckinId,
          studentId,
          content: '学生正常提交',
        },
      })

      expect(submission).toBeDefined()
      expect(submission.studentId).toBe(studentId)
      expect(submission.isAnonymous).toBe(false)
    })

    it('学生无法重复提交', async () => {
      try {
        await prisma.checkinSubmission.create({
          data: {
            checkinId: normalCheckinId,
            studentId,
            content: '重复提交',
          },
        })
        fail('应该抛出唯一约束错误')
      } catch (error: any) {
        expect(error.code).toBe('P2002')
      }
    })

    it('教师应该能够看到学生的提交', async () => {
      const submissions = await prisma.checkinSubmission.findMany({
        where: { checkinId: normalCheckinId },
        include: {
          student: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
        },
      })

      expect(submissions.length).toBe(1)
      expect(submissions[0].student).toBeDefined()
      expect(submissions[0].student!.id).toBe(studentId)
    })
  })

  describe('7. 验证数据隔离', () => {
    it('匿名提交和登录提交应该互不影响', async () => {
      // 查询所有提交
      const allSubmissions = await prisma.checkinSubmission.findMany({
        where: {
          OR: [
            { checkinId },
            { checkinId: normalCheckinId },
          ],
        },
        include: {
          student: true,
        },
      })

      // 应该有2条提交
      expect(allSubmissions.length).toBe(2)

      // 匿名提交
      const anonymousSubmissions = allSubmissions.filter(s => s.isAnonymous)
      expect(anonymousSubmissions.length).toBe(1)
      expect(anonymousSubmissions[0].studentId).toBeNull()

      // 登录提交
      const loginSubmissions = allSubmissions.filter(s => !s.isAnonymous)
      expect(loginSubmissions.length).toBe(1)
      expect(loginSubmissions[0].studentId).toBe(studentId)
    })
  })

  describe('8. 验证令牌安全机制', () => {
    it('过期令牌应被拒绝', async () => {
      const expiredToken = await checkinTokenService.createToken({
        checkinId,
        createdBy: teacherId,
        expiresAt: new Date(Date.now() - 1000),
      })

      const validation = await checkinTokenService.validateToken(expiredToken.token)
      expect(validation.valid).toBe(false)
      expect(validation.expired).toBe(true)
    })

    it('未开启匿名的打卡应拒绝令牌访问', async () => {
      const token = await checkinTokenService.createToken({
        checkinId: normalCheckinId,
        createdBy: teacherId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })

      const validation = await checkinTokenService.validateToken(token.token)
      expect(validation.valid).toBe(false)
    })
  })
})
