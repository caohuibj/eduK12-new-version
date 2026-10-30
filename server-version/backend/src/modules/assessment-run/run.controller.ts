import { RELATIONAL_RESOURCE_KINDS } from '../assessment-relational/types'
import {addPrivateScaleRunTrack,addPrivateFormRunTrack,addPrivateCompositionRunTrack} from '../education-tools/private-tool.run-adapter'
import {educationPrivateRunTrackInput} from '../education-tools/private-tool.run-contract'
import {prisma} from '../../config/database'
import {listEducationLibraryResourcePage} from '../scale-library-governance/education-catalog'
import { RelationalAssessmentError } from '../assessment-relational/errors'
import { acceptRunExecutionConsent } from './consent'
import { z } from 'zod'
import type { Request, Response } from 'express'
import { error, success, unauthorized } from '../../utils/response'
import { addAssessmentRunTrackDraft, createAssessmentRunDraft, type AssessmentRunStatus } from './repository'
import { previewAssessmentRun, publishAssessmentRun } from './publish'
import { startAssessmentRunExecution } from './startExecution'
import { readAssessmentRunProgress } from './progress'
import { cancelAssessmentRun, closeAssessmentRun } from './lifecycle'
import {
  assertCurrentRunManagerBoundary,
  assertCurrentRunPublisherBoundary,
  assertRunExecutionParent,
} from './resourceBoundary'
import { relationalProductRegistry } from '../assessment-relational/product-registry'
import { listReleasedRegisteredResourcePage } from './registeredResources'
import { relationalEntryToRunPolicy } from './resourceAuthority'
import { productionRunResourceAuthorityRegistry } from './resourceAuthority'
import { listAssignedRunTasks, listAssessmentRunProducts, readAssessmentRunProduct } from './productRead'

const selectorSchema = z.record(z.string(), z.unknown()).default({})
const policySchema = z.object({
  targetPolicy: z.object({
    mode: z.enum(['SELF', 'HOMEROOM_TEACHER', 'ALL_CLASS_TEACHERS', 'SELECTED_CLASS_TEACHERS', 'COURSE_TEACHER']),
    teacherMembershipIds: z.array(z.string().min(1)).optional(),
    courseId: z.string().min(1).optional(),
  }).strict().optional(),
  subjectRoles: z.array(z.string().min(1)).min(1),
  respondentRoles: z.array(z.string().min(1)).min(1),
  relationshipKinds: z.array(z.string().min(1)).min(1),
  perspectives: z.array(z.string().min(1)).min(1),
  analysisMode: z.string().min(1),
  visibilityPolicyKey: z.string().min(1),
  minimumRespondents: z.number().int().min(1).nullable(),
})
const createRunSchema = z.object({
  name: z.string().trim().min(1).max(200),
  intakeDeadline: z.string().datetime().nullable().optional(),
})
const addTrackSchema = z.object({
  expectedVersion:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  expectedRunId:z.string().guid().optional(),
  resource: z.object({
    family: z.enum(RELATIONAL_RESOURCE_KINDS),
    key: z.string().trim().min(1),
    version: z.string().trim().min(1),
  }),
  subjectSelector: selectorSchema.optional(),
  respondentSelector: selectorSchema.optional(),
  requestedPolicy: policySchema,
})
const educationTrackSchema=addTrackSchema.strict().refine(value=>value.expectedVersion!==undefined&&value.expectedRunId!==undefined,{message:'固定教育测评必须绑定当前任务批次和版本'})
const publishSchema = z.object({ expectedVersion: z.number().int().min(1),tracking:z.unknown().optional() })
const listRunSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED']).optional(),
})

const fail = (res: Response, err: unknown) => {
  if (err instanceof RelationalAssessmentError) return error(res, err.message, -1, 409)
  const known = err as { code?: string; message?: string; statusCode?: number }
  if (known && typeof known.statusCode === 'number') {
    return error(res, known.message ?? known.code ?? 'Run operation failed', -1, known.statusCode)
  }
  throw err
}

async function resourcesResponse(req: Request, res: Response, schoolActivity?:{organizationId:string;courseId:string}) {
    if (!req.user) return unauthorized(res)
    const entries = new Map<string, ReturnType<typeof relationalProductRegistry.listReleasedForRespondent>[number]>()
    for (const role of ['STUDENT', 'TEACHER', 'PARENT', 'COUNSELOR', 'CLIENT'] as const) {
      for (const entry of relationalProductRegistry.listReleasedForRespondent(role)) {
        if(schoolActivity&&entry.applicability.resourceKind==='SCALE')continue
        const ref = entry.applicability
        entries.set(`${ref.resourceKind}:${ref.resourceKey}:${ref.resourceVersion}`, entry)
      }
    }
    try {
      const page = req.query.page === undefined ? 1 : Number(req.query.page)
      const registered = schoolActivity
        ?await prisma.$transaction(tx=>listEducationLibraryResourcePage(tx,{product:'SCHOOL',organizationId:schoolActivity.organizationId,actorId:req.user!.userId,workflow:{kind:'ACTIVITY',id:schoolActivity.courseId},cursor:z.string().optional().parse(req.query.cursor)}))
        :await listReleasedRegisteredResourcePage(req.user.userId, req.user.role, page)
      for (const entry of registered.entries) {
        const ref = entry.applicability
        entries.set(`${ref.resourceKind}:${ref.resourceKey}:${ref.resourceVersion}`, entry)
      }
      const list = []
      for (const entry of entries.values()) {
        const ref = entry.applicability
        productionRunResourceAuthorityRegistry.assertStartSupported(ref.resourceKind)
        // Entries are already release-checked; static adapters remain the
        // authority for static content. Registered entries need no second read.
        const policy = ref.resourceKind === 'SCALE' && (ref.resourceKey.startsWith('custom-scale:')||ref.resourceKey.startsWith('library-scale:'))
          ? relationalEntryToRunPolicy(entry)
          : await productionRunResourceAuthorityRegistry.resolveExact({ family: ref.resourceKind, key: ref.resourceKey, version: ref.resourceVersion })
        // Runtime capability ceiling only; preserve the immutable source applicability hash.
        const visiblePolicy=ref.resourceKey.startsWith('library-scale:')?{...policy,
          relationshipKinds:policy.relationshipKinds.filter(kind=>kind!=='COURSE_TEACHER_STUDENT'),
          ...(policy.allowedTargetModes?{allowedTargetModes:policy.allowedTargetModes.filter(mode=>mode!=='COURSE_TEACHER')}:{})}:policy
        list.push({ title: entry.title, ...visiblePolicy })
      }
      return success(res, { list, ...('nextCursor' in registered?{nextCursor:registered.nextCursor}:{nextPage:registered.nextPage}) })
    } catch (err) { return fail(res, err) }
  }

export const assessmentRunController = {
  async resources(req:Request,res:Response){return resourcesResponse(req,res)},
  async schoolActivityResources(req:Request,res:Response,scope:{organizationId:string;courseId:string}){return resourcesResponse(req,res,scope)},
  async assignedTasks(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try { return success(res, await listAssignedRunTasks(req.user.userId)) }
    catch (err) { return fail(res, err) }
  },
  async list(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    const parsed = listRunSchema.safeParse(req.query)
    if (!parsed.success) return error(res, parsed.error.issues[0].message, -1, 400)
    try {
      const organizationWide = req.assessmentDeliveryAccess?.deliveryScopes.includes('ORGANIZATION') === true
      return success(res, await listAssessmentRunProducts({
        organizationId: req.params.organizationId,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        status: parsed.data.status as AssessmentRunStatus | undefined,
        ...(organizationWide ? {} : { createdByUserId: req.user.userId }),
      }))
    } catch (err) { return fail(res, err) }
  },

  async detail(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      await assertCurrentRunManagerBoundary({
        organizationId: req.params.organizationId,
        runId: req.params.runId,
        actorUserId: req.user.userId,
      })
      const detail = await readAssessmentRunProduct(req.params.organizationId, req.params.runId)
      // Exact manager boundary above is authoritative; the client does not
      // recreate Run lifecycle eligibility from local dates or legacy roles.
      return success(res, { ...detail, availableActions: detail.run.status === 'DRAFT'
        ? ['ADD_TRACK', 'PREVIEW_PUBLISH'] : detail.run.status === 'PUBLISHED'
          ? ['PROGRESS', 'CLOSE', 'CANCEL'] : ['PROGRESS'] })
    } catch (err) { return fail(res, err) }
  },

  async create(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    const parsed = createRunSchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.issues[0].message, -1, 400)
    try {
      return success(res, await createAssessmentRunDraft({
        organizationId: req.params.organizationId,
        name: parsed.data.name,
        createdByUserId: req.user.userId,
        intakeDeadline: parsed.data.intakeDeadline ? new Date(parsed.data.intakeDeadline) : null,
      }))
    } catch (err) { return fail(res, err) }
  },

  async addTrack(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    if(req.body&&['privateScale','privateForm','privateComposition'].some(key=>Object.prototype.hasOwnProperty.call(req.body,key))){
      if(!req.params.courseId)return error(res,'Private tools require the product activity route',-1,400)
      const parsed=educationPrivateRunTrackInput.safeParse(req.body)
      if(!parsed.success)return error(res,'Invalid private fixed-version track',-1,400)
      try{return success(res,await ('privateComposition' in parsed.data?addPrivateCompositionRunTrack:'privateForm' in parsed.data?addPrivateFormRunTrack:addPrivateScaleRunTrack)({organizationId:req.params.organizationId,runId:req.params.runId,actorUserId:req.user.userId,parent:{kind:'SCHOOL_ACTIVITY',id:req.params.courseId}},parsed.data))}
      catch(err){return fail(res,err)}
    }
    if((typeof req.body?.resource?.key==='string'&&(req.body.resource.key.startsWith('private-scale:')||req.body.resource.key.startsWith('private-form:')||req.body.resource.key.startsWith('education-composition:')))
      ||req.body&&Object.prototype.hasOwnProperty.call(req.body,'privateFormOrigin')
      ||req.body?.resource&&Object.prototype.hasOwnProperty.call(req.body.resource,'privateFormOrigin')
      ||req.body&&Object.prototype.hasOwnProperty.call(req.body,'privateOrigin')
      ||req.body?.resource&&Object.prototype.hasOwnProperty.call(req.body.resource,'privateOrigin'))
      return error(res,'Private versions require the private fixed-version draft request',-1,400)
    const parsed = (typeof req.body?.resource?.key==='string'&&req.body.resource.key.startsWith('education-assessment:')?educationTrackSchema:addTrackSchema).safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.issues[0].message, -1, 400)
    if(parsed.data.resource.key.startsWith('education-assessment:')&&parsed.data.expectedRunId!==req.params.runId)
      return error(res,'任务批次已变化，请重新读取任务配置',-1,409)
    try {
      await assertCurrentRunManagerBoundary({
        organizationId: req.params.organizationId,
        runId: req.params.runId,
        actorUserId: req.user.userId,
      })
      return success(res, await addAssessmentRunTrackDraft({
        actorUserId:req.user.userId,
        expectedVersion:parsed.data.expectedVersion,
        ...(parsed.data.resource.key.startsWith('education-assessment:')?{expectedRunId:parsed.data.expectedRunId,
          educationWorkflow:req.params.courseId?{product:'SCHOOL' as const,id:req.params.courseId}:undefined}:{}),
        organizationId: req.params.organizationId,
        runId: req.params.runId,
        resource: parsed.data.resource,
        subjectSelector: parsed.data.subjectSelector ?? {},
        respondentSelector: parsed.data.respondentSelector ?? {},
        requestedPolicy: parsed.data.requestedPolicy,
      }))
    } catch (err) { return fail(res, err) }
  },

  async preview(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    const parsed = publishSchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.issues[0].message, -1, 400)
    try {
      await assertCurrentRunManagerBoundary({
        organizationId: req.params.organizationId,
        runId: req.params.runId,
        actorUserId: req.user.userId,
      })
      return success(res, await previewAssessmentRun({ organizationId: req.params.organizationId, runId: req.params.runId, actorUserId: req.user.userId, expectedVersion: parsed.data.expectedVersion }))
    } catch (err) { return fail(res, err) }
  },

  async publish(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    const parsed = publishSchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.issues[0].message, -1, 400)
    try {
      await assertCurrentRunPublisherBoundary({
        organizationId: req.params.organizationId,
        runId: req.params.runId,
        actorUserId: req.user.userId,
      })
      return success(res, await publishAssessmentRun({
        organizationId: req.params.organizationId,
        runId: req.params.runId,
        actorUserId: req.user.userId,
        expectedVersion: parsed.data.expectedVersion,
        tracking:parsed.data.tracking,
      }))
    } catch (err) { return fail(res, err) }
  },

  async acceptConsent(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      await assertRunExecutionParent({ organizationId: req.params.organizationId, runId: req.params.runId, executionId: req.params.executionId })
      return success(res, await acceptRunExecutionConsent({ executionId: req.params.executionId, actorUserId: req.user.userId }))
    } catch (err) { return fail(res, err) }
  },

  async startExecution(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      await assertRunExecutionParent({
        organizationId: req.params.organizationId,
        runId: req.params.runId,
        executionId: req.params.executionId,
      })
      return success(res, await startAssessmentRunExecution({
        executionId: req.params.executionId,
        actorUserId: req.user.userId,
      }))
    } catch (err) { return fail(res, err) }
  },

  async progress(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      await assertCurrentRunManagerBoundary({
        organizationId: req.params.organizationId,
        runId: req.params.runId,
        actorUserId: req.user.userId,
      })
      return success(res, await readAssessmentRunProgress(
        req.params.organizationId,
        req.params.runId,
      ))
    } catch (err) { return fail(res, err) }
  },

  async close(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      await assertCurrentRunManagerBoundary({
        organizationId: req.params.organizationId,
        runId: req.params.runId,
        actorUserId: req.user.userId,
      })
      return success(res, await closeAssessmentRun({
        organizationId: req.params.organizationId,
        runId: req.params.runId,
        ...(req.user.accountDomain==='SCHOOL'&&req.params.courseId
          ?{schoolActivity:{actor:req.user,courseId:req.params.courseId}}:{}),
      }))
    } catch (err) { return fail(res, err) }
  },

  async cancel(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      await assertCurrentRunManagerBoundary({
        organizationId: req.params.organizationId,
        runId: req.params.runId,
        actorUserId: req.user.userId,
      })
      return success(res, await cancelAssessmentRun({
        organizationId: req.params.organizationId,
        runId: req.params.runId,
        ...(req.user.accountDomain==='SCHOOL'&&req.params.courseId
          ?{schoolActivity:{actor:req.user,courseId:req.params.courseId}}:{}),
      }))
    } catch (err) { return fail(res, err) }
  },
}
