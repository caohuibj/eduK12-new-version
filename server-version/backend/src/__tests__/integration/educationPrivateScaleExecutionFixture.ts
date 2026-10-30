import {schoolTrackingOptions} from '../../modules/campus/personal-tracking'
import type {ScaleDefinitionV2} from '../../modules/scale/scale-definition'
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { setupEducationLibraryRuntimeFixture } from './educationLibraryRuntimeFixture'
import { compileResearchScale } from '../../modules/survey/builder.compiler'
import * as tools from '../../modules/education-tools/private-tool.service'
import { privateToolMediaScope, registerPrivateToolImage } from '../../modules/education-tools/private-tool.media'
import type { PrivateToolContext } from '../../modules/education-tools/private-tool.contracts'
import { addPrivateScaleRunTrack } from '../../modules/education-tools/private-tool.run-adapter'
import { addTeacherPrivateRunTrack, previewTeacherRun, publishTeacherRun } from '../../modules/huiteacher/run.service'

/** Synthetic account and storage metadata, real private version freezing/pins,
 * product draft attachment and publication. No fake execution or FINAL. */
export async function setupPrivateScaleExecutionFixture(db: PrismaClient, product: 'SCHOOL' | 'TEACHER',
  responseMode: 'SELF' | 'PARENT_REPORT' | 'TEACHER_REPORT' = 'SELF', trackCount = 1, prepareDefinition?: (context:PrivateToolContext,toolId:string,definition:ScaleDefinitionV2)=>Promise<void>,longitudinal=false) {
  if (!Number.isSafeInteger(trackCount) || trackCount < 1) throw new Error('Positive test track count required')
  const f = await setupEducationLibraryRuntimeFixture({ db, product, responseMode, publisher: 'PSYCHOLOGY', trackCount: 0, publish: false })
  if (product === 'TEACHER') {
    const member = await db.organizationMembership.findFirstOrThrow({ where: { organizationId: f.organizationId, userId: f.managerUserId, validUntil: null } })
    await db.organizationPersonaGrant.create({ data: { id: randomUUID(), organizationId: f.organizationId,
      membershipId: member.id, persona: 'COUNSELOR', grantedByUserId: f.managerUserId } })
    await db.organizationCapabilityGrant.create({ data: { id: randomUUID(), organizationId: f.organizationId,
      membershipId: member.id, capability: 'PSYCHOLOGY_STAFF', grantedByUserId: f.managerUserId } })
  }
  const context: PrivateToolContext = { entry: product, organizationId: f.organizationId,
    principal: { userId: f.managerUserId, accountDomain: 'SCHOOL' } }
  const draft = await tools.createPrivateTool(context, { kind: 'SCALE', title: 'Synthetic private execution' })
  const definition = compileResearchScale(draft.title, { schemaVersion: 1, presentationMode: 'ONE_BY_ONE',
    respondentType: 'participant_self_report', aggregation: 'mean', responseOptions: [{ optionKey: 'a', label: 'A', score: 1 }, { optionKey: 'b', label: 'B', score: 2 }],
    dimensions: [{ dimensionKey: 'total', label: 'Total', direction: 'descriptive' }],
    items: [{ itemKey: 'q', prompt: 'Synthetic question', required: true, reverse: false, dimensionKeys: ['total'] }] })
  const images = []
  for (const label of ['stimulus', 'report']) {
    const asset = await db.storedAsset.create({ data: { id: randomUUID(), objectKey: `synthetic-private/${label}/${randomUUID()}`,
      provider: 'local', mimeType: 'image/png', sizeBytes: 68, sha256: (label === 'stimulus' ? 'a' : 'b').repeat(64),
      ownerId: f.managerUserId, accessScope: 'PRIVATE', scopeId: privateToolMediaScope(context, draft.id) } })
    const reference = { assetId: asset.id, contentHash: asset.sha256, mimeType: 'image/png' as const }
    await registerPrivateToolImage(context, draft.id, reference)
    images.push({ asset: reference, altText: label, order: 0 })
  }
  definition.items[0].images = [images[0]]
  definition.report.audienceContract = { schemaVersion: 1, respondent: responseMode === 'SELF' ? (product === 'SCHOOL' ? 'STUDENT_SELF' : 'ADULT_SELF') : responseMode,
    audience: product === 'SCHOOL' ? 'student' : 'teacher', locale: 'zh-CN', qcReview: { reviewer: 'Synthetic author',
      reviewedAt: '2026-10-22T00:00:00.000Z', basis: 'Descriptive synthetic test only, no normative inference or diagnosis.' } }
  definition.report.rawScoreFeedback = { schemaVersion: 1, rules: [{ scoreKey: 'total', ranges: [{ key: 'all', min: 0, max: 3,
    includeMax: true, text: '固定私有版本描述反馈，不是诊断。', images: [images[1]] }] }] }
  await prepareDefinition?.(context,draft.id,definition)
  const saved = await tools.updatePrivateTool(context, draft.id, { expectedRevision: draft.revision, title: draft.title, definition })
  const version = await tools.freezePrivateTool(context, draft.id, { expectedRevision: saved.revision, expectedContentHash: saved.contentHash })
  const body = { expectedVersion: f.expectedVersion, privateScale: { versionId: version.id, contentHash: version.contentHash,
    administration: { population: product === 'SCHOOL' ? 'STUDENT' : 'TEACHER', responseMode } },
    subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [f.subjectMembershipId] },
    respondentSelector: responseMode === 'PARENT_REPORT' ? { kind: 'RELATED_PARENT' }
      : { kind: 'MEMBERSHIP_IDS', membershipIds: [f.participantMembershipId!] },
    ...(responseMode === 'TEACHER_REPORT' ? { targetPolicy: { mode: 'HOMEROOM_TEACHER' } } : {}) }
  const teacher = { organizationId: f.organizationId, eventId: f.workflow.id, actorUserId: f.managerUserId }
  const tracks = []
  for (let index = 0; index < trackCount; index++) {
    const selected = { ...body, expectedVersion: f.expectedVersion + index }
    tracks.push(product === 'TEACHER' ? await addTeacherPrivateRunTrack(teacher, selected)
      : await addPrivateScaleRunTrack({ organizationId: f.organizationId, runId: f.runId, actorUserId: f.managerUserId,
        parent: { kind: 'SCHOOL_ACTIVITY', id: f.workflow.id } }, selected))
  }
  const track = tracks[0]
  const tracking=longitudinal?{mode:'LONGITUDINAL',metrics:(await schoolTrackingOptions({actor:f.manager,organizationId:f.organizationId,courseId:f.workflow.id,runId:f.runId})).choices.map(({trackId,itemId,scoreKey})=>({trackId,itemId,scoreKey}))}:undefined
  await f.open()
  if (product === 'TEACHER') {
    await previewTeacherRun({ ...teacher, expectedVersion: f.expectedVersion + trackCount })
    await publishTeacherRun({ ...teacher, expectedVersion: f.expectedVersion + trackCount })
  } else { await f.preview(); await f.publish(tracking) }
  const [execution] = await f.executions()
  if (!execution) throw new Error('Actual private publication did not create an execution')
  return { ...f, executionId: execution.id, track, privateVersion: version, privateDraft: saved, privateContext: context,
    privateDefinition: definition, stimulus: images[0].asset, reportImage: images[1].asset,
    answers: [{ itemCode: 'q', responseValue: 'b' }] }
}
