import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { generateToken } from '../utils/jwt'
import { hashPassword, comparePassword, isValidPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../utils/password'
import { success, error, unauthorized } from '../utils/response'
import { UserRole } from '../types'
import { logger } from '../utils/logger'
import { Messages } from '../constants'
import { inactiveAccountMessage } from '../utils/accountStatus'
import { z } from 'zod'
import { setSessionCookie, clearSessionCookie } from '../utils/authCookies'
import { clearLoginFailures, recordLoginFailure } from '../middleware/loginRateLimit'
import { CourseNotJoinableError, courseJoinabilityMessage, isCourseJoinable } from '../utils/courseEnrollment'

const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(1, '密码不能为空'),
})

const teacherRegisterSchema = z.object({
  teacherCode: z.string().min(1, '教师码不能为空'),
  username: z.string().min(4, '用户名至少4个字符').max(20, '用户名最多20个字符'),
  password: z.string().min(PASSWORD_MIN_LENGTH, '密码至少8个字符').max(PASSWORD_MAX_LENGTH, '密码最多128个字符').refine(isValidPassword, '密码必须包含字母和数字'),
  nickname: z.string().min(1, '真实姓名不能为空'),
})

const verifyTeacherCodeSchema = z.object({
  teacherCode: z.string().min(1, '教师码不能为空'),
})

const studentRegisterSchema = z.object({
  courseCode: z.string().min(1, '课程码不能为空'),
  username: z.string().min(4, '用户名至少4个字符').max(20, '用户名最多20个字符'),
  password: z.string().min(PASSWORD_MIN_LENGTH, '密码至少8个字符').max(PASSWORD_MAX_LENGTH, '密码最多128个字符').refine(isValidPassword, '密码必须包含字母和数字'),
  nickname: z.string().min(2, '姓名至少2个字符'),
})

export const authController = {
  // 登录
  async login(req: Request, res: Response) {
    try {
      const result = loginSchema.safeParse(req.body)
      if (!result.success) {
        await recordLoginFailure(req)
        return unauthorized(res, '用户名或密码错误')
      }

      const { username, password } = result.data
      const failedLogin = async () => {
        await recordLoginFailure(req)
        // Do not disclose whether a username exists, is disabled, frozen, or
        // awaiting approval. The limiter still records the attempt by the
        // hashed account+IP key.
        return unauthorized(res, '用户名或密码错误')
      }

      const user = await prisma.user.findUnique({
        where: { username }
      })

      if (!user) {
        return failedLogin()
      }

      if (!user.isActive) {
        return failedLogin()
      }

      // 检查账号是否被冻结
      if (user.isFrozen) {
        return failedLogin()
      }

      // 检查账号是否过期
      if (user.expiresAt && user.expiresAt < new Date()) {
        return failedLogin()
      }

      const isValid = await comparePassword(password, user.passwordHash)
      if (!isValid) {
        return failedLogin()
      }

      if (user.role === UserRole.TEACHER && !user.teacherApproved) {
        return failedLogin()
      }

      await clearLoginFailures(req)

      const token = generateToken({
        userId: user.id,
        username: user.username,
        role: user.role,
        tokenVersion: user.tokenVersion,
        mustChangePassword: user.mustChangePassword,
      })

      setSessionCookie(req, res, token)

      return success(res, {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl,
          phone: user.phone,
          expiresAt: user.expiresAt,
          mustChangePassword: user.mustChangePassword,
        }
      }, '登录成功')
    } catch (err) {
      logger.error('登录错误', err)
      await recordLoginFailure(req)
      return unauthorized(res, '用户名或密码错误')
    }
  },

  // 验证教师码
  async verifyTeacherCode(req: Request, res: Response) {
    try {
      const result = verifyTeacherCodeSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { teacherCode: codeInput } = result.data

      const teacherCode = await prisma.teacherCode.findUnique({
        where: { code: codeInput }
      })

      if (!teacherCode) {
        return error(res, '教师邀请码无效')
      }

      if (!teacherCode.isActive) {
        return error(res, '教师邀请码已失效')
      }

      if (teacherCode.expiresAt && teacherCode.expiresAt < new Date()) {
        return error(res, '教师邀请码已过期')
      }

      if (teacherCode.usedCount >= teacherCode.maxUses) {
        return error(res, '教师邀请码已被使用')
      }

      return success(res, {
        isValid: true,
        isUsed: teacherCode.usedCount > 0,
      }, '教师码有效')
    } catch (err) {
      logger.error('验证教师码错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 教师注册（使用教师码）
  async teacherRegister(req: Request, res: Response) {
    try {
      const result = teacherRegisterSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { teacherCode: codeInput, username, password, nickname } = result.data

      // 验证教师码
      const teacherCode = await prisma.teacherCode.findUnique({
        where: { code: codeInput }
      })

      if (!teacherCode || !teacherCode.isActive) {
        return error(res, '教师邀请码无效或已失效')
      }

      if (teacherCode.expiresAt && teacherCode.expiresAt < new Date()) {
        return error(res, '教师邀请码已过期')
      }

      if (teacherCode.usedCount >= teacherCode.maxUses) {
        return error(res, '教师邀请码已被使用')
      }

      // 检查用户名是否已存在
      const existingUser = await prisma.user.findUnique({
        where: { username }
      })

      if (existingUser) {
        return error(res, '用户名已被使用，请更换')
      }

      // 创建教师账号，有效期1年
      const expiresAt = new Date()
      expiresAt.setFullYear(expiresAt.getFullYear() + 1)

      const hashedPassword = await hashPassword(password)
      // 注册账号和教师码占用必须是一个事务。先用条件更新抢占注册码，
      // 并发请求只有一个能成功；后续创建失败时占用也会一并回滚。
      const user = await prisma.$transaction(async (tx) => {
        const claimed = await tx.$executeRaw`
          UPDATE "teacher_codes"
          SET "used_count" = "used_count" + 1,
              "is_active" = CASE
                WHEN "used_count" + 1 >= "max_uses" THEN false
                ELSE "is_active"
              END
          WHERE "id" = ${teacherCode.id}
            AND "is_active" = true
            AND ("expires_at" IS NULL OR "expires_at" > NOW())
            AND "used_count" < "max_uses"
        `

        if (Number(claimed) !== 1) return null

        return tx.user.create({
          data: {
            username,
            passwordHash: hashedPassword,
            role: UserRole.TEACHER,
            nickname,
            teacherCodeId: teacherCode.id,
            expiresAt,
            teacherApproved: false,
          }
        })
      })

      if (!user) {
        return error(res, '教师邀请码已被使用或已过期')
      }

      return success(res, {
        pendingApproval: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          nickname: user.nickname,
          expiresAt: user.expiresAt,
          teacherApproved: false,
        }
      }, '已提交注册，请等待管理员审核通过后再登录')
    } catch (err) {
      logger.error('教师注册错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 学生注册（通过课程码）
  async studentRegister(req: Request, res: Response) {
    try {
      const result = studentRegisterSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { courseCode, username, password, nickname } = result.data

      // 查找课程
      const course = await prisma.course.findUnique({
        where: { courseCode }
      })

      if (!course) {
        return error(res, '课程码无效')
      }

      if (!isCourseJoinable(course)) return error(res, courseJoinabilityMessage(course))

      // 检查用户名是否已存在
      const existingUser = await prisma.user.findUnique({
        where: { username }
      })

      if (existingUser) {
        return error(res, '用户名已被使用，请更换')
      }

      // 创建学生账号，有效期到课程结束
      const hashedPassword = await hashPassword(password)
      // 账号创建和课程关系创建必须原子完成，避免留下无法加入课程的孤立账号。
      const user = await prisma.$transaction(async (tx) => {
        // Re-check under a row lock. Stopping recruitment or ending a course
        // concurrently must win over this registration attempt.
        if (typeof (tx as any).$executeRaw === 'function') {
          await (tx as any).$executeRaw`SELECT id FROM "courses" WHERE id = ${course.id} FOR UPDATE`
        }
        const lockedCourse = await tx.course.findUnique({ where: { id: course.id } })
        // The initial lookup only identifies the row to lock.  A teacher may
        // rotate the code while this request is waiting for that row lock;
        // accepting the refreshed row without comparing the submitted code
        // would make the old code valid after rotation.
        if (
          !lockedCourse
          || lockedCourse.courseCode !== courseCode
          || !isCourseJoinable(lockedCourse)
        ) {
          throw new CourseNotJoinableError(
            !lockedCourse || lockedCourse.courseCode !== courseCode
              ? '课程码无效'
              : courseJoinabilityMessage(lockedCourse),
          )
        }

        const createdUser = await tx.user.create({
          data: {
            username,
            passwordHash: hashedPassword,
            role: UserRole.STUDENT,
            nickname,
            expiresAt: lockedCourse.endedAt || null,
          }
        })

        await tx.courseStudent.create({
          data: {
            courseId: lockedCourse.id,
            studentId: createdUser.id,
            status: 'ACTIVE',
          }
        })

        return createdUser
      })

      const token = generateToken({
        userId: user.id,
        username: user.username,
        role: user.role,
        tokenVersion: user.tokenVersion,
        mustChangePassword: user.mustChangePassword,
      })

      setSessionCookie(req, res, token)

      return success(res, {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          nickname: user.nickname,
          expiresAt: user.expiresAt,
          mustChangePassword: user.mustChangePassword,
        }
      }, '注册成功，已加入课程')
    } catch (err) {
      if (err instanceof CourseNotJoinableError) return error(res, err.message)
      logger.error('学生注册错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 旧版无课程归属注册接口已停用：学生账号必须通过课程码注册。
  async register(req: Request, res: Response) {
    return error(res, '学生账号必须使用课程码注册', -1, 410)
  },

  // 获取当前用户信息
  async me(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) {
        return unauthorized(res)
      }

      const user = await prisma.user.findUnique({
        where: { id: userId }
      })

      if (!user) {
        return unauthorized(res, '用户不存在')
      }

      const rejection = inactiveAccountMessage(user)
      if (rejection) {
        return unauthorized(res, rejection)
      }

      return success(res, {
        id: user.id,
        username: user.username,
        role: user.role,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        phone: user.phone,
        expiresAt: user.expiresAt,
        mustChangePassword: user.mustChangePassword,
      })
    } catch (err) {
      logger.error('获取用户信息错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 修改密码
  async changePassword(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) {
        return unauthorized(res)
      }

      const { oldPassword, newPassword } = req.body
      if (!oldPassword || !newPassword) {
        return error(res, '请提供旧密码和新密码')
      }

      if (typeof newPassword !== 'string' || !isValidPassword(newPassword)) {
        return error(res, '密码必须包含字母和数字，长度为8-128个字符')
      }

      const user = await prisma.user.findUnique({
        where: { id: userId }
      })

      if (!user) {
        return unauthorized(res)
      }

      const isValid = await comparePassword(oldPassword, user.passwordHash)
      if (!isValid) {
        return error(res, '旧密码错误')
      }

      const hashedPassword = await hashPassword(newPassword)
      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: hashedPassword,
          tokenVersion: { increment: 1 },
          mustChangePassword: false,
        }
      })

      clearSessionCookie(req, res)

      return success(res, null, '密码修改成功')
    } catch (err) {
      logger.error('修改密码错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  async logout(req: Request, res: Response) {
    clearSessionCookie(req, res)
    return success(res, null, '已退出登录')
  },

  // 延期教师账号
  async extendAccount(req: Request, res: Response) {
    try {
      const { userId, months = 12 } = req.body
      
      if (!userId) {
        return error(res, '请提供用户ID')
      }

      const user = await prisma.user.findUnique({
        where: { id: userId }
      })

      if (!user) {
        return error(res, '用户不存在')
      }

      if (user.role !== UserRole.TEACHER) {
        return error(res, '只能延期教师账号')
      }

      // 计算新的过期时间
      const currentExpiresAt = user.expiresAt || new Date()
      const newExpiresAt = new Date(currentExpiresAt)
      newExpiresAt.setMonth(newExpiresAt.getMonth() + months)

      await prisma.user.update({
        where: { id: userId },
        data: { expiresAt: newExpiresAt }
      })

      return success(res, {
        userId,
        expiresAt: newExpiresAt,
      }, `账号已成功延期${months}个月`)
    } catch (err) {
      logger.error('延期账号错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },
}
