import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../../../config/database'
import { requireRecentAdminKey } from '../../admin-permissions/guards'
import { success, error } from '../../../utils/response'
import { BAD_REQUEST, CognitiveServiceError } from '../cognitive.errors'
import { cognitiveSeeds } from '../generated/seeds'
import { getCognitiveRegistryEntry } from '../cognitive.registry'
import { isCognitiveNewAdmissionEnabled } from '../product-eligibility'
import { cognitiveInstallSelectionSchema, planCognitiveConfigInstall, installCognitiveConfigs, type CognitiveInstallRow } from './install'
import { listCognitiveDraftInstallCandidates, pendingCognitiveInstallCandidates, sameCognitiveInstallIdentity } from './admin-catalog'

/** Mounted under the existing authenticated SYSTEM_ADMIN permissions router.
 * Inputs select registered code-owned seeds; they never name files or commands. */
export const cognitiveIntakeAdminRouter: Router = Router()
cognitiveIntakeAdminRouter.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })

function registeredSelection(raw: unknown) {
  const selection = cognitiveInstallSelectionSchema.parse(raw)
  if (selection.items.some(item => !listCognitiveDraftInstallCandidates().some(candidate => sameCognitiveInstallIdentity(candidate, item)))) {
    throw BAD_REQUEST('只能选择当前代码登记的推荐草稿精确版本；未登记或其他版本不能入库')
  }
  return selection
}

const handle = (work: (req: Request) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return error(res, '需要当前系统管理员身份', -1, 401)
    return success(res, await work(req))
  } catch (caught) {
    if (caught instanceof z.ZodError) return error(res, '请选择清单中的精确版本，不接受配置、路径、命令或代码字段', -1, 400)
    if (caught instanceof CognitiveServiceError) return error(res, caught.message, -1, caught.statusCode)
    if (caught instanceof Error && caught.message === 'ACTIVE_SYSTEM_ADMIN_REQUIRED') return error(res, '需要当前有效的系统管理员身份', -1, 403)
    return next(caught)
  }
}

cognitiveIntakeAdminRouter.get('/', handle(async req => {
  const items = listCognitiveDraftInstallCandidates()
  // A paused module remains readable; do not invent a database lifecycle state.
  const rows: CognitiveInstallRow[] = !items.length ? [] : isCognitiveNewAdmissionEnabled()
    ? (await planCognitiveConfigInstall(prisma, { schemaVersion: 1, items }, req.user!.userId)).rows
    : items.map(item => ({ ...item, action: 'BLOCKED', reasons: ['认知模块当前暂停新入库；本次未读取已有配置状态'] }))
  return {
    schemaVersion: 1,
    registered: items.map((candidate, index) => {
      const seed = cognitiveSeeds.find(item => sameCognitiveInstallIdentity(item, candidate))
      const entry = getCognitiveRegistryEntry(candidate.testType, candidate.engineVersion, candidate.scoringVersion)
      return {
        ...candidate,
        name: entry?.name ?? seed?.name ?? candidate.testType,
        reportVersion: entry?.reportDefinitionVersion ?? null,
        profiles: Object.values(entry?.profiles ?? {}).map(profile => ({ key: profile.profile, estimatedMinutes: profile.estimatedMinutes })),
        reportMetrics: Object.values(entry?.metricDefinitions ?? {}).filter(metric => metric.role !== 'research_only').map(metric => metric.label),
        plan: rows[index],
      }
    }),
    pending: pendingCognitiveInstallCandidates.filter(candidate => !cognitiveSeeds.some(seed => seed.testType === candidate.testType)),
  }
}))

cognitiveIntakeAdminRouter.post('/preview', requireRecentAdminKey, handle(req =>
  planCognitiveConfigInstall(prisma, registeredSelection(req.body), req.user!.userId)))

cognitiveIntakeAdminRouter.post('/install', requireRecentAdminKey, handle(req =>
  installCognitiveConfigs(prisma, registeredSelection(req.body), req.user!.userId)))
