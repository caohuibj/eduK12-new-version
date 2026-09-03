import { Request, Response } from 'express'
import {
  AuthorizationContractError,
  approveInstrumentAuthorization,
  createInstrumentAuthorizationDraft,
  evaluateBundlePublication,
  type InstrumentAuthorizationRecordV1,
} from '../modules/assessment-authorization'
import { WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1 } from '../modules/assessment-bundle'
import { error, success, unauthorized } from '../utils/response'

/** Process-local store for admin UI until Prisma repository is wired in a later hardening pass. */
const memory = new Map<string, InstrumentAuthorizationRecordV1>()

const handleError = (res: Response, err: unknown) => {
  if (err instanceof AuthorizationContractError) {
    return error(res, err.message, -1, 400)
  }
  return error(res, '服务器内部错误', -1, 500)
}

export const instrumentAuthorizationController = {
  async list(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return success(res, { list: [...memory.values()] })
    } catch (err) {
      return handleError(res, err)
    }
  },

  async create(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const body = req.body as {
        instrumentKey: string
        instrumentVersion: string
        grantor: string
        grantee: string
        scope: InstrumentAuthorizationRecordV1['scope']
        validFrom: string
        validTo: string
        basis: string
      }
      const record = createInstrumentAuthorizationDraft({
        ...body,
        createdByUserId: req.user.userId,
      })
      memory.set(`${record.authorizationId}@${record.version}`, record)
      return success(res, record, '授权草稿已创建')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async approve(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const current = [...memory.values()]
        .filter((row) => row.authorizationId === req.params.authorizationId)
        .sort((a, b) => b.version - a.version)[0]
      if (!current) return error(res, 'authorization not found', -1, 404)
      const approved = approveInstrumentAuthorization({
        record: current,
        actorUserId: req.user.userId,
        selfApprovalDeclaration: req.body?.selfApprovalDeclaration ?? null,
      })
      memory.set(`${approved.record.authorizationId}@${approved.record.version}`, approved.record)
      return success(res, { record: approved.record, audit: approved.audit }, '授权已批准')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async publishPreviewWho5(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const authorizations = [...memory.values()].filter((row) => row.instrumentKey === 'who5')
      const decision = evaluateBundlePublication({
        definition: WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1,
        authorizations,
        locale: String(req.body?.locale ?? 'zh-CN'),
        territory: String(req.body?.territory ?? 'CN'),
        deploymentCommercialNature: (req.body?.deploymentCommercialNature ?? 'NON_COMMERCIAL') as
          'NON_COMMERCIAL' | 'COMMERCIAL' | 'UNSPECIFIED',
      })
      return success(res, decision)
    } catch (err) {
      return handleError(res, err)
    }
  },
}
