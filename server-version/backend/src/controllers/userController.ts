import { changePasswordHandler } from './changePasswordController'
import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { success, error, forbidden, notFound } from '../utils/response'
import { UserRole } from '../types'
import { hashPassword, generateTempPassword, isValidPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../utils/password'
import { logger } from '../utils/logger'
import { Messages } from '../constants'
import { z } from 'zod'
import path from 'node:path'
import { removeCredentialHandoff, writeCredentialHandoff } from '../utils/credentialHandoff'
import { setUserActiveState, UserLifecycleError } from '../services/userLifecycleService'

const createUserSchema = z.object({
  username: z.string().min(3, '用户名至少3个字符'),
  password: z.string().min(PASSWORD_MIN_LENGTH, '密码至少8个字符').max(PASSWORD_MAX_LENGTH, '密码最多128个字符').refine(isValidPassword, '密码必须包含字母和数字'),
  role: z.enum(['STUDENT', 'TEACHER', 'ADMIN', 'PARENT']),
  nickname: z.string().optional(),
})

const updateUserSchema = z.object({
  nickname: z.string().optional(),
  avatarUrl: z.string().optional(),
  phone: z.string().optional(),
  // Compatibility input only. The controller never writes this field directly;
  // it delegates to the platform-authoritative lifecycle service.
  isActive: z.boolean().optional(),
})

// 分页参数解析工具函数
const getPaginationParams = (req: Request) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const pageSize = Math.min(100, parseInt(req.query.pageSize as string) || 100)
  return { page, pageSize, skip: (page - 1) * pageSize }
}

export const userController = {
  // 获取用户列表（管理员）
  async list(req: Request, res: Response) {
    try {
      const { role, keyword } = req.query
      const { page, pageSize, skip } = getPaginationParams(req)

      let where: any = {}

      if (role && role !== 'all') {
        where.role = role
      }

      if (keyword) {
        where.OR = [
          { username: { contains: keyword as string } },
          { nickname: { contains: keyword as string } },
        ]
      }

      // 并行执行查询和计数
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            username: true,
            role: true,
            nickname: true,
            avatarUrl: true,
            phone: true,
            isActive: true,
            isFrozen: true,
            teacherApproved: true,
            expiresAt: true,
            createdAt: true,
            mustChangePassword: true,
          },
          orderBy: {
            createdAt: 'desc'
          },
          skip,
          take: pageSize,
        }),
        prisma.user.count({ where })
      ])

      return success(res, {
        list: users,
        total,
        page,
        pageSize,
      })
    } catch (err) {
      logger.error('获取用户列表错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  async approveTeacher(req: Request, res: Response) {
    try {
      const { id } = req.params
      const user = await prisma.user.findUnique({ where: { id } })
      if (!user) {
        return notFound(res, '用户不存在')
      }
      if (user.role !== UserRole.TEACHER) {
        return error(res, '只能审核教师账号')
      }
      if (user.teacherApproved) {
        return success(res, { id: user.id, teacherApproved: true }, '该教师已通过审核')
      }

      const updated = await prisma.user.update({
        where: { id },
        data: { teacherApproved: true },
        select: {
          id: true,
          username: true,
          nickname: true,
          role: true,
          teacherApproved: true,
        },
      })

      return success(res, updated, '教师账号已通过审核')
    } catch (err) {
      logger.error('审核教师账号错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 创建用户（管理员）
  async create(req: Request, res: Response) {
    try {
      const result = createUserSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { username, password, role, nickname } = result.data

      // 检查用户名是否已存在
      const existingUser = await prisma.user.findUnique({
        where: { username }
      })

      if (existingUser) {
        return error(res, '用户名已存在')
      }

      const hashedPassword = await hashPassword(password)

      const user = await prisma.user.create({
        data: {
          username,
          passwordHash: hashedPassword,
          role: role as UserRole,
          nickname: nickname || username,
        },
        select: {
          id: true,
          username: true,
          role: true,
          nickname: true,
          avatarUrl: true,
          phone: true,
          isActive: true,
          createdAt: true,
          mustChangePassword: true,
        }
      })

      return success(res, user, '用户创建成功')
    } catch (err) {
      logger.error('创建用户错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 获取用户详情
  async detail(req: Request, res: Response) {
    try {
      const { id } = req.params

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          username: true,
          role: true,
          nickname: true,
          avatarUrl: true,
          phone: true,
          isActive: true,
          createdAt: true,
          mustChangePassword: true,
        }
      })

      if (!user) {
        return notFound(res, '用户不存在')
      }

      return success(res, user)
    } catch (err) {
      logger.error('获取用户详情错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 更新用户
  async update(req: Request, res: Response) {
    try {
      const currentUserId = req.user?.userId
      const currentUserRole = req.user?.role
      const { id } = req.params

      const result = updateUserSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      // Account activation/deactivation is not a generic profile mutation.
      // Preserve the legacy PUT shape for clients, but delegate the authority
      // and invariant to the platform lifecycle service before any legacy-role
      // profile authorization can run.
      if (result.data.isActive !== undefined) {
        const hasProfileMutation =
          result.data.nickname !== undefined ||
          result.data.avatarUrl !== undefined ||
          result.data.phone !== undefined
        if (hasProfileMutation) {
          return error(res, '账号启停不能与资料修改在同一请求中提交', -1, 400)
        }
        try {
          const lifecycle = await setUserActiveState({
            actorUserId: req.user!.userId,
            targetUserId: id,
            isActive: result.data.isActive,
          })
          return success(res, lifecycle, result.data.isActive ? '用户已启用' : '用户已停用')
        } catch (err) {
          if (err instanceof UserLifecycleError) {
            return error(res, err.message, -1, err.statusCode)
          }
          throw err
        }
      }

      const user = await prisma.user.findUnique({
        where: { id }
      })

      if (!user) {
        return notFound(res, '用户不存在')
      }

      // Legacy profile authorization remains unchanged. It does not grant any
      // Organization or platform lifecycle authority.
      if (id !== currentUserId && currentUserRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此用户')
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: result.data,
        select: {
          id: true,
          username: true,
          role: true,
          nickname: true,
          avatarUrl: true,
          phone: true,
          isActive: true,
          createdAt: true,
          mustChangePassword: true,
        }
      })

      return success(res, updatedUser, '用户更新成功')
    } catch (err) {
      logger.error('更新用户错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 重置密码（管理员）
  async resetPassword(req: Request, res: Response) {
    try {
      const { id } = req.params

      const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, username: true },
      })

      if (!user) {
        return notFound(res, '用户不存在')
      }

      const temporaryPassword = generateTempPassword()
      const hashedPassword = await hashPassword(temporaryPassword)
      const handoffFile = await writeCredentialHandoff([{
        username: user.username,
        temporaryPassword,
      }], 'admin-password-reset')

      try {
        await prisma.user.update({
          where: { id },
          data: {
            passwordHash: hashedPassword,
            tokenVersion: { increment: 1 },
            mustChangePassword: true,
          }
        })
      } catch (updateError) {
        removeCredentialHandoff(handoffFile)
        throw updateError
      }

      return success(res, { handoffFile: path.basename(handoffFile) }, '密码已重置；临时密码已写入受保护的本地交接文件')
    } catch (err) {
      logger.error('重置密码错误', err)
      return error(res, Messages.USER.PASSWORD_RESET)
    }
  },

  // 修改自己的密码
  changePassword: changePasswordHandler,

  // 获取当前用户信息
  async me(req: Request, res: Response) {
    try {
      const userId = req.user?.userId

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          role: true,
          nickname: true,
          avatarUrl: true,
          phone: true,
          isActive: true,
          isFrozen: true,
          expiresAt: true,
          createdAt: true,
          mustChangePassword: true,
        }
      })

      if (!user) {
        return notFound(res, '用户不存在')
      }

      return success(res, user)
    } catch (err) {
      logger.error('获取用户信息错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  }
}
