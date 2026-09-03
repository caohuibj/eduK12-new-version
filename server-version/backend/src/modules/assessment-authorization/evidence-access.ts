import { authorizationFail } from './errors'

export interface PrivateEvidenceAssetRefV1 {
  assetId: string
  sha256: string
  accessScope: 'PRIVATE' | 'ADMIN' | 'PUBLIC'
  ownerAdminUserId: string
}

/**
 * Private authorization evidence assets are admin-only.
 * Non-admin / wrong-admin access is an IDOR failure.
 */
export const assertCanReadAuthorizationEvidence = (input: {
  asset: PrivateEvidenceAssetRefV1
  actorUserId: string
  actorRole: 'ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT' | string
}): void => {
  if (input.actorRole !== 'ADMIN') {
    authorizationFail('AUTH_EVIDENCE_IDOR', '非管理员不得读取授权证据资产')
  }
  if (input.asset.accessScope === 'PUBLIC') {
    authorizationFail('AUTH_EVIDENCE_SCOPE', '授权证据不得使用 PUBLIC scope')
  }
  if (input.asset.ownerAdminUserId !== input.actorUserId && input.asset.accessScope === 'PRIVATE') {
    // Other admins may read ADMIN-scoped assets; PRIVATE is owner-admin only.
    if (input.asset.accessScope === 'PRIVATE') {
      authorizationFail('AUTH_EVIDENCE_IDOR', 'PRIVATE 授权证据仅所属管理员可读')
    }
  }
}

export const assertCanReadAuthorizationEvidenceAsAdmin = (input: {
  asset: PrivateEvidenceAssetRefV1
  actorUserId: string
  actorRole: string
}): void => {
  if (input.actorRole !== 'ADMIN') {
    authorizationFail('AUTH_EVIDENCE_IDOR', '非管理员不得读取授权证据资产')
  }
  if (input.asset.accessScope === 'PUBLIC') {
    authorizationFail('AUTH_EVIDENCE_SCOPE', '授权证据不得使用 PUBLIC scope')
  }
  if (input.asset.accessScope === 'PRIVATE' && input.asset.ownerAdminUserId !== input.actorUserId) {
    authorizationFail('AUTH_EVIDENCE_IDOR', 'PRIVATE 授权证据仅所属管理员可读')
  }
}
