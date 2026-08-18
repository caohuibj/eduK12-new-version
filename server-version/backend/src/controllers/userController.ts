import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { success, error, forbidden, notFound } from '../utils/response'
import { UserRole } from '../types'
import { hashPassword } from '../utils/password'
import { logger } from '../utils/logger'
import { Messages } from '../constants'
import { z } from 'zod'

const createUserSchema = z.object({
  username: z.string().min(3, '用户名至少3个字符'),
  password: z.string().min(6, '密码至少6个字符'),
  role: z.enum(['STUDENT', 'TEACHER', 'ADMIN']),
  nickname: z.string().optional(),
})

const updateUserSchema = z.object({
  nickname: z.string().optional(),
  avatarUrl: z.string().optional(),
  phone: z.string().optional(),
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
            expiresAt: true,
            createdAt: true,
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

      const user = await prisma.user.findUnique({
        where: { id }
      })

      if (!user) {
        return notFound(res, '用户不存在')
      }

      // 权限检查：只能修改自己或管理员修改任何人
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
        }
      })

      return success(res, updatedUser, '用户更新成功')
    } catch (err) {
      logger.error('更新用户错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 删除用户（管理员）
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params

      const user = await prisma.user.findUnique({
        where: { id }
      })

      if (!user) {
        return notFound(res, '用户不存在')
      }

      await prisma.user.delete({
        where: { id }
      })

      return success(res, null, '用户已删除')
    } catch (err) {
      logger.error('删除用户错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 重置密码（管理员）
  async resetPassword(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { newPassword } = req.body

      if (!newPassword || newPassword.length < 6) {
        return error(res, '新密码至少6个字符')
      }

      const user = await prisma.user.findUnique({
        where: { id }
      })

      if (!user) {
        return notFound(res, '用户不存在')
      }

      const hashedPassword = await hashPassword(newPassword)

      await prisma.user.update({
        where: { id },
        data: { passwordHash: hashedPassword }
      })

      return success(res, null, '密码已重置')
    } catch (err) {
      logger.error('重置密码错误', err)
      return error(res, Messages.USER.PASSWORD_RESET)
    }
  },

  // 修改自己的密码
  async changePassword(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { oldPassword, newPassword } = req.body

      if (!oldPassword || !newPassword) {
        return error(res, '请输入原密码和新密码')
      }

      if (newPassword.length < 6) {
        return error(res, '新密码至少6个字符')
      }

      const user = await prisma.user.findUnique({
        where: { id: userId }
      })

      if (!user) {
        return notFound(res, '用户不存在')
      }

      // 验证原密码
      const { comparePassword } = require('../utils/password')
      const isValid = await comparePassword(oldPassword, user.passwordHash)
      if (!isValid) {
        return error(res, '原密码错误')
      }

      // 更新密码
      const hashedPassword = await hashPassword(newPassword)
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: hashedPassword }
      })

      return success(res, null, '密码修改成功')
    } catch (err) {
      logger.error('修改密码错误', err)
      return error(res, Messages.USER.PASSWORD_CHANGED)
    }
  },

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
