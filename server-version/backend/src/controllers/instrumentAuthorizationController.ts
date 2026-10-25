import type { Request, Response } from 'express'

/** Compatibility endpoint only: no database reads, mutations or asset access. */
const retired = (_req: Request, res: Response) => res.status(410).json({
  code: 'AUTHORIZATION_RECORDS_RETIRED',
  message: '版权许可台账已退役，不再保存或变更许可记录。',
})

export const instrumentAuthorizationController = {
  retired,
  list: retired,
  create: retired,
  publishPreviewScale: retired,
  approve: retired,
  revoke: retired,
  attachEvidence: retired,
}
