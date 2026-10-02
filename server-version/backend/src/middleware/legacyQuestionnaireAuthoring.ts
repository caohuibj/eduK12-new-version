import type { Request, Response, NextFunction } from 'express'
import { prisma } from '../config/database'
import { inLegacyQuestionnaireTransaction } from '../services/legacyQuestionnaireDatabase'
import { questionnaireAuthorizationService as authorization } from '../services/questionnaireAuthorizationService'
import { cacheService } from '../services/cacheService'
import { error, forbidden, notFound } from '../utils/response'

type Handler = (req: Request, res: Response) => unknown | Promise<unknown>
class RejectedDefinitionWrite extends Error {}

/**
 * Publish and every definition write take the same parent row lock before
 * reading content. Child writes and media retention join this transaction.
 * Delivery, answers, reports, export and token operations are not wrapped.
 */
export const legacyQuestionnaireAuthoring = (
  type: 'COURSE' | 'GENERAL', handler: Handler, draftOnly = true,
) => async (req: Request, res: Response, next: NextFunction) => {
  let status = 200
  let body: any
  const buffered = Object.create(res) as Response
  buffered.status = ((code: number) => { status = code; return buffered }) as Response['status']
  buffered.json = ((value: unknown) => { body = value; return buffered }) as Response['json']
  try {
    await prisma.$transaction(async tx => {
      // Prisma's mapped table name is questionnaires; parameter binding keeps
      // arbitrary user-supplied ids outside the SQL text.
      await tx.$queryRaw`SELECT id FROM questionnaires WHERE id = ${req.params.id} FOR UPDATE`
      const questionnaire = await tx.questionnaire.findFirst({ where: { id: req.params.id, type } })
      if (!questionnaire) { notFound(buffered, '问卷不存在'); throw new RejectedDefinitionWrite() }
      const actor = req.user ? { userId: req.user.userId, role: req.user.role } : null
      const permitted = type === 'GENERAL'
        ? await authorization.canManageGeneral(actor, questionnaire)
        : await authorization.canManage(actor, questionnaire)
      if (!permitted) { forbidden(buffered, '无权限修改此问卷'); throw new RejectedDefinitionWrite() }
      if (draftOnly && questionnaire.status !== 'DRAFT') {
        error(buffered, '仅草稿问卷可以修改或发布；请复制为新版问卷')
        throw new RejectedDefinitionWrite()
      }
      await inLegacyQuestionnaireTransaction(tx, async () => { await handler(req, buffered) })
      // Controllers convert service errors to JSON. Roll back partial writes,
      // and send that response only after the transaction has settled.
      if (status >= 400 || body?.code !== 0) throw new RejectedDefinitionWrite()
    }, { maxWait: 5000, timeout: 30000 })
    await cacheService.clearQuestionnaireCache(req.params.id)
    return res.status(status).json(body)
  } catch (cause) {
    if (cause instanceof RejectedDefinitionWrite) return res.status(status).json(body)
    return next(cause)
  }
}
