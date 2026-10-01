import { Router, type Request, type Response, type RequestHandler } from 'express'
import multer from 'multer'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { authenticate, requireTeacher } from '../middleware/auth'
import { UserRole } from '../types'
import { uploadPrincipalRateLimit, withUploadAdmission } from '../middleware/uploadAdmission'
import { createTemporaryUploadStorage } from '../utils/uploadTemp'
import { SjtTemplateError, compileSjtTemplate } from '../modules/situational/authoring/template'
import { readSjtWorkbook, locateSjtWorkbookIssues } from '../modules/situational/authoring/workbook'
import {
  createSjtDraft,
  getSjtDraft,
  listSjtDrafts,
  requestSjtReview,
  reviseSjtDraft,
  reviewSjtDraft,
  diffSjtTemplates,
  restoreSjtRevision,
  retireSjtRelease,
} from '../modules/situational/authoring/service'
import {
  runnerSituationRuntimeDefinition,
  asLinearSituationDefinition,
} from '../modules/situational/situation-runtime-definition'
import {
  createSituationalResponseValidator,
  SituationalResponseValidationError,
} from '../modules/situational/situation-scoring'
import {
  deriveAuthoritativeSituationalTrajectory,
  requiredReachableSituationalResponseKeys,
  projectReachableSituationDefinitionForScoring,
} from '../modules/situational/situation-trajectory'
import { scoreSituationalModel } from '../modules/situational/situation-model-resolver'
import { buildSjtNarrative } from '../modules/situational/authoring/narrative'

const router = Router()
router.use(authenticate, requireTeacher)
const actor = (req: Request) => ({
  userId: req.user!.userId,
  admin: req.user!.role === UserRole.ADMIN,
})
const send = (res: Response, data: unknown) => res.json({ code: 0, message: '成功', data })
const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  async (req, res) => {
    try {
      await fn(req, res)
    } catch (e) {
      if (e instanceof SjtTemplateError) {
        res.status(422).json({ code: 'SJT_TEMPLATE_INVALID', message: e.message, issues: e.issues })
        return
      }
      if (e instanceof SituationalResponseValidationError) {
        res
          .status(400)
          .json({ code: 'SJT_RESPONSE_INVALID', message: '预览作答无效', issues: e.issues })
        return
      }
      if (e instanceof z.ZodError) {
        res.status(400).json({ code: 'SJT_REQUEST_INVALID', message: '请求字段无效' })
        return
      }
      const status = Number((e as { statusCode?: number }).statusCode ?? 500)
      res
        .status(status)
        .json({
          code: 'SJT_AUTHORING_ERROR',
          message: status < 500 ? (e as Error).message : 'SJT 服务暂时不可用',
        })
    }
  }
const revision = z
  .object({
    revision: z.number().int().positive(),
    contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
const upload = multer({
  storage: createTemporaryUploadStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
}).single('file')
const uploadHandler = (save: boolean) =>
  withUploadAdmission(
    handle(async (req, res) => {
      await new Promise<void>((resolve, reject) =>
        upload(req, res, (e) =>
          e
            ? reject(Object.assign(new Error('文件无效或超过 2 MB'), { statusCode: 400 }))
            : resolve(),
        ),
      )
      if (!req.file)
        throw Object.assign(new Error('请选择 Excel 或 JSON 模板'), { statusCode: 400 })
      const bytes = await fs.readFile(req.file.path)
      let input: unknown
      try {
        input = req.file.originalname.toLowerCase().endsWith('.xlsx')
          ? await readSjtWorkbook(bytes)
          : req.file.originalname.toLowerCase().endsWith('.json')
            ? JSON.parse(bytes.toString('utf8'))
            : (() => {
                throw new Error('支持 .xlsx 或 .json')
              })()
      } catch (e) {
        if (e instanceof SjtTemplateError) throw e
        throw Object.assign(new Error((e as Error).message), { statusCode: 400 })
      }
      let c: ReturnType<typeof compileSjtTemplate>
      try {
        c = compileSjtTemplate(input)
      } catch (e) {
        if (e instanceof SjtTemplateError)
          throw new SjtTemplateError(locateSjtWorkbookIssues(input, e.issues))
        throw e
      }
      send(
        res,
        save
          ? await createSjtDraft(actor(req), c.template)
          : {
              contentDigest: c.contentDigest,
              definitionHash: c.definitionHash,
              template: c.template,
              title: c.template.title,
              logicalNodes: c.template.nodes.length,
              expandedNodes: c.package.definition.scenes.length,
              questionCount: c.template.questions.length,
              maturity: 'PILOT',
              runner: runnerSituationRuntimeDefinition(c.package.definition),
            },
      )
    }),
    2 * 1024 * 1024,
  )
router.get(
  '/template',
  handle(async (_req, res) => {
    res.download(path.resolve(__dirname, '../../assets/sjt-upload-v1.xlsx'), 'SJT_上传模板_v1.xlsx')
  }),
)
router.get(
  '/example-template',
  handle(async (_req, res) => {
    res.download(
      path.resolve(__dirname, '../../assets/sjt-upload-example-v1.xlsx'),
      'SJT_示范上传样例_v1.xlsx',
    )
  }),
)
router.post('/validate', uploadPrincipalRateLimit, uploadHandler(false))
router.post('/drafts', uploadPrincipalRateLimit, uploadHandler(true))
router.get(
  '/drafts',
  handle(async (req, res) => send(res, await listSjtDrafts(actor(req)))),
)
router.get(
  '/drafts/:id',
  handle(async (req, res) => {
    const d = await getSjtDraft(actor(req), req.params.id),
      c = compileSjtTemplate(d.template)
    send(res, {
      ...d,
      runner: runnerSituationRuntimeDefinition(c.package.definition),
      changes: d.audits.find((a) => a.template && a.revision < d.revision)?.template
        ? diffSjtTemplates(
            d.audits.find((a) => a.template && a.revision < d.revision)!.template,
            d.template,
          )
        : [],
    })
  }),
)
router.put(
  '/drafts/:id',
  handle(async (req, res) => {
    const body = z
      .object({ revision: z.number().int().positive(), template: z.unknown() })
      .strict()
      .parse(req.body)
    send(res, await reviseSjtDraft(actor(req), req.params.id, body.revision, body.template))
  }),
)
router.post(
  '/drafts/:id/request-review',
  handle(async (req, res) => {
    const b = revision.parse(req.body)
    send(res, await requestSjtReview(actor(req), req.params.id, b.revision, b.contentDigest))
  }),
)
router.post(
  '/drafts/:id/review',
  handle(async (req, res) => {
    const b = revision
      .extend({ approve: z.boolean(), note: z.string().trim().min(1).max(2000) })
      .parse(req.body)
    send(
      res,
      await reviewSjtDraft(
        actor(req),
        req.params.id,
        b.revision,
        b.contentDigest,
        b.approve,
        b.note,
      ),
    )
  }),
)
router.post(
  '/drafts/:id/preview',
  handle(async (req, res) => {
    const d = await getSjtDraft(actor(req), req.params.id),
      c = compileSjtTemplate(d.template)
    const body = z
      .object({
        responses: z
          .array(
            z
              .object({
                sceneKey: z.string().min(1),
                channelKey: z.string().min(1),
                responseValue: z.union([z.string().max(2000), z.number().finite()]),
              })
              .strict(),
          )
          .min(1)
          .max(240),
      })
      .strict()
      .parse(req.body)
    const definition = c.package.definition,
      validate = createSituationalResponseValidator(asLinearSituationDefinition(definition)),
      pairs = new Set<string>()
    for (const r of body.responses) {
      validate(r)
      const pair = `${r.sceneKey}:${r.channelKey}`
      if (pairs.has(pair)) throw Object.assign(new Error('重复作答'), { statusCode: 400 })
      pairs.add(pair)
    }
    const trajectory = deriveAuthoritativeSituationalTrajectory(definition, body.responses)
    if (
      !trajectory.reachedTerminal ||
      requiredReachableSituationalResponseKeys(definition, trajectory).some((k) => !pairs.has(k)) ||
      body.responses.some((r) => !trajectory.sceneKeys.includes(r.sceneKey))
    )
      throw Object.assign(new Error('请完成全部情境后预览报告'), { statusCode: 400 })
    const result = scoreSituationalModel(
      projectReachableSituationDefinitionForScoring(definition, trajectory),
      body.responses,
      {
        responsesValidated: true,
        independentSceneKeyBySceneKey:
          definition.schemaVersion === 2
            ? Object.fromEntries(
                definition.flow.nodes.flatMap((n) =>
                  n.nodeType === 'SCENE' ? [[n.sceneKey, n.motherSceneKey]] : [],
                ),
              )
            : {},
      },
    )
    send(res, {
      ...result,
      narrative: buildSjtNarrative(definition, body.responses),
      previewOnly: true,
    })
  }),
)
router.post(
  '/drafts/:id/restore',
  handle(async (req, res) => {
    const b = z
      .object({
        revision: z.number().int().positive(),
        targetRevision: z.number().int().positive(),
      })
      .strict()
      .parse(req.body)
    send(res, await restoreSjtRevision(actor(req), req.params.id, b.revision, b.targetRevision))
  }),
)
router.post(
  '/drafts/:id/retire',
  handle(async (req, res) => {
    const b = z
      .object({ note: z.string().trim().min(1).max(2000) })
      .strict()
      .parse(req.body)
    await retireSjtRelease(actor(req), req.params.id, b.note)
    send(res, { retired: true })
  }),
)
export default router
