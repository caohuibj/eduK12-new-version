import type { Request, Response } from 'express'
import { hashRecoveryToken, isValidRecoveryToken } from '../../services/anonymousAccess'
import { InstrumentFinalSubmitError, isInstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { compositeItemSlotKey } from '../assessment-runtime/slot-set'
import { error, instrumentError, success } from '../../utils/response'
import { logger } from '../../utils/logger'
import {
  loadEmbeddedSituationalAttemptRuntime,
  loadSituationalAttemptRuntime,
} from './situational-runtime.service'
import { issueFrozenSituationalVideoCapabilities } from './situational-video.service'

const handleError = (res: Response, value: unknown, operation: string) => {
  if (isInstrumentFinalSubmitError(value)) {
    return instrumentError(res, value.code, value.message, value.statusCode)
  }
  logger.error(operation, value)
  return error(res, value instanceof Error ? value.message : '情境化视频请求失败')
}

const embeddedAccess = (req: Request, authorization: { userId?: string; recoveryTokenHash?: string }) => ({
  compositeAttemptId: req.params.attemptId,
  compositeItemId: req.params.itemId,
  compositeSlotKey: compositeItemSlotKey(req.params.itemId, 'SITUATIONAL'),
  ...authorization,
})

const recoveryTokenHash = (req: Request): string => {
  const token = req.headers['x-recovery-token']
  if (!isValidRecoveryToken(token)) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '缺少有效恢复凭证', 403)
  }
  return hashRecoveryToken(token)
}

export const situationalVideoController = {
  async standalone(req: Request, res: Response) {
    try {
      const runtime = await loadSituationalAttemptRuntime(req.params.attemptId, req.user!.userId)
      const sources = await issueFrozenSituationalVideoCapabilities({
        snapshot: runtime.snapshot,
        attemptId: runtime.row.id,
        sceneKey: req.params.sceneKey,
        audience: 'authenticated',
      })
      return success(res, sources)
    } catch (value) {
      return handleError(res, value, '签发情境化视频能力失败')
    }
  },

  async embeddedAuthenticated(req: Request, res: Response) {
    try {
      if (!req.user) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权限访问情境化视频', 403)
      const runtime = await loadEmbeddedSituationalAttemptRuntime(
        req.params.situationalAttemptId,
        embeddedAccess(req, { userId: req.user.userId }),
      )
      const sources = await issueFrozenSituationalVideoCapabilities({
        snapshot: runtime.snapshot,
        attemptId: runtime.row.id,
        sceneKey: req.params.sceneKey,
        audience: 'authenticated',
      })
      return success(res, sources)
    } catch (value) {
      return handleError(res, value, '签发综合测评情境化视频能力失败')
    }
  },

  async embeddedPublic(req: Request, res: Response) {
    try {
      const runtime = await loadEmbeddedSituationalAttemptRuntime(
        req.params.situationalAttemptId,
        embeddedAccess(req, { recoveryTokenHash: recoveryTokenHash(req) }),
      )
      const sources = await issueFrozenSituationalVideoCapabilities({
        snapshot: runtime.snapshot,
        attemptId: runtime.row.id,
        sceneKey: req.params.sceneKey,
        audience: 'public',
      })
      return success(res, sources)
    } catch (value) {
      return handleError(res, value, '签发公开综合测评情境化视频能力失败')
    }
  },
}
