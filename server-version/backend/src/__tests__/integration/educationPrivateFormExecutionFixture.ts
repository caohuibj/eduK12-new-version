import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { setupEducationLibraryRuntimeFixture } from './educationLibraryRuntimeFixture'
import * as tools from '../../modules/education-tools/private-tool.service'
import type { PrivateToolContext } from '../../modules/education-tools/private-tool.contracts'
import type { FormDraft } from '../../modules/assessment-core/form/definition'
import { addPrivateFormRunTrack } from '../../modules/education-tools/private-tool.run-adapter'
import { addTeacherPrivateFormRunTrack, previewTeacherRun, publishTeacherRun } from '../../modules/huiteacher/run.service'
export const privateExecutionFormDefinition = (): FormDraft => ({ schemaVersion: 2, pages: [
  { pageKey: 'first', title: 'First', description: 'First instructions', questions: [
    { itemKey: 'choice', type: 'SINGLE', prompt: 'Choose', required: true, allowRefusal: false,
      options: [{ optionKey: 'a', label: 'A' }, { optionKey: 'b', label: 'B' }], rows: [] },
    { itemKey: 'explain', type: 'SHORT_TEXT', prompt: 'Explain', required: true, allowRefusal: true,
      options: [], rows: [], displayIf: { itemKey: 'choice', operator: 'EQUALS', optionKey: 'a' } },
  ] }, { pageKey: 'last', title: 'Last', description: 'Last instructions', questions: [
    { itemKey: 'number', type: 'NUMBER', prompt: 'A number', required: true, options: [], rows: [] },
    { itemKey: 'comment', type: 'LONG_TEXT', prompt: 'Comment', required: false, options: [], rows: [], maxLength: 150 },
  ] },
] })
async function frozen(context: PrivateToolContext, prepareContent?: (context: PrivateToolContext, toolId: string) => Promise<FormDraft>) {
  const draft = await tools.createPrivateTool(context, { kind: 'FORM', title: 'Synthetic private draft form' })
  const content = prepareContent ? await prepareContent(context, draft.id) : privateExecutionFormDefinition()
  const saved = await tools.updatePrivateTool(context, draft.id, { expectedRevision: draft.revision, title: draft.title, definition: content })
  const version = await tools.freezePrivateTool(context, draft.id, { expectedRevision: saved.revision, expectedContentHash: saved.contentHash })
  return { draft: saved, version }
}
export async function setupPrivateFormExecutionFixture(db: PrismaClient, product: 'SCHOOL' | 'TEACHER', responseMode: 'SELF' | 'PARENT_REPORT' | 'TEACHER_REPORT' = 'SELF', trackCount = 1, prepareContent?: (context: PrivateToolContext, toolId: string) => Promise<FormDraft>) {
  const f = await setupEducationLibraryRuntimeFixture({ db, product, trackCount: 0, publish: false, responseMode, ...(product === 'SCHOOL' ? { publisher: 'PSYCHOLOGY' as const } : {}) })
  const context: PrivateToolContext = { entry: product, organizationId: f.organizationId,
    principal: { userId: f.managerUserId, accountDomain: 'SCHOOL' } }
  if (product === 'TEACHER') {
    const member = await db.organizationMembership.findFirstOrThrow({ where: { organizationId: f.organizationId, userId: f.managerUserId, validUntil: null } })
    await db.organizationPersonaGrant.create({ data: { id: randomUUID(), organizationId: f.organizationId,
      membershipId: member.id, persona: 'COUNSELOR', grantedByUserId: f.managerUserId } })
    await db.organizationCapabilityGrant.create({ data: { id: randomUUID(), organizationId: f.organizationId,
      membershipId: member.id, capability: 'PSYCHOLOGY_STAFF', grantedByUserId: f.managerUserId } })
  }
  const source = await frozen(context, prepareContent)
  const target = { organizationId: f.organizationId, runId: f.runId, actorUserId: f.managerUserId,
    parent: { kind: product === 'SCHOOL' ? 'SCHOOL_ACTIVITY' as const : 'TEACHER_EVENT' as const, id: f.workflow.id } }
  const teacher = { organizationId: f.organizationId, eventId: f.workflow.id, actorUserId: f.managerUserId }
  const attach = (raw: unknown) => product === 'TEACHER' ? addTeacherPrivateFormRunTrack(teacher, raw) : addPrivateFormRunTrack(target, raw)
  const body = { expectedVersion: f.expectedVersion, privateForm: { versionId: source.version.id, contentHash: source.version.contentHash,
    administration: { population: product === 'SCHOOL' ? 'STUDENT' : 'TEACHER', responseMode } },
    subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [f.subjectMembershipId] },
    respondentSelector: responseMode === 'PARENT_REPORT' ? { kind: 'RELATED_PARENT' } : { kind: 'MEMBERSHIP_IDS', membershipIds: [f.participantMembershipId!] },
    ...(responseMode === 'TEACHER_REPORT' ? { targetPolicy: { mode: 'HOMEROOM_TEACHER' } } : {}) }
  const tracks = []
  for (let i = 0; i < trackCount; i++) tracks.push(await attach({ ...body, expectedVersion: f.expectedVersion + i }))
  const track = tracks[0]
  const key = { organizationId: f.organizationId, runId: f.runId, actorUserId: f.managerUserId, expectedVersion: f.expectedVersion + trackCount }
  const preview = () => product === 'TEACHER' ? previewTeacherRun({ ...teacher, expectedVersion: key.expectedVersion }) : f.preview()
  const publish = () => product === 'TEACHER' ? publishTeacherRun({ ...teacher, expectedVersion: key.expectedVersion }) : f.publish()
  await f.open(); await preview(); await publish()
  const executions = await f.executions()
  if (executions.length !== trackCount) throw new Error('Expected actual private Form publication executions')
  return { ...f, context, source, target, teacher, attach, body, track, tracks, key, preview, publish, executionId: executions[0].id }
}
