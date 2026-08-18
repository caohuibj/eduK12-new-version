import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { success, error, notFound } from '../utils/response'
import { generateTeacherCode } from '../utils/teacherCode'
import { z } from 'zod'

const createCodeSchema = z.object({
  maxUses: z.number().int().min(1).default(1),
  expiresAt: z.string().datetime().optional(),
})

export const teacherCodeController = {
  // 获取教师码列表
  async list(req: Request, res: Response) {
    try {
      const codes = await prisma.teacherCode.findMany({
        include: {
          creator: {
            select: {
              id: true,
              nickname: true,
              username: true,
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      return success(res, {
        list: codes,
        total: codes.length,
      })
    } catch (err) {
      console.error('获取教师码列表错误:', err)
      return error(res, '获取教师码列表失败')
    }
  },

  // 生成教师码
  async create(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) {
        return error(res, '未登录')
      }

      const result = createCodeSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { maxUses, expiresAt } = result.data

      // 生成唯一教师码
      const code = await generateTeacherCode()

      const teacherCode = await prisma.teacherCode.create({
        data: {
          code,
          createdBy: userId,
          maxUses,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
        include: {
          creator: {
            select: {
              id: true,
              nickname: true,
              username: true,
            }
          }
        }
      })

      return success(res, teacherCode, '教师码生成成功')
    } catch (err) {
      console.error('生成教师码错误:', err)
      return error(res, '生成教师码失败')
    }
  },

  // 删除教师码
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params

      const code = await prisma.teacherCode.findUnique({
        where: { id }
      })

      if (!code) {
        return notFound(res, '教师码不存在')
      }

      await prisma.teacherCode.delete({
        where: { id }
      })

      return success(res, null, '教师码已删除')
    } catch (err) {
      console.error('删除教师码错误:', err)
      return error(res, '删除教师码失败')
    }
  },

  // 验证教师码（内部使用）
  async verify(req: Request, res: Response) {
    try {
      const { code } = req.body

      if (!code) {
        return error(res, '请输入教师码')
      }

      const teacherCode = await prisma.teacherCode.findUnique({
        where: { code }
      })

      if (!teacherCode) {
        return error(res, '教师码无效')
      }

      if (!teacherCode.isActive) {
        return error(res, '教师码已失效')
      }

      if (teacherCode.expiresAt && teacherCode.expiresAt < new Date()) {
        return error(res, '教师码已过期')
      }

      if (teacherCode.usedCount >= teacherCode.maxUses) {
        return error(res, '教师码使用次数已达上限')
      }

      return success(res, { valid: true })
    } catch (err) {
      console.error('验证教师码错误:', err)
      return error(res, '验证教师码失败')
    }
  }
}
