import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../config/database'
import { authenticate, requireTeacher } from '../middleware/auth'
import { success, error } from '../utils/response'
import { signKnownAsset } from '../services/assetStorage'
import { mediaGrantFilter, mediaLibraryFilter } from '../services/workspaceMedia'
import { config } from '../config'
import { listPublishedConfigs } from '../modules/cognitive/assignment.service'
import { listSituationalResourceSummaries } from '../modules/situational/situational-release.service'
import { bundleProductService } from '../modules/bundle-product/service'

const router = Router()
router.use(authenticate, requireTeacher)
export const workspaceQuery = z.object({
  keyword: z.string().trim().max(200).default(''),
  kind: z.string().max(24).default('all'), source: z.enum(['all','owned','granted']).default('all'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(40).default(12),
}).strict()
const handle = (fn: (req: any) => Promise<unknown>) => async (req: any, res: any, next: any) => {
  try { return success(res, await fn(req)) } catch (cause) {
    if (cause instanceof z.ZodError) return error(res, '检索条件无效', -1, 400)
    return next(cause)
  }
}

const mediaRows = Prisma.sql`SELECT a.id, a.id AS "assetId", a.original_name AS "originalName",
  COALESCE(v.title,d.title,a.original_name,'未命名媒体') AS name,
  a.owner_id AS "ownerId", a.mime_type AS "mimeType", a.size_bytes AS size, a.created_at AS "updatedAt",
  a.provider, a.access_scope AS "accessScope", a.deleted_at AS "deletedAt",
  CASE WHEN a.mime_type LIKE 'image/%' THEN 'image' WHEN a.mime_type LIKE 'video/%' THEN 'video' ELSE 'document' END AS kind
  FROM stored_assets a JOIN users u ON u.id=a.owner_id
  LEFT JOIN videos v ON v.original_asset_id=a.id LEFT JOIN documents d ON d.asset_id=a.id`
router.get('/media', handle(async req => {
  const q = workspaceQuery.parse(req.query), actor = req.user.userId
  const filter = Prisma.sql`${mediaLibraryFilter} AND (a.owner_id=${actor} OR (${mediaGrantFilter(actor)}))`
  const where = Prisma.sql`POSITION(LOWER(${q.keyword}) IN LOWER(r.name))>0
    AND (${q.kind}='all' OR r.kind=${q.kind})
    AND (${q.source}='all' OR (${q.source}='owned' AND r."ownerId"=${actor}) OR (${q.source}='granted' AND r."ownerId"<>${actor}))`
  const [list, count] = await prisma.$transaction([
    prisma.$queryRaw<any[]>(Prisma.sql`WITH r AS (${mediaRows} WHERE ${filter}) SELECT * FROM r WHERE ${where} ORDER BY "updatedAt" DESC,id LIMIT ${q.pageSize} OFFSET ${(q.page-1)*q.pageSize}`),
    prisma.$queryRaw<{total:bigint}[]>(Prisma.sql`WITH r AS (${mediaRows} WHERE ${filter}) SELECT COUNT(*)::bigint AS total FROM r WHERE ${where}`),
  ])
  return { list: list.map(row => ({ ...row, source: row.ownerId === actor ? 'owned':'granted', url: signKnownAsset(row) })),
    total: Number(count[0]?.total || 0), page:q.page, pageSize:q.pageSize, hasMore:q.page*q.pageSize<Number(count[0]?.total || 0) }
}))
router.patch('/media/:id/name', handle(async req => {
  const { name } = z.object({ name:z.string().trim().min(1).max(160).refine(value => !/[\\/\0]/.test(value)) }).strict().parse(req.body)
  // Lock the exact asset while updating the display metadata in related libraries.
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT a.id FROM stored_assets a JOIN users u ON u.id=a.owner_id
      WHERE a.id=${req.params.id} AND a.owner_id=${req.user.userId} AND ${mediaLibraryFilter} FOR UPDATE OF a`)
    if (!rows.length) throw Object.assign(new Error('媒体不存在或无权改名'), {statusCode:403})
    await tx.storedAsset.update({where:{id:req.params.id},data:{originalName:name}})
    await tx.video.updateMany({where:{originalAssetId:req.params.id,teacherId:req.user.userId},data:{title:name}})
    await tx.document.updateMany({where:{assetId:req.params.id,teacherId:req.user.userId},data:{title:name}})
    return {id:req.params.id,name}
  })
}))

// Catalog services retain their scientific eligibility checks. Search responses
// expose only descriptors, never scoring definitions, responses or reports.
router.get('/tools', handle(async req => {
  const q=workspaceQuery.parse(req.query), actor=req.user.userId
  const [cognitive,situational,bundles] = await Promise.all([
    listPublishedConfigs(actor,req.user.role), listSituationalResourceSummaries(actor), bundleProductService.catalog(req.user),
  ])
  const extra = [
    ...cognitive.map(row=>({id:row.id,kind:'cognitive',name:row.name,version:row.configVersion,href:'/cognitive-assignments'})),
    ...situational.map(row=>({id:row.id,kind:'situational',name:row.name || row.instrumentKey,version:row.instrumentVersion,href:'/questionnaire-products/new'})),
    ...bundles.filter(row=>row.canInstantiate).map(row=>({id:row.bundleKey+'@'+row.bundleVersion,kind:'bundle',name:row.name,version:row.bundleVersion,href:'/bundle-products'})),
  ].map(row=>Prisma.sql`SELECT ${row.id}::text AS id,${row.kind}::text AS kind,${row.name}::text AS name,NULL::text AS description,
    'PUBLISHED'::text AS status,${row.version}::text AS version,NULL::text AS "ownerId",NULL::timestamptz AS "updatedAt",${row.href}::text AS href,false AS "canUpdateVersion"`)
  const rows=Prisma.sql`
    SELECT s.id,'scale'::text AS kind,s.name,s.description,s.status::text AS status,s.instrument_version AS version,s.creator_id AS "ownerId",s.updated_at AS "updatedAt",'/scales/'||s.id AS href,(s.creator_id=${actor} AND s.status='PUBLISHED' AND s.instrument_class='CUSTOM_DESCRIPTIVE' AND s.definition #>> '{license,status}'='self_authored' AND s.definition #>> '{license,redistribution}'='allowed') AS "canUpdateVersion"
      FROM scales s JOIN users u ON u.id=s.creator_id WHERE u.account_domain IN ('LEGACY','TRAINING') AND (s.creator_id=${actor}
      OR (${config.materialGrantsEnabled} AND s.status='PUBLISHED' AND EXISTS (SELECT 1 FROM material_grants g WHERE g.teacher_id=${actor} AND g.resource_type::text='SCALE' AND g.resource_id=s.id)))
    UNION ALL SELECT f.id,'form',f.name,f.description,f.status::text,NULL,f.creator_id,f.updated_at,'/general-questionnaires/'||f.id||'/edit',(f.creator_id=${actor} AND f.status='PUBLISHED')
      FROM questionnaires f JOIN users u ON u.id=f.creator_id WHERE f.type='GENERAL' AND NOT EXISTS(SELECT 1 FROM questionnaire_scales s WHERE s.questionnaire_id=f.id) AND u.account_domain IN ('LEGACY','TRAINING')
      AND (f.creator_id=${actor} OR (${config.materialGrantsEnabled} AND f.status='PUBLISHED'
        AND NOT EXISTS(SELECT 1 FROM questionnaire_scales s WHERE s.questionnaire_id=f.id)
        AND EXISTS(SELECT 1 FROM material_grants g WHERE g.teacher_id=${actor} AND g.resource_type::text='FORM_TEMPLATE' AND g.resource_id=f.id)))
    UNION ALL SELECT c.id,CASE WHEN c.product_kind='FORM_TEMPLATE' THEN 'form-template' WHEN EXISTS(SELECT 1 FROM composite_assessment_items i WHERE i.composite_assessment_id=c.id AND i.type='FORM') AND NOT EXISTS(SELECT 1 FROM composite_assessment_items i WHERE i.composite_assessment_id=c.id AND i.type<>'FORM') THEN 'form-composition' ELSE 'composition' END,c.name,c.description,c.status::text,c.revision::text,c.created_by,c.updated_at,CASE WHEN c.product_kind='FORM_TEMPLATE' THEN '/toolkit/forms/'||c.id ELSE '/toolkit/compositions/'||c.id END,(c.status='PUBLISHED')
      FROM composite_assessments c WHERE c.product_kind IN ('QUESTIONNAIRE','FORM_TEMPLATE') AND c.created_by=${actor} AND c.status<>'ARCHIVED'
    UNION ALL SELECT s.id,'sjt-draft',COALESCE(s.template->>'title','情境判断'),NULL,s.status,s.template->>'instrumentVersion',s.owner_id,s.updated_at,'/sjt-authoring?draftId='||s.id,(s.status='PUBLISHED')
      FROM sjt_author_drafts s WHERE s.owner_id=${actor}
    UNION ALL SELECT r.id,'situational',COALESCE(r.package #>> '{definition,source,title}',r.instrument_key),NULL,r.status,r.instrument_version,NULL,r.created_at,'/teacher/situational',false
      FROM sjt_author_releases r WHERE r.author_id<>${actor} AND r.status='PUBLISHED'
      AND r.package #>> '{definition,respondentType}'='teacher_self_report'
      AND EXISTS(SELECT 1 FROM sjt_release_grants g JOIN courses c ON c.id=g.course_id
        WHERE g.release_id=r.id AND g.grantee_teacher_id=${actor} AND g.instrument_key=r.instrument_key AND g.instrument_version=r.instrument_version
          AND g.definition_hash=r.definition_hash AND g.content_digest=r.content_digest AND g.permission='DISTRIBUTE' AND g.purpose='TRAINING_COURSE'
          AND g.status='ACTIVE' AND g.valid_from<=CURRENT_TIMESTAMP AND g.expires_at>CURRENT_TIMESTAMP
          AND c.creator_id=g.grantee_teacher_id AND c.course_type='TRAINING_COURSE' AND NOT c.is_library)
    ${extra.length ? Prisma.sql`UNION ALL ${Prisma.join(extra,' UNION ALL ')}`:Prisma.empty}`
  const where=Prisma.sql`POSITION(LOWER(${q.keyword}) IN LOWER(r.name||' '||COALESCE(r.description,'')))>0
    AND (${q.kind}='all' OR r.kind=${q.kind} OR (${q.kind}='form' AND r.kind IN ('form-composition','form-template')) OR (${q.kind}='situational' AND r.kind='sjt-draft') OR (${q.kind}='composition' AND r.kind='bundle'))
    AND (${q.source}='all' OR (${q.source}='owned' AND r."ownerId"=${actor}) OR (${q.source}='granted' AND r."ownerId" IS DISTINCT FROM ${actor}))`
  const [list,count]=await prisma.$transaction([
    prisma.$queryRaw<any[]>(Prisma.sql`WITH r AS (${rows}) SELECT * FROM r WHERE ${where} ORDER BY "updatedAt" DESC NULLS LAST,kind,id LIMIT ${q.pageSize} OFFSET ${(q.page-1)*q.pageSize}`),
    prisma.$queryRaw<{total:bigint}[]>(Prisma.sql`WITH r AS (${rows}) SELECT COUNT(*)::bigint AS total FROM r WHERE ${where}`),
  ])
  return { list:list.map(row=>({...row,source:row.ownerId===actor?'owned':'granted'})),total:Number(count[0]?.total||0),page:q.page,pageSize:q.pageSize }
}))
export default router
