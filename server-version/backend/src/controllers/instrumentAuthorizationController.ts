import { Request, Response } from 'express'
import { prisma } from '../config/database'
import {
  AuthorizationContractError,
  createPrismaAuthorizationRepository,
  type InstrumentAuthorizationRecordV1,
} from '../modules/assessment-authorization'
import { previewScaleInstrument } from '../modules/scale/onboarding/preview'
import { error, success, unauthorized } from '../utils/response'

const repository = createPrismaAuthorizationRepository(prisma)

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
      const list = await repository.list()
      return success(res, { list })
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
      const created = await repository.createDraft({
        ...body,
        createdByUserId: req.user.userId,
      })
      return success(res, created.record, '授权草稿已创建')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async approve(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const approved = await repository.approve({
        authorizationId: String(req.params.authorizationId),
        actorUserId: req.user.userId,
        selfApprovalDeclaration: req.body?.selfApprovalDeclaration ?? null,
      })
      return success(res, { record: approved.record, audit: approved.audit }, '授权已批准')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async revoke(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const revoked = await repository.revoke({
        authorizationId: String(req.params.authorizationId),
        actorUserId: req.user.userId,
        note: String(req.body?.note ?? 'revoked'),
      })
      return success(res, {
        record: revoked.record,
        audit: revoked.audit,
        lineage: revoked.lineage,
      }, '授权谱系已撤销')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async attachEvidence(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const attached = await repository.attachEvidence({
        authorizationId: String(req.params.authorizationId),
        evidenceAssetId: String(req.body?.evidenceAssetId ?? ''),
        evidenceSha256: String(req.body?.evidenceSha256 ?? ''),
        actorUserId: req.user.userId,
      })
      return success(res, { record: attached.record, audit: attached.audit }, '授权证据已挂接')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async publishPreviewScale(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const body = req.body ?? {}
      const instrumentKey = String(body.instrumentKey ?? body.source?.identity?.instrumentKey ?? '')
      const instrumentVersion = String(body.instrumentVersion ?? body.source?.identity?.instrumentVersion ?? '')
      if (!instrumentKey || !instrumentVersion) return error(res, 'instrumentKey 与 instrumentVersion 必填')
      const authorizations = await repository.listLatestByInstrument(instrumentKey)
      const result = previewScaleInstrument({
        source: body.source,
        instrumentKey,
        instrumentVersion,
        authorizations,
        locale: String(body.locale ?? ''),
        territory: String(body.territory ?? ''),
        commercialNature: body.commercialNature === 'COMMERCIAL' ? 'COMMERCIAL' : 'NON_COMMERCIAL',
        deploymentModes: Array.isArray(body.deploymentModes) && body.deploymentModes.length ? body.deploymentModes : ['STANDALONE'],
        authorizationRefs: Array.isArray(body.authorizationRefs) ? body.authorizationRefs : undefined,
      })
      return success(res, result)
    } catch (err) {
      return handleError(res, err)
    }
  },
}
