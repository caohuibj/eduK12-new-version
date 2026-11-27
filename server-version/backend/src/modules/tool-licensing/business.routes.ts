import type { RequestHandler } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../middleware/asyncHandler'
import { forbidden, success } from '../../utils/response'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'
import { resolveEducationToolAuthoringContext } from '../education-tools/access'
import { resolveOrganizationAccessContext } from '../organization/access'
import type { ToolLicenseProduct } from './contracts'
import { readOwnToolLicense } from './management'

const organizationId = z.string().guid()

export function ownToolLicenseHandler(product: ToolLicenseProduct): RequestHandler {
  return asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const user = req.user!
    if (product === 'TRAINING') {
      if (!['TRAINING', 'LEGACY'].includes(user.accountDomain ?? '') || user.platformRole !== 'STANDARD'
        || (user.businessRole ?? user.role) !== 'TEACHER' || !user.teacherApproved) return forbidden(res)
      return success(res, await readOwnToolLicense(product, user.userId, user.userId))
    }
    if (product === 'SURVEY') {
      if (user.accountDomain !== 'SURVEY' || user.platformRole !== 'STANDARD') return forbidden(res)
      return success(res, await readOwnToolLicense(product, user.userId, user.userId))
    }
    const resolved = organizationId.safeParse(req.params.organizationId)
    if (!resolved.success || user.accountDomain !== 'SCHOOL') return forbidden(res)
    const publisher = product === 'SCHOOL'
      ? (await resolveOrganizationAccessContext({ principal: user, organizationId: resolved.data }))?.canGovern
        || await resolveEducationToolAuthoringContext({ principal: user, organizationId: resolved.data, entry: 'SCHOOL' })
      : (await resolveEducationProductMemberScope({
        actorUserId: user.userId, organizationId: resolved.data, product: 'HUITEACHER',
      }))?.productAdmin
    if (!publisher) return forbidden(res)
    return success(res, await readOwnToolLicense(product, resolved.data, user.userId))
  })
}
