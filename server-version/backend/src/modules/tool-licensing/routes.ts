import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { error, success } from '../../utils/response'
import { requireRecentAdminKey } from '../admin-permissions/guards'
import { AdminPermissionError } from '../admin-permissions/service'
import { toolLicenseDirectoryQuery, toolLicenseId, toolLicenseProductSchema, toolLicenseToolDirectoryQuery } from './contracts'
import { listCurrentLicenseSet, listLicenseSubjects, listLicenseTools, requireLicenseSubject } from './directory'
import {
  createToolLicense, editToolLicense, listToolLicenses, readToolLicense, readToolLicenseTerminationImpact, terminateToolLicense,
} from './management'
import { createToolLicenseBatch, previewToolLicenseBatch } from './batch'
import { isExpandedToolLicensingEnabled, isToolLicensingEnabled } from './runtime'

const expandedFamilies = {
  SCHOOL: ['SCALE', 'FORM', 'COGNITIVE', 'SJT', 'BUNDLE'],
  TEACHER: ['SCALE', 'FORM', 'COGNITIVE', 'SJT', 'BUNDLE'],
  SURVEY: ['SCALE', 'FORM', 'COGNITIVE', 'SJT', 'COMBINATION', 'BUNDLE'],
  TRAINING: ['SCALE', 'FORM', 'COGNITIVE', 'SJT', 'COMBINATION', 'BUNDLE'],
}

const handler = (action: (req: Request) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    return success(res, await action(req))
  } catch (cause) {
    if (cause instanceof AdminPermissionError) return error(res, cause.message, -1, cause.statusCode)
    if (cause instanceof z.ZodError) return error(res, '授权请求格式不合法，请核对工具、期限和额度', -1, 400)
    next(cause)
  }
}
const operator = (req: Request) => ({ actorUserId: req.user!.userId, actorSession: req.user! })

// Mounted behind the existing system-admin authentication, origin and rate-limit boundary.
export const toolLicensesRouter = Router()
toolLicensesRouter.get('/subjects', handler(req => {
  const { product, ...query } = toolLicenseDirectoryQuery.parse(req.query)
  return listLicenseSubjects(prisma, product, query)
}))
toolLicensesRouter.get('/subjects/:id', handler(async req => {
  const product = toolLicenseProductSchema.parse(req.query.product)
  const subject = await requireLicenseSubject(prisma, product, toolLicenseId.parse(req.params.id))
  return { list: [subject], hasMore: false }
}))
toolLicensesRouter.get('/tools', handler(req => {
  const { product, ...query } = toolLicenseToolDirectoryQuery.parse(req.query)
  return listLicenseTools(prisma, product, query)
}))
toolLicensesRouter.get('/current-tools', handler(req => {
  const { product } = z.object({ product: toolLicenseProductSchema }).strict().parse(req.query)
  return listCurrentLicenseSet(prisma, product)
}))
toolLicensesRouter.get('/', handler(async req => {
  const enforcedProducts = toolLicenseProductSchema.options.filter(isToolLicensingEnabled)
  return {
    ...(await listToolLicenses(req.query)),
    enforcedProducts,
    pilotToolFamilies: Object.fromEntries(enforcedProducts.map(product =>
      [product, isExpandedToolLicensingEnabled(product)
        ? expandedFamilies[product].filter(family =>
          product !== 'TRAINING' || family !== 'BUNDLE' || process.env.BUNDLE_PRODUCTS_ENABLED === 'true')
        : ['SCALE']])),
  }
}))
toolLicensesRouter.post('/batches/preview', handler(req => previewToolLicenseBatch(operator(req), req.body)))
toolLicensesRouter.post('/batches', requireRecentAdminKey, handler(req => createToolLicenseBatch(operator(req), req.body)))
toolLicensesRouter.get('/:id', handler(req => readToolLicense(toolLicenseId.parse(req.params.id))))
toolLicensesRouter.get('/:id/termination-impact', handler(req => readToolLicenseTerminationImpact(toolLicenseId.parse(req.params.id))))
toolLicensesRouter.post('/', requireRecentAdminKey, handler(req => createToolLicense(operator(req), req.body)))
toolLicensesRouter.put('/:id', requireRecentAdminKey, handler(req => editToolLicense(operator(req), toolLicenseId.parse(req.params.id), req.body)))
toolLicensesRouter.post('/:id/terminate', requireRecentAdminKey,
  handler(req => terminateToolLicense(operator(req), toolLicenseId.parse(req.params.id), req.body)))
