import {libraryReadableScaleIds} from '../modules/scale-library-governance/readers'
import {assertLibraryUseGrantCurrent} from '../modules/scale-library-governance/usage'
import {ScaleLibraryError} from '../modules/scale-library-governance/contracts'
import {ContentAuthorityError} from '../modules/measurement-content/content-authority'
import { MaterialResourceType, UserRole, Prisma } from '@prisma/client'
import { prisma } from '../config/database'
import { config } from '../config'
import {
  getReportPackageByResourceId,
  getReportPackageDefinition,
  reportPackageResourceId,
} from '../modules/cognitive-analysis/report-package.registry'

export class MaterialGrantError extends Error {
  statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'MaterialGrantError'
    this.statusCode = statusCode
  }
}

export type ScaleSource = 'owned' | 'granted' | 'other'

export const reportPackageGrantId = reportPackageResourceId

const grantNotFound = (message = '授权记录不存在') => new MaterialGrantError(message, 404)
const grantBadRequest = (message: string) => new MaterialGrantError(message, 400)

const isEligibleTeacher = (user: {
  role: UserRole | string
  teacherApproved?: boolean | null
  isActive?: boolean | null
  isFrozen?: boolean | null
}) =>
  user.role === UserRole.TEACHER
  && user.teacherApproved === true
  && user.isActive === true
  && user.isFrozen === false

export const scaleSource = (
  userId: string,
  role: UserRole | string,
  scale: { creatorId: string; libraryEntryId?:string|null },
): ScaleSource => {
  if (scale.libraryEntryId) return 'granted'
  if (scale.creatorId === userId) return 'owned'
  if (role === UserRole.ADMIN) return 'other'
  return 'granted'
}

export const grantedResourceIds = async (userId: string, resourceType: MaterialResourceType): Promise<string[]> => {
  if (!config.materialGrantsEnabled) {
    if(resourceType!==MaterialResourceType.SCALE)return []
    const governed=await prisma.$queryRaw<Array<{source_id:string}>>`SELECT m.resource_id AS source_id FROM scale_library_use_grants g JOIN scale_library_entries e ON e.id=g.entry_id JOIN material_grants m ON m.id=g.material_grant_id WHERE g.user_id=${userId} AND g.product='TRAINING' AND g.status='ACTIVE' AND e.status='ACTIVE'`
    return governed.map(row=>row.source_id)
  }
  const rows = await prisma.materialGrant.findMany({
    where: { teacherId: userId, resourceType },
    select: { resourceId: true },
  })
  return rows.map((row) => row.resourceId)
}

/** SQL mode exposes the same viewer scope for the opt-in header paginator;
 * source filters stay in the catalog query. Existing ORM callers are unchanged. */
export function scaleWhereForViewer(userId:string,role:UserRole|string,extra?:Record<string,unknown>):Promise<Prisma.ScaleWhereInput>
export function scaleWhereForViewer(userId:string,role:UserRole|string,extra:Record<string,unknown>,format:'sql'):Promise<Prisma.Sql>
export async function scaleWhereForViewer(userId:string,role:UserRole|string,extra:Record<string,unknown>={},format?:'sql'):Promise<Prisma.ScaleWhereInput|Prisma.Sql>{
  if(role!==UserRole.ADMIN&&role!==UserRole.TEACHER)return format==='sql'?Prisma.sql`TRUE`:extra
  const readable=await libraryReadableScaleIds(userId)
  if(role===UserRole.ADMIN)return format==='sql'
    ?readable.systemAdmin?Prisma.sql`TRUE`:Prisma.sql`(s.library_entry_id IS NULL OR s.id=ANY(${readable.ids}::text[]))`
    :readable.systemAdmin?extra:{...extra,OR:[{libraryEntryId:null},{id:{in:readable.ids}}]}
  const grantedIds=await grantedResourceIds(userId,MaterialResourceType.SCALE)
  if(format==='sql')return Prisma.sql`((s.creator_id=${userId} AND s.library_entry_id IS NULL)
    OR (s.id=ANY(${grantedIds}::text[]) AND s.status='PUBLISHED' AND s.library_entry_id IS NULL)
    OR (s.id=ANY(${readable.ids}::text[]) AND s.status='PUBLISHED'))`
  return {...extra,OR:[{creatorId:userId,libraryEntryId:null},
    {id:{in:grantedIds},status:'PUBLISHED',libraryEntryId:null},{id:{in:readable.ids},status:'PUBLISHED'}]}
}

// 撤销 grant 只拦新的 addItem / addScale / 空白 createAssignment。
// 新公库使用在草稿发布时再次验证；已发布冻结容器不受普通撤权影响。
/** Every projected scale passed to canUseScale must retain these fields. */
export const SCALE_USE_AUTHORIZATION_SELECT = { id: true, creatorId: true, status: true } as const

export const canUseScale = async (
  userId: string,
  role: UserRole | string,
  scale: { id: string; creatorId: string; status: string },
  db: Pick<typeof prisma, 'materialGrant' | '$queryRaw'> = prisma,
): Promise<boolean> => {
  const check=async(tx:Prisma.TransactionClient)=>{
    const [identity]=await tx.$queryRaw<Array<{library_entry_id:string|null}>>`SELECT library_entry_id FROM scales WHERE id=${scale.id}`
    if(!identity?.library_entry_id&&scale.creatorId===userId)return true
    const governed=await tx.$queryRaw<Array<{entry_id:string;status:string}>>`SELECT g.entry_id,g.status FROM scale_library_use_grants g
      JOIN material_grants m ON m.id=g.material_grant_id
      WHERE g.user_id=${userId} AND g.product='TRAINING' AND m.resource_id=${scale.id} ORDER BY g.created_at DESC LIMIT 1`
    if(governed.length){
      if(scale.status!=='PUBLISHED'||governed[0].status!=='ACTIVE')return false
      try{await assertLibraryUseGrantCurrent(tx,{entryId:governed[0].entry_id,userId,product:'TRAINING'});return true}
      catch(e){if(e instanceof ScaleLibraryError||e instanceof ContentAuthorityError)return false;throw e}
    }
    if(identity?.library_entry_id)return false
    const library=await tx.$queryRaw<Array<{id:string}>>`SELECT e.id FROM scale_library_entries e JOIN scale_library_submissions s ON s.id=e.submission_id WHERE s.source_id=${scale.id} LIMIT 1`
    // Legacy ADMIN visibility is not a new platform-library use grant.
    if(role===UserRole.ADMIN&&!library.length)return true
    if(!config.materialGrantsEnabled||scale.status!=='PUBLISHED')return false
    const legacy=await tx.materialGrant.findUnique({where:{teacherId_resourceType_resourceId:{teacherId:userId,resourceType:MaterialResourceType.SCALE,resourceId:scale.id}}})
    return Boolean(legacy&&(!library.length||legacy.legacyScaleGrant))
  }
  return db===prisma?prisma.$transaction(check):check(db as Prisma.TransactionClient)
}

export const canInstantiateConfig = async (
  userId: string,
  role: UserRole | string,
  testConfig: { id: string; status: string; accessPolicy?: 'OPEN' | 'GRANT' | string | null },
): Promise<boolean> => {
  const {hasTrainingCognitiveProfileHistory}=await import('../modules/assessment-authorization/training-cognitive-profile-use')
  if(await hasTrainingCognitiveProfileHistory(prisma,userId,testConfig.id))return false
  if (role === UserRole.ADMIN) return true
  if (testConfig.status !== 'PUBLISHED') return false
  if (!config.materialGrantsEnabled) return true
  if (testConfig.accessPolicy !== 'GRANT') return true
  const grant = await prisma.materialGrant.findUnique({
    where: {
      teacherId_resourceType_resourceId: {
        teacherId: userId,
        resourceType: MaterialResourceType.COGNITIVE_CONFIG,
        resourceId: testConfig.id,
      },
    },
  })
  return Boolean(grant)
}

export const canUseReportPackage = async (
  userId: string,
  role: UserRole | string,
  packageKey: string,
  packageVersion: string,
): Promise<boolean> => {
  const definition = getReportPackageDefinition(packageKey, packageVersion)
  if (!definition || definition.status !== 'PUBLISHED') return false
  if (role === UserRole.ADMIN) return true
  if (role !== UserRole.TEACHER || !config.materialGrantsEnabled) return false
  const grant = await prisma.materialGrant.findUnique({
    where: {
      teacherId_resourceType_resourceId: {
        teacherId: userId,
        resourceType: MaterialResourceType.REPORT_PACKAGE,
        resourceId: reportPackageResourceId(packageKey, packageVersion),
      },
    },
  })
  return Boolean(grant)
}

const TEACHER_ELIGIBILITY_SELECT = {
  role: true, teacherApproved: true, isActive: true, isFrozen: true,
} as const

const assertEligibleTeacher = async (teacherId: string) => {
  const teacher = await prisma.user.findUnique({ where: { id: teacherId }, select: TEACHER_ELIGIBILITY_SELECT })
  if (!teacher) throw grantNotFound('教师不存在')
  if (!isEligibleTeacher(teacher)) throw grantBadRequest('只能授权给已审核且未冻结的在职教师')
  return teacher
}

const assertGrantableResource = async (resourceType: MaterialResourceType, resourceId: string) => {
  if (resourceType === MaterialResourceType.FORM_TEMPLATE) {
    const form = await prisma.questionnaire.findFirst({where:{id:resourceId,type:'GENERAL',status:'PUBLISHED',creator:{accountDomain:{in:['LEGACY','TRAINING']}},questionnaireScales:{none:{}}},select:{id:true}})
    if (!form) throw grantBadRequest('只能授权已发布的独立表单；含量表的组合内容需分别取得量表授权')
    return
  }
  if (resourceType === MaterialResourceType.MEDIA_ASSET) {
    const { mediaLibraryFilter } = await import('./workspaceMedia')
    const { Prisma } = await import('@prisma/client')
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT a.id FROM stored_assets a JOIN users u ON u.id=a.owner_id WHERE a.id=${resourceId} AND a.access_scope IN ('PRIVATE','PUBLIC') AND ${mediaLibraryFilter}`)
    if (!rows.length) throw grantBadRequest('只能授权媒体库中的独立文件，不能授权课程私有附件或证据文件')
    return
  }
  if (resourceType === MaterialResourceType.SCALE) {
    const scale = await prisma.scale.findUnique({ where: { id: resourceId }, select: { status: true, instrumentClass: true } })
    if (!scale) throw grantNotFound('量表不存在')
    if (scale.status !== 'PUBLISHED') throw grantBadRequest('只能授权已发布量表')
    if(scale.instrumentClass==='CUSTOM_DESCRIPTIVE')throw grantBadRequest('自编量表新授权必须通过精确版本共用库审批与分配，旧授权不得扩大')
    return
  }
  if (resourceType === MaterialResourceType.COGNITIVE_CONFIG) {
    const testConfig = await prisma.cognitiveTestConfig.findUnique({ where: { id: resourceId }, select: { status: true } })
    if (!testConfig) throw grantNotFound('认知任务类型不存在')
    if (testConfig.status !== 'PUBLISHED') throw grantBadRequest('只能授权已发布的认知任务类型')
    return
  }
  if (resourceType === MaterialResourceType.REPORT_PACKAGE) {
    const definition = getReportPackageByResourceId(resourceId)
    if (!definition) throw grantNotFound('报告包不存在')
    if (definition.status !== 'PUBLISHED') throw grantBadRequest('只能授权已发布报告包')
    return
  }
  if (resourceType === MaterialResourceType.ASSESSMENT_BUNDLE) {
    const { bundleDefinitionProvider } = await import('../modules/bundle-product/service')
    const entry = bundleDefinitionProvider.list().find(v => v.definition.bundleKey + '@' + v.definition.bundleVersion === resourceId)
    const blockers=entry?bundleDefinitionProvider.publicationBlockers(entry.definition.bundleKey,entry.definition.bundleVersion).filter(b=>!(entry.declarativePackage&&b==='BUNDLE_NOT_PUBLISHED')):[]
    if (!entry || blockers.length) throw grantBadRequest('只能授权已具备发布条件的 Bundle 精确版本')
    // Declarative source bytes deliberately stay DRAFT. Its existing signed
    // DB release, not the source literal or leaf rights, authorizes whole use.
    if(entry.declarativePackage){
      const {assertPackageAdmission}=await import('../modules/bundle-product/package-release')
      await assertPackageAdmission(prisma,entry.declarativePackage)
    }
    return
  }
  throw grantBadRequest('不支持的材料类型')
}

type GrantForResource = {
  id: string
  teacherId: string
  resourceType: MaterialResourceType
  resourceId: string
  grantedBy: string
  createdAt: Date
  teacher?: { id: string; username: string; nickname: string | null; role: UserRole }
  granter?: { id: string; username: string; nickname: string | null }
}
type GrantResource = { id: string; name: string; status?: string } | null

const attachResource = async (grant: GrantForResource) => {
  let resourceMissing = false
  let resource: { id: string; name: string; status?: string } | null = null
  if (grant.resourceType === MaterialResourceType.FORM_TEMPLATE) {
    resource = await prisma.questionnaire.findUnique({where:{id:grant.resourceId},select:{id:true,name:true,status:true}})
    resourceMissing = !resource
  } else if (grant.resourceType === MaterialResourceType.MEDIA_ASSET) {
    const asset = await prisma.storedAsset.findUnique({ where: { id: grant.resourceId }, select: { id: true, originalName: true, deletedAt: true } })
    resource = asset && !asset.deletedAt ? { id: asset.id, name: asset.originalName || '未命名媒体' } : null
    resourceMissing = !resource
  } else if (grant.resourceType === MaterialResourceType.SCALE) {
    const scale = await prisma.scale.findUnique({ where: { id: grant.resourceId }, select: { id: true, name: true, status: true } })
    resource = scale
    resourceMissing = !scale
  } else if (grant.resourceType === MaterialResourceType.COGNITIVE_CONFIG) {
    const testConfig = await prisma.cognitiveTestConfig.findUnique({
      where: { id: grant.resourceId },
      select: { id: true, name: true, status: true },
    })
    resource = testConfig
    resourceMissing = !testConfig
  } else if (grant.resourceType === MaterialResourceType.ASSESSMENT_BUNDLE) {
    const { bundleDefinitionProvider } = await import('../modules/bundle-product/service')
    const entry = bundleDefinitionProvider.list().find(v => v.definition.bundleKey + '@' + v.definition.bundleVersion === grant.resourceId)
    resource = entry ? { id: grant.resourceId, name: entry.definition.name, status: entry.definition.status } : null
    resourceMissing = !entry
  } else {
    const definition = getReportPackageByResourceId(grant.resourceId)
    resource = definition
      ? { id: grant.resourceId, name: definition.name, status: definition.status }
      : null
    resourceMissing = !definition
  }
  return grantResourceResponse(grant, resource, resourceMissing)
}

function grantResourceResponse(grant: GrantForResource, resource: GrantResource, resourceMissing = !resource) {
  return {
    id: grant.id,
    teacherId: grant.teacherId,
    resourceType: grant.resourceType,
    resourceId: grant.resourceId,
    grantedBy: grant.grantedBy,
    createdAt: grant.createdAt,
    teacher: grant.teacher || null,
    granter: grant.granter || null,
    resource,
    resourceMissing,
  }
}

// Metadata only: this request-local map is not an authorization cache. Keep
// database batches bounded and sequential rather than opening one read per grant.
const RESOURCE_METADATA_BATCH_SIZE = 250
async function attachResources(grants: GrantForResource[]) {
  const groups = new Map<MaterialResourceType, Set<string>>()
  for (const grant of grants) {
    if (!groups.has(grant.resourceType)) groups.set(grant.resourceType, new Set())
    groups.get(grant.resourceType)!.add(grant.resourceId)
  }
  const resources = new Map<MaterialResourceType, Map<string, Exclude<GrantResource, null>>>()
  for (const [type, uniqueIds] of groups) {
    const byId = new Map<string, Exclude<GrantResource, null>>()
    resources.set(type, byId)
    const ids = [...uniqueIds]
    if (type === MaterialResourceType.ASSESSMENT_BUNDLE) {
      const { bundleDefinitionProvider } = await import('../modules/bundle-product/service')
      // Preserve the old first-match behavior should a registry contain duplicates.
      for (const { definition } of bundleDefinitionProvider.list()) {
        const id = definition.bundleKey + '@' + definition.bundleVersion
        if (uniqueIds.has(id) && !byId.has(id)) byId.set(id, { id, name: definition.name, status: definition.status })
      }
      continue
    }
    if (type === MaterialResourceType.REPORT_PACKAGE) {
      for (const id of ids) {
        const definition = getReportPackageByResourceId(id)
        if (definition) byId.set(id, { id, name: definition.name, status: definition.status })
      }
      continue
    }
    for (let offset = 0; offset < ids.length; offset += RESOURCE_METADATA_BATCH_SIZE) {
      const where = { id: { in: ids.slice(offset, offset + RESOURCE_METADATA_BATCH_SIZE) } }
      const select = { id: true, name: true, status: true } as const
      if (type === MaterialResourceType.MEDIA_ASSET) {
        const rows = await prisma.storedAsset.findMany({ where, select: { id: true, originalName: true, deletedAt: true } })
        for (const row of rows) if (!row.deletedAt) byId.set(row.id, { id: row.id, name: row.originalName || '未命名媒体' })
      } else {
        const rows = type === MaterialResourceType.FORM_TEMPLATE
          ? await prisma.questionnaire.findMany({ where, select })
          : type === MaterialResourceType.SCALE
            ? await prisma.scale.findMany({ where, select })
            : await prisma.cognitiveTestConfig.findMany({ where, select })
        for (const row of rows) byId.set(row.id, row)
      }
    }
  }
  return grants.map(grant => grantResourceResponse(grant, resources.get(grant.resourceType)?.get(grant.resourceId) ?? null))
}

export const listGrants = async (query: {
  resourceType?: MaterialResourceType
  resourceId?: string
  teacherId?: string
}) => {
  const where: Record<string, unknown> = {}
  if (query.resourceType) where.resourceType = query.resourceType
  if (query.resourceId) where.resourceId = query.resourceId
  if (query.teacherId) where.teacherId = query.teacherId
  const rows = await prisma.materialGrant.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      teacher: { select: { id: true, username: true, nickname: true, role: true } },
      granter: { select: { id: true, username: true, nickname: true } },
    },
  })
  return attachResources(rows)
}

export const createGrant = async (input: {
  teacherId: string
  resourceType: MaterialResourceType
  resourceId: string
  grantedBy: string
}) => {
  await assertEligibleTeacher(input.teacherId)
  await assertGrantableResource(input.resourceType, input.resourceId)
  const grantInclude = {
    teacher: { select: { id: true, username: true, nickname: true, role: true } },
    granter: { select: { id: true, username: true, nickname: true } },
  } as const
  const upserted = await prisma.materialGrant.upsert({
    where: {
      teacherId_resourceType_resourceId: {
        teacherId: input.teacherId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
      },
    },
    create: {
      teacherId: input.teacherId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      grantedBy: input.grantedBy,
    },
    update: {},
    include: grantInclude,
  })
  return attachResource(upserted)
}

export const deleteGrant = async (id: string) => {
  const existing = await prisma.materialGrant.findUnique({ where: { id }, select: { id: true,resourceType:true } })
  if (!existing) throw grantNotFound()
  if(existing.resourceType==='STANDARD_COMBINATION')throw grantBadRequest('精确组合使用权须通过版本化撤销接口处理')
  await prisma.materialGrant.delete({ where: { id } })
  return { id }
}

export const batchCreateGrants = async (input: {
  resourceType: MaterialResourceType
  resourceId: string
  teacherIds: string[]
  grantedBy: string
}) => {
  if (!Array.isArray(input.teacherIds) || input.teacherIds.length === 0) {
    throw grantBadRequest('teacherIds 不能为空')
  }
  await assertGrantableResource(input.resourceType, input.resourceId)
  const uniqueIds = [...new Set(input.teacherIds)]
  const teachers = await prisma.user.findMany({ where: { id: { in: uniqueIds } }, select: TEACHER_ELIGIBILITY_SELECT })
  if (teachers.length !== uniqueIds.length) throw grantNotFound('教师不存在')
  if (teachers.some((teacher) => !isEligibleTeacher(teacher))) {
    throw grantBadRequest('只能授权给已审核且未冻结的在职教师')
  }

  await prisma.$transaction(async (tx) => {
    await tx.materialGrant.createMany({
      data: uniqueIds.map((teacherId) => ({
        teacherId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        grantedBy: input.grantedBy,
      })),
      skipDuplicates: true,
    })
  })

  const rows = await prisma.materialGrant.findMany({
    where: {
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      teacherId: { in: uniqueIds },
    },
    include: {
      teacher: { select: { id: true, username: true, nickname: true, role: true } },
      granter: { select: { id: true, username: true, nickname: true } },
    },
  })
  return attachResources(rows)
}

const grantInclude = {
  teacher: { select: { id: true, username: true, nickname: true, role: true } },
  granter: { select: { id: true, username: true, nickname: true } },
} as const

// 授权弹窗保存：把某材料的授权名单一次设成 teacherIds。
// 新增与撤销必须同事务；已有 grant 即使教师后来不合格也保留（不出现在选择器里，payload 仍会带上）。
export const setGrants = async (input: {
  resourceType: MaterialResourceType
  resourceId: string
  teacherIds: string[]
  grantedBy: string
}) => {
  if (!Array.isArray(input.teacherIds)) {
    throw grantBadRequest('teacherIds 必须是数组')
  }
  await assertGrantableResource(input.resourceType, input.resourceId)
  const desiredSet = new Set(input.teacherIds)
  const desiredIds = [...desiredSet]

  await prisma.$transaction(async (tx) => {
    const existing = await tx.materialGrant.findMany({
      where: { resourceType: input.resourceType, resourceId: input.resourceId },
      select: { id: true, teacherId: true },
    })
    const existingIds = new Set(existing.map((row) => row.teacherId))
    const toAdd = desiredIds.filter((id) => !existingIds.has(id))
    const toRemoveIds = existing.filter((row) => !desiredSet.has(row.teacherId)).map((row) => row.id)

    if (toAdd.length) {
      const teachers = await tx.user.findMany({ where: { id: { in: toAdd } }, select: TEACHER_ELIGIBILITY_SELECT })
      if (teachers.length !== toAdd.length) throw grantNotFound('教师不存在')
      if (teachers.some((teacher) => !isEligibleTeacher(teacher))) {
        throw grantBadRequest('只能授权给已审核且未冻结的在职教师')
      }
      await tx.materialGrant.createMany({
        data: toAdd.map((teacherId) => ({
          teacherId,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          grantedBy: input.grantedBy,
        })),
        skipDuplicates: true,
      })
    }
    if (toRemoveIds.length) {
      await tx.materialGrant.deleteMany({ where: { id: { in: toRemoveIds } } })
    }
  })

  const rows = await prisma.materialGrant.findMany({
    where: { resourceType: input.resourceType, resourceId: input.resourceId },
    orderBy: { createdAt: 'desc' },
    include: grantInclude,
  })
  return attachResources(rows)
}
