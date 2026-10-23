import { z } from 'zod'
import { asyncHandler } from '../../middleware/asyncHandler'
import { success, unauthorized } from '../../utils/response'
import { resolveEducationToolAuthoringCapabilities, type EducationToolEntry } from './access'

// The entry is supplied only by the authenticated product router, never the
// query/body. This hint is not an editor, a write permit, or publication access.
export const educationToolAuthoringCapabilitiesHandler = (entry: EducationToolEntry) =>
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!req.user) return unauthorized(res)
    const organizationId = z.string().uuid().safeParse(req.params.organizationId)
    if (!organizationId.success) return res.status(400).json({
      code: 'BAD_REQUEST', message: '学校组织参数无效', data: null,
    })
    // Missing/revoked authority and unknown organizations intentionally share
    // the same false response. Unexpected database errors still propagate.
    return success(res, await resolveEducationToolAuthoringCapabilities({
      principal: req.user, organizationId: organizationId.data, entry,
    }))
  })
