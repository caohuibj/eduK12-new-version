import { Request, Response } from 'express'
import { UserRole } from '../types'
import { prisma } from '../config/database'
import { createPrismaAuthorizationRepository } from '../modules/assessment-authorization'
import { canStudentAccessScale } from '../modules/scale/scale-access'
import { resolveScaleStartDeployment } from '../modules/scale/deployment/service'
import {
  constructDomainSchema,
  intendedUseSchema,
  respondentTypeSchema,
} from '../modules/scale/library/catalog-manifest'
import {
  type ScaleLibraryFilterInput,
  type ScaleLibraryReadModelContext,
} from '../modules/scale/library/scale-library-read-model'
import {
  buildExpandedScaleLibraryReadModel,
  filterExpandedScaleLibraryEntries,
  getExpandedScaleLibraryEntry,
} from '../modules/scale/library/wave1-p1-read-model'
import { enrichExistingP1Evidence } from '../modules/scale/library/wave1-p1-existing-evidence'
import { applyDass21ProductPolicy } from '../modules/scale/library/wave1-dass21-product-policy'
import { WAVE0_SCALE_CATALOG_MANIFESTS } from '../modules/scale/library/wave0-catalog'
import { isValidContentLocaleTag } from '../modules/scale/content-locale'
import { error, notFound, success, unauthorized } from '../utils/response'
import { z } from 'zod'

const authorizationRepository = createPrismaAuthorizationRepository(prisma)

const queryValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string') return value[0]
  return undefined
}

const optionalNumber = z.preprocess((value) => {
  const single = queryValue(value)
  return single === undefined ? undefined : Number(single)
}, z.number().int().min(0).max(100).optional())

const libraryQuerySchema = z.object({
  keyword: z.preprocess(queryValue, z.string().trim().min(1).max(100).optional()),
  instrumentFamily: z.preprocess(queryValue, z.string().trim().min(1).max(100).optional()),
  primaryDomain: z.preprocess(queryValue, constructDomainSchema.optional()),
  secondaryDomain: z.preprocess(queryValue, constructDomainSchema.optional()),
  respondent: z.preprocess(queryValue, respondentTypeSchema.optional()),
  minAge: optionalNumber,
  maxAge: optionalNumber,
  minGrade: z.preprocess((value) => {
    const single = queryValue(value)
    return single === undefined ? undefined : Number(single)
  }, z.number().int().min(1).max(12).optional()),
  maxGrade: z.preprocess((value) => {
    const single = queryValue(value)
    return single === undefined ? undefined : Number(single)
  }, z.number().int().min(1).max(12).optional()),
  locale: z.preprocess(queryValue, z.string().refine(isValidContentLocaleTag, 'locale 必须是合法的语言 tag').optional()),
  territory: z.preprocess(queryValue, z.string().regex(/^[A-Z]{2}$/, 'territory 必须是两位大写国家/地区码').optional()),
  intendedUse: z.preprocess(queryValue, intendedUseSchema.optional()),
  availability: z.preprocess(queryValue, z.enum(['AVAILABLE', 'RESTRICTED', 'NOT_AVAILABLE']).optional()),
}).superRefine((query, ctx) => {
  if (query.minAge !== undefined && query.maxAge !== undefined && query.minAge > query.maxAge) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['minAge'], message: 'minAge 不能大于 maxAge' })
  }
  if (query.minGrade !== undefined && query.maxGrade !== undefined && query.minGrade > query.maxGrade) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['minGrade'], message: 'minGrade 不能大于 maxGrade' })
  }
})

/**
 * Only executable Wave 0 packages can currently have Scale deployment rows.
 * Wave 1 P1 catalog-first entries deliberately have no deployment until their
 * exact-form package / rights / report contract is closed.
 */
const deployedScalePairs = WAVE0_SCALE_CATALOG_MANIFESTS.map((manifest) => ({
  code: manifest.identity.instrumentKey,
  instrumentVersion: manifest.identity.instrumentVersion,
}))

type LibraryDeployment = NonNullable<ScaleLibraryReadModelContext['deployments']>[number] & {
  allowNewStarts: boolean
  startReasons: string[]
}

const loadDeployments = async (req: Request): Promise<LibraryDeployment[]> => {
  const rows = await prisma.scale.findMany({
    where: { OR: deployedScalePairs },
    select: {
      id: true,
      code: true,
      instrumentVersion: true,
      instrumentClass: true,
      status: true,
      visibility: true,
    },
  })
  const deployments: LibraryDeployment[] = []
  for (const row of rows) {
    if (req.user?.role === UserRole.STUDENT) {
      const accessible = await canStudentAccessScale({
        id: row.id,
        status: String(row.status),
        visibility: String(row.visibility),
      }, req.user.userId)
      if (!accessible) continue
    }
    const start = await resolveScaleStartDeployment({
      db: prisma,
      scale: {
        id: row.id,
        code: row.code,
        instrumentVersion: row.instrumentVersion,
        instrumentClass: row.instrumentClass,
        status: String(row.status),
      },
      requestedMode: 'STANDALONE',
    })
    deployments.push({
      scaleId: row.id,
      code: row.code,
      instrumentVersion: row.instrumentVersion,
      status: String(row.status),
      visibility: String(row.visibility),
      allowNewStarts: start.allowNewStarts,
      startReasons: [...start.reasons],
    })
  }
  return deployments
}

const buildContext = async (req: Request, query: z.infer<typeof libraryQuerySchema>): Promise<ScaleLibraryReadModelContext> => ({
  locale: query.locale,
  territory: query.territory,
  respondent: query.respondent,
  authorizations: await authorizationRepository.list(),
  deployments: await loadDeployments(req),
  viewerRole: req.user?.role === UserRole.ADMIN
    ? 'ADMIN'
    : (req.user?.role === UserRole.TEACHER ? 'TEACHER' : 'STUDENT'),
})

const parseQuery = (req: Request): { query?: z.infer<typeof libraryQuerySchema>; message?: string } => {
  const parsed = libraryQuerySchema.safeParse(req.query)
  if (parsed.success) return { query: parsed.data }
  return { message: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('；') }
}

const filterFromQuery = (query: z.infer<typeof libraryQuerySchema>): ScaleLibraryFilterInput => ({
  keyword: query.keyword,
  instrumentFamily: query.instrumentFamily,
  primaryDomain: query.primaryDomain,
  secondaryDomain: query.secondaryDomain,
  respondent: query.respondent,
  minAge: query.minAge,
  maxAge: query.maxAge,
  minGrade: query.minGrade,
  maxGrade: query.maxGrade,
  locale: query.locale,
  intendedUse: query.intendedUse,
  availability: query.availability,
})

const buildLibraryModel = (context: ScaleLibraryReadModelContext) => {
  const base = applyDass21ProductPolicy(
    enrichExistingP1Evidence(buildExpandedScaleLibraryReadModel(context)),
  )
  const deployments = (context.deployments ?? []) as LibraryDeployment[]
  const byIdentity = new Map(deployments.map((deployment) => [
    `${deployment.code}:${deployment.instrumentVersion}`,
    deployment,
  ]))
  return {
    ...base,
    entries: base.entries.map((entry) => {
      const deployment = byIdentity.get(`${entry.identity.instrumentKey}:${entry.identity.instrumentVersion}`)
      if (!deployment || deployment.allowNewStarts) return entry
      const { launch: _launch, ...availability } = entry.availability
      const next = {
        ...entry,
        availability: {
          ...availability,
          status: availability.status === 'NOT_AVAILABLE' ? 'NOT_AVAILABLE' as const : 'RESTRICTED' as const,
          reasons: [...new Set([...availability.reasons, '当前部署策略或授权不允许新启动。'])],
        },
      }
      if (context.viewerRole === 'ADMIN' && next.governance) {
        next.governance = {
          ...next.governance,
          gate: {
            ...next.governance.gate,
            publishable: false,
            errors: [...new Set([...next.governance.gate.errors, ...deployment.startReasons.map((reason) => `new-start:${reason}`)])],
          },
        }
      }
      return next
    }),
  }
}

const handleError = (res: Response, err: unknown) => {
  if (err instanceof Error && err.name === 'ZodError') return error(res, '量表库请求参数无效')
  return error(res, '服务器内部错误', -1, 500)
}

export const scaleLibraryController = {
  async list(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const parsed = parseQuery(req)
      if (!parsed.query) return error(res, parsed.message ?? '量表库筛选条件无效')
      const query = parsed.query
      const model = buildLibraryModel(await buildContext(req, query))
      return success(res, {
        schemaVersion: model.schemaVersion,
        generatedAt: model.generatedAt,
        entries: filterExpandedScaleLibraryEntries(model.entries, filterFromQuery(query)),
      })
    } catch (err) {
      return handleError(res, err)
    }
  },

  async detail(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const parsed = parseQuery(req)
      if (!parsed.query) return error(res, parsed.message ?? '量表库筛选条件无效')
      const model = buildLibraryModel(await buildContext(req, parsed.query))
      const entry = getExpandedScaleLibraryEntry(model, String(req.params.instrumentKey), String(req.params.instrumentVersion))
      if (!entry) return notFound(res, '量表库条目不存在')
      return success(res, { entry })
    } catch (err) {
      return handleError(res, err)
    }
  },
}
