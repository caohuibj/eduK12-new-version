import { Prisma } from '@prisma/client'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { error, forbidden, success } from '../../utils/response'
import { requireRecentAdminKey } from '../admin-permissions/guards'
import { ADMIN_STEP_UP_SECONDS, validAdminProof, type AdminSessionProof } from '../admin-permissions/proof'
import { AdminPermissionError, assertEntryAdmin, lockAdminMutation, type AdminEntry } from '../admin-permissions/service'
import { toolLicenseKeySchema, toolLicenseProductSchema, type ToolLicenseProduct } from './contracts'
import { tagView, toolTagChangeFields, toolTagInput, writeStoredToolTags, type StoredToolTags } from './tag-storage'
import { licenseToolDirectorySql, requireLicenseTools, type LicenseTool } from './directory'

const maxCatalogRows = 2000
const pageSize = 25
const entryByProduct: Record<ToolLicenseProduct, AdminEntry> = {
  SCHOOL: 'HUISCHOOL', TEACHER: 'HUITEACHER', TRAINING: 'TRAINING', SURVEY: 'SURVEY',
}

type TaggedToolRow = LicenseTool & StoredToolTags
type TaggedTool = LicenseTool & { tags: string[]; revision: number }
type Tag = z.output<typeof toolTagInput>

const productQuery = z.object({ product: toolLicenseProductSchema })
const catalogQuery = productQuery.extend({
  q: z.string().trim().max(160).default(''),
  key: toolLicenseKeySchema.optional(),
  tag: toolTagInput.optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
}).strict()
const matchQuery = productQuery.extend({ tag: toolTagInput }).strict()
const changeInput = productQuery.extend({
  toolKey: toolLicenseKeySchema,
  ...toolTagChangeFields
}).strict()

const taggedTool = ({ key, name, family, labels, revision }: TaggedToolRow): TaggedTool =>
  ({ key, name, family, ...tagView({labels,revision}) })

// The commercial directory provides the exact same currently eligible tool keys
// here and during license issuance. Labels are editorial metadata only.
const tagSource = (product: ToolLicenseProduct) => Prisma.sql`
  FROM (${licenseToolDirectorySql(product)}) eligible
  LEFT JOIN tool_catalog_tag_sets labels ON labels.product=${product} AND labels.tool_key=eligible.key`
const matching = (tag: Tag | undefined) => tag
  ? Prisma.sql`AND labels.labels @> ${JSON.stringify([{ key: tag.key }])}::jsonb`
  : Prisma.empty

async function readTaggedRows(input: z.output<typeof catalogQuery>, limit: number) {
  const { product, q, key, tag, page } = input
  return prisma.$queryRaw<TaggedToolRow[]>(Prisma.sql`
    SELECT eligible.key,eligible.name,eligible.family,COALESCE(labels.revision,0) AS revision,
      COALESCE(labels.labels,'[]'::jsonb) AS labels
    ${tagSource(product)}
    WHERE (${q}='' OR strpos(lower(eligible.name),lower(${q}))>0 OR strpos(lower(eligible.key),lower(${q}))>0)
      ${key ? Prisma.sql`AND eligible.key=${key}` : Prisma.empty}
      ${matching(tag)}
    ORDER BY eligible.key COLLATE "C" LIMIT ${limit} OFFSET ${(page-1)*pageSize}`)
}

export async function listToolCatalogTags(raw: unknown) {
  const rows = await readTaggedRows(catalogQuery.parse(raw), pageSize+1)
  return { list: rows.slice(0,pageSize).map(taggedTool), hasMore: rows.length>pageSize }
}

export async function listTaggedLicenseTools(raw: unknown) {
  const input = matchQuery.parse(raw)
  const rows = await readTaggedRows({ ...input, q: '', page: 1 }, maxCatalogRows+1)
  if (rows.length>maxCatalogRows) throw new AdminPermissionError(409,'该标签匹配超过 2000 项工具，请缩小工具范围')
  return { list: rows.map(taggedTool) }
}

export async function listManagedToolLabels(raw: unknown) {
  const { product } = productQuery.strict().parse(raw)
  const rows = await prisma.$queryRaw<Array<{ label: string }>>(Prisma.sql`
    SELECT min((tag.value->>'label') COLLATE "C") AS label
    ${tagSource(product)}
    CROSS JOIN LATERAL jsonb_array_elements(labels.labels) tag
    GROUP BY tag.value->>'key'
    ORDER BY label`)
  return { availableTags: rows.map(row => row.label) }
}

type Actor = { actorUserId: string; actorSession: AdminSessionProof; platformRole?: string }
export async function updateToolCatalogTags(actor: Actor, raw: unknown) {
  const { product, toolKey, tags, expectedRevision } = changeInput.parse(raw)
  return prisma.$transaction(async tx => {
    if (actor.platformRole==='SYSTEM_ADMIN') {
      await lockAdminMutation(tx,actor)
    } else {
      await assertEntryAdmin(tx,actor.actorUserId,entryByProduct[product])
      const user = await tx.user.findUnique({ where: { id: actor.actorUserId }, select: { tokenVersion: true } })
      if (user?.tokenVersion!==actor.actorSession.tokenVersion || !validAdminProof(actor.actorSession,ADMIN_STEP_UP_SECONDS))
        throw new AdminPermissionError(403,'操作者会话已失效或需要重新验证')
    }
    const [tool] = await requireLicenseTools(tx,product,[toolKey])
    const result = await writeStoredToolTags(tx,product,toolKey,actor.actorUserId,tags,expectedRevision)
    return taggedTool({ ...tool, ...result })
  })
}

function handler(action: (req: Request) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control','no-store')
    try {
      const product = toolLicenseProductSchema.parse(req.method==='PUT' ? req.body?.product : req.query.product)
      const user = req.user
      if (user?.platformRole!=='SYSTEM_ADMIN'
        && !(user?.platformRole==='STANDARD' && user.entryGrants?.some(grant=>grant.entry===entryByProduct[product])))
        return forbidden(res,'缺少当前入口管理授权')
      return success(res,await action(req))
    } catch (cause) {
      if (cause instanceof AdminPermissionError) return error(res,cause.message,-1,cause.statusCode)
      if (cause instanceof z.ZodError) return error(res,'工具标签请求格式不合法，请核对标签和产品入口',-1,400)
      next(cause)
    }
  }
}

// Mount behind authenticated, origin-guarded admin management routes.
export const tagCatalogRouter = Router()
tagCatalogRouter.get('/',handler(req=>listToolCatalogTags(req.query)))
tagCatalogRouter.get('/labels',handler(req=>listManagedToolLabels(req.query)))
tagCatalogRouter.get('/matches',handler(req=>listTaggedLicenseTools(req.query)))
tagCatalogRouter.put('/',requireRecentAdminKey,handler(req=>updateToolCatalogTags({
  actorUserId:req.user!.userId,actorSession:req.user!,platformRole:req.user!.platformRole,
},req.body)))
