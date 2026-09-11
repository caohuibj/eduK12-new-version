import type { Request, Response } from 'express'
import { prisma } from '../config/database'
import { UserRole } from '../types'
import { error, forbidden, notFound, success } from '../utils/response'
import { hashScaleDefinition } from '../modules/scale/scale-definition'
import { getScalePackage, validateScalePackage } from '../modules/scale/scale-package.registry'
import { validateScaleProductDefinition } from '../modules/scale/product-definition-readiness'

/**
 * Admin/teacher diagnostic only. This endpoint is deliberately outside all
 * participant save/FINAL paths and performs one exact Scale read, never a
 * catalog-wide qualification query.
 */
export const scaleQualificationController = {
  async validateDefinition(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params
      const scale = await prisma.scale.findUnique({ where: { id } })
      if (!scale) return notFound(res, '量表不存在')
      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) return forbidden(res, '无权限校验此量表')

      if (scale.instrumentClass === 'STANDARD') {
        const scalePackage = getScalePackage(scale.code, scale.instrumentVersion)
        if (!scalePackage) {
          return success(res, {
            valid: false,
            issues: [{ path: 'package', message: 'STANDARD package 未注册', severity: 'error' }],
            definitionHash: scale.definitionHash,
          })
        }
        return success(res, validateScalePackage(scalePackage))
      }

      const validation = validateScaleProductDefinition(scale.definition, 'CUSTOM_DESCRIPTIVE')
      return success(res, {
        valid: validation.valid,
        issues: validation.issues,
        definitionHash: validation.definition ? hashScaleDefinition(validation.definition) : null,
      })
    } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '校验量表 definition 失败')
    }
  },
}

export default scaleQualificationController
