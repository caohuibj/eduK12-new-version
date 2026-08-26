import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { generateToken } from '../utils/jwt'
import { hashPassword, comparePassword } from '../utils/password'
import { success, error, unauthorized } from '../utils/response'
import { UserRole } from '../types'
import { logger } from '../utils/logger'
import { Messages } from '../constants'
import { inactiveAccountMessage } from '../utils/accountStatus'
import { z } from 'zod'

const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(1, '密码不能为空'),
})

const teacherRegisterSchema = z.object({
  teacherCode: z.string().min(1, '教师码不能为空'),
  username: z.string().min(4, '用户名至少4个字符').max(20, '用户名最多20个字符'),
  password: z.string().min(8, '密码至少8个字符').max(12, '密码最多12个字符'),
  nickname: z.string().min(1, '真实姓名不能为空'),
})

const verifyTeacherCodeSchema = z.object({
  teacherCode: z.string().min(1, '教师码不能为空'),
})

const studentRegisterSchema = z.object({
  courseCode: z.string().min(1, '课程码不能为空'),
  username: z.string().min(4, '用户名至少4个字符').max(20, '用户名最多20个字符'),
  password: z.string().min(8, '密码至少8个字符').max(12, '密码最多12个字符'),
  nickname: z.string().min(2, '姓名至少2个字符'),
})

export const authController = {
  // 登录
  async login(req: Request, res: Response) {
    try {
      const result = loginSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { username, password } = result.data

      const user = await prisma.user.findUnique({
        where: { username }
      })

      if (!user) {
        return unauthorized(res, '用户名或密码错误')
      }

      if (!user.isActive) {
        return unauthorized(res, '账号已被禁用')
      }

      // 检查账号是否被冻结
      if (user.isFrozen) {
        return unauthorized(res, '账号已被冻结，请联系教师')
      }

      // 检查账号是否过期
      if (user.expiresAt && user.expiresAt < new Date()) {
        return unauthorized(res, '账号已过期，请联系管理员')
      }

      const isValid = await comparePassword(password, user.passwordHash)
      if (!isValid) {
        return unauthorized(res, '用户名或密码错误')
      }

      if (user.role === UserRole.TEACHER && !user.teacherApproved) {
        return unauthorized(res, '账号正在等待管理员审核，审核通过后即可登录')
      }

      const token = generateToken({
        userId: user.id,
        username: user.username,
        role: user.role,
        tokenVersion: user.tokenVersion,
      })

      return success(res, {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl,
          phone: user.phone,
          expiresAt: user.expiresAt,
        }
      }, '登录成功')
    } catch (err) {
      logger.error('登录错误', err)
      return error(res, Messages.USER.LOGIN_FAILED)
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
          SET "used_count" = "used_count" + 1, "is_active" = false
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

      if (course.status === 'COMPLETED' || course.endedAt) {
        return error(res, '课程已结束，无法加入')
      }

      if (course.isLibrary) {
        return error(res, '库课程不能加入')
      }

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
        const createdUser = await tx.user.create({
          data: {
            username,
            passwordHash: hashedPassword,
            role: UserRole.STUDENT,
            nickname,
            expiresAt: course.endedAt || null,
          }
        })

        await tx.courseStudent.create({
          data: {
            courseId: course.id,
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
      })

      return success(res, {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          nickname: user.nickname,
          expiresAt: user.expiresAt,
        }
      }, '注册成功，已加入课程')
    } catch (err) {
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

      if (newPassword.length < 6) {
        return error(res, '新密码至少6个字符')
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
        }
      })

      return success(res, null, '密码修改成功')
    } catch (err) {
      logger.error('修改密码错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
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
