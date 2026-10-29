import {privateFormDraftResourcePolicy} from '../education-tools/private-tool.form-draft-policy'
import {readPrivateCompositionRunSources} from '../education-tools/private-tool.composition-source'
import {lockCompositionLibraryUses,assertLockedLibraryUseTime,type LockedEducationLibraryUses} from '../education-tools/library-source.use'
import {privateCompositionRunTrackInput} from '../education-tools/private-tool.run-contract'
import {assertPrivateScaleRunWorkflow} from './educationPrivateScaleContext'
import {isStudentCompositionKey} from '../huiteacher/studentComposition.policy'
import {assertStudentCompositionRunUse,assertStudentCompositionSelection} from '../huiteacher/studentCompositionResource'
import {assertPrivateScaleRunResource,assertPrivateFormRunResource} from './educationPrivateScaleContext'
import {privateRunTrackInput,privateFormRunTrackInput,assertPrivateRunSelection,assertPrivateAdministrationSelection} from '../education-tools/private-tool.run-contract'
import {assertRunTrackNarrowing,relationalEntryToRunPolicy} from './resourceAuthority'
import {assertEducationLibraryPopulationSupport} from './educationLibraryPopulation'
import {assertEducationRunLibraryResources,readEducationRunLibraryContext,lockAndAssertEducationRunWorkflow} from './educationLibraryContext'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import type { RunResourceRef, RunTrackNarrowingRequest } from './resourceAuthority'

export type AssessmentRunStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED'
export type RunExecutionStatus = 'ASSIGNED' | 'STARTED' | 'COMPLETED' | 'EXPIRED' | 'REVOKED'
export type RunActorProvenanceKind = 'ORG_MEMBER' | 'EXTERNAL_PARENT'
export type RunActorRole = 'TEACHER' | 'STUDENT' | 'COUNSELOR' | 'CLIENT' | 'PARENT'

type Tx = Prisma.TransactionClient

export interface AssessmentRunRecord {
  id: string
  organizationId: string
  name: string
  status: AssessmentRunStatus
  version: number
  createdByUserId: string
  intakeDeadline: Date | null
  publishedAt: Date | null
  closedAt: Date | null
  cancelledAt: Date | null
}

export interface AssessmentRunTrackRecord {
  id: string
  organizationId: string
  runId: string
  resourceFamily: string
  resourceKey: string
  resourceVersion: string
  subjectSelector: unknown
  respondentSelector: unknown
  requestedPolicy: RunTrackNarrowingRequest
  frozenResourcePolicy: unknown | null
  resourcePolicyHash: string | null
}

export interface RunActorSnapshotRecord {
  id: string
  organizationId: string
  runId: string
  provenanceKind: RunActorProvenanceKind
  userId: string
  membershipId: string | null
  actorRole: RunActorRole
  externalRelationshipRef: string | null
  snapshotPayload: unknown
  snapshotHash: string
}

export class AssessmentRunRepositoryError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 409) {
    super(message)
    this.name = 'AssessmentRunRepositoryError'
  }
}

const runProjection = `
  "id", "organization_id" AS "organizationId", "name", "status", "version",
  "created_by_user_id" AS "createdByUserId", "intake_deadline" AS "intakeDeadline",
  "published_at" AS "publishedAt", "closed_at" AS "closedAt", "cancelled_at" AS "cancelledAt"
`

export async function createAssessmentRunDraft(input: {
  organizationId: string
  name: string
  createdByUserId: string
  intakeDeadline?: Date | null
  // Campus Activity transaction may atomically bind the Run, never orphaning
  // a draft on an interrupted binding.
  tx?: Tx
}): Promise<AssessmentRunRecord> {
  const name = input.name.trim()
  if (!name) throw new AssessmentRunRepositoryError('RUN_NAME_REQUIRED', 'Run name is required', 400)
  const id = randomUUID()
  const rows = await (input.tx ?? prisma).$queryRaw<AssessmentRunRecord[]>`
    INSERT INTO "assessment_runs" (
      "id", "organization_id", "name", "created_by_user_id", "intake_deadline"
    ) VALUES (
      ${id}, ${input.organizationId}, ${name}, ${input.createdByUserId}, ${input.intakeDeadline ?? null}
    )
    RETURNING ${Prisma.raw(runProjection)}
  `
  return rows[0]
}

export async function addAssessmentRunTrackDraft(input: {
  runId: string
  organizationId: string
  resource: RunResourceRef
  subjectSelector?: unknown
  respondentSelector?: unknown
  requestedPolicy: RunTrackNarrowingRequest
  actorUserId?: string
  expectedVersion?: number
  expectedRunId?:string
  educationWorkflow?:{product:'SCHOOL'|'TEACHER';id:string}
  privateComposition?:{versionId:string;contentHash:string}
  privateCompositionLibraryLocks?:{proof:LockedEducationLibraryUses|undefined}
  // Trusted product adapter can bind draft + track in the same transaction.
  tx?: Tx
}): Promise<AssessmentRunTrackRecord> {
  const work=async (tx:Tx) => {
    const composition=input.resource.key.startsWith('education-composition:')
    let compositionLibraryUses:LockedEducationLibraryUses|undefined
    if(input.resource.key.startsWith('education-assessment:')||composition){
      if(!input.actorUserId||input.expectedVersion===undefined||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1)
        throw new AssessmentRunRepositoryError('EDUCATION_ASSESSMENT_EXPECTED_VERSION_REQUIRED','Current editor and exact draft version required',400)
      if(input.expectedRunId!==input.runId||!input.educationWorkflow)
        throw new AssessmentRunRepositoryError('EDUCATION_ASSESSMENT_EXPECTED_RUN_REQUIRED','Exact workflow and run binding required',409)
      const workflow=await readEducationRunLibraryContext(tx,input)
      if(!workflow||workflow.product!==input.educationWorkflow.product
        ||(workflow.product==='TEACHER'?workflow.teacherEventId:workflow.schoolCourseId)!==input.educationWorkflow.id)
        throw new AssessmentRunRepositoryError('EDUCATION_ASSESSMENT_WORKFLOW_REQUIRED','Exact education workflow required',403)
      const libraryUses=composition?(input.privateCompositionLibraryLocks?input.privateCompositionLibraryLocks.proof:await lockCompositionLibraryUses(tx,{entry:workflow.product,organizationId:input.organizationId,
        principal:{userId:input.actorUserId,accountDomain:'SCHOOL'}},[input.resource.key])):undefined
      compositionLibraryUses=libraryUses
      const current=await lockAndAssertEducationRunWorkflow(tx,{...input,actorUserId:input.actorUserId,purpose:'EDIT'},workflow)
      if(!composition&&workflow.product==='TEACHER'&&await tx.huiteacherStudentEvaluationConfig.findUnique({where:{
        organizationId_eventId:{organizationId:input.organizationId,eventId:input.educationWorkflow.id}},select:{id:true}}))
        throw new AssessmentRunRepositoryError('HUITEACHER_STUDENT_EVAL_TRACK_READONLY','Student evaluation tracks require their protected workflow',403)
      if(composition){
        const selected=privateCompositionRunTrackInput.parse({expectedVersion:input.expectedVersion,privateComposition:input.privateComposition,
          subjectSelector:input.subjectSelector,respondentSelector:input.respondentSelector,targetPolicy:input.requestedPolicy.targetPolicy})
        let editor:{context:import('../education-tools/private-tool.contracts').PrivateToolContext;schoolAdmin:boolean}
        if(isStudentCompositionKey(input.resource.key)){
          const protectedScope=await assertStudentCompositionRunUse(tx,{...input,actorUserId:input.actorUserId,ref:input.resource})
          assertStudentCompositionSelection({...selected,requestedPolicy:input.requestedPolicy},protectedScope)
          editor={context:{entry:'TEACHER',organizationId:input.organizationId,principal:{userId:input.actorUserId,accountDomain:'SCHOOL'}},schoolAdmin:false}
        }else editor=await assertPrivateScaleRunWorkflow(tx,{...input,actorUserId:input.actorUserId},current)
        const sources=await readPrivateCompositionRunSources(tx,editor.context,[input.resource],{lockForUse:true,libraryUses}),source=sources.get(input.resource.key)!
        if(source.origin.versionId!==selected.privateComposition.versionId||source.origin.contentHash!==selected.privateComposition.contentHash)
          throw new AssessmentRunRepositoryError('PRIVATE_COMPOSITION_VERSION_MISMATCH','Exact fixed version required',409)
        const mode=source.origin.variantKey.split(':')[1]
        assertPrivateAdministrationSelection(mode,selected)
        if(editor.context.entry==='SCHOOL'&&!editor.schoolAdmin&&mode==='TEACHER_REPORT'&&selected.targetPolicy?.mode!=='HOMEROOM_TEACHER')
          throw new AssessmentRunRepositoryError('PRIVATE_TOOL_HOMEROOM_TARGET_REQUIRED','Psychology drafts require explicit homeroom target',403)
        assertEducationLibraryPopulationSupport([input])
        assertRunTrackNarrowing(source.policy,input.requestedPolicy)
      }else{
        const {assertEducationAssessmentRunUse}=await import('../education-tools/assessment-resource.authority')
        const source=await assertEducationAssessmentRunUse(tx,{...input,actorUserId:input.actorUserId})
        assertRunTrackNarrowing(relationalEntryToRunPolicy(source.entry),input.requestedPolicy)
      }
    }
    if(input.resource.key.startsWith('library-scale:'))assertEducationLibraryPopulationSupport([input])
    if(input.resource.key.startsWith('private-scale:')||input.resource.key.startsWith('private-form:')){
      const form=input.resource.key.startsWith('private-form:')
      if(input.resource.family!==(form?'FORM':'SCALE')||!input.actorUserId||!input.expectedVersion)
        throw new AssessmentRunRepositoryError('PRIVATE_TOOL_DRAFT_CONTEXT_REQUIRED','Private draft editor and expected version required',403)
      const checked=await (form?assertPrivateFormRunResource:assertPrivateScaleRunResource)(tx,{...input,actorUserId:input.actorUserId})
      const [population,responseMode]=checked.source.origin.variantKey.split(':')
      const selected=(form?privateFormRunTrackInput:privateRunTrackInput).parse({expectedVersion:input.expectedVersion,
        [form?'privateForm':'privateScale']:{versionId:checked.source.origin.versionId,contentHash:checked.source.origin.contentHash,administration:{population,responseMode}},
        subjectSelector:input.subjectSelector,respondentSelector:input.respondentSelector,targetPolicy:input.requestedPolicy.targetPolicy})
      assertPrivateRunSelection(selected)
      if(checked.context.entry==='SCHOOL'&&!checked.schoolAdmin&&responseMode==='TEACHER_REPORT'&&selected.targetPolicy?.mode!=='HOMEROOM_TEACHER')
        throw new AssessmentRunRepositoryError('PRIVATE_TOOL_HOMEROOM_TARGET_REQUIRED','Psychology drafts require explicit homeroom target',403)
      assertEducationLibraryPopulationSupport([input])
      assertRunTrackNarrowing(form?privateFormDraftResourcePolicy(checked.source):relationalEntryToRunPolicy(checked.source.resourceEntry),input.requestedPolicy)
    }else if(input.actorUserId&&!composition)await assertEducationRunLibraryResources(tx,{...input,actorUserId:input.actorUserId,resources:[input.resource],purpose:'EDIT'})
    else if(input.resource.key.startsWith('library-scale:'))throw new AssessmentRunRepositoryError('EDUCATION_LIBRARY_ACTOR_REQUIRED','Current editor required',403)
    const runs = await tx.$queryRaw<Array<{ status: AssessmentRunStatus; version:number }>>`
      SELECT "status", "version" FROM "assessment_runs"
      WHERE "organization_id" = ${input.organizationId} AND "id" = ${input.runId}
      FOR UPDATE
    `
    if (!runs[0]) throw new AssessmentRunRepositoryError('RUN_NOT_FOUND', 'Run not found', 404)
    if (runs[0].status !== 'DRAFT') {
      throw new AssessmentRunRepositoryError('RUN_STATE_CONFLICT', 'Only DRAFT Run may be edited', 409)
    }
    if(input.expectedVersion!==undefined&&runs[0].version!==input.expectedVersion)
      throw new AssessmentRunRepositoryError('RUN_VERSION_CONFLICT','Draft version changed',409)
    await assertLockedLibraryUseTime(tx,compositionLibraryUses)
    const id = randomUUID()
    const subjectJson = JSON.stringify(input.subjectSelector ?? {})
    const respondentJson = JSON.stringify(input.respondentSelector ?? {})
    const requestedJson = JSON.stringify(input.requestedPolicy)
    const rows = await tx.$queryRaw<AssessmentRunTrackRecord[]>`
      INSERT INTO "assessment_run_tracks" (
        "id", "organization_id", "run_id", "resource_family", "resource_key", "resource_version",
        "subject_selector", "respondent_selector", "requested_policy"
      ) VALUES (
        ${id}, ${input.organizationId}, ${input.runId}, ${input.resource.family}, ${input.resource.key}, ${input.resource.version},
        ${subjectJson}::jsonb, ${respondentJson}::jsonb, ${requestedJson}::jsonb
      )
      RETURNING "id", "organization_id" AS "organizationId", "run_id" AS "runId",
        "resource_family" AS "resourceFamily", "resource_key" AS "resourceKey", "resource_version" AS "resourceVersion",
        "subject_selector" AS "subjectSelector", "respondent_selector" AS "respondentSelector",
        "requested_policy" AS "requestedPolicy", "frozen_resource_policy" AS "frozenResourcePolicy",
        "resource_policy_hash" AS "resourcePolicyHash"
    `
    await tx.$executeRaw`
      UPDATE "assessment_runs"
      SET "version" = "version" + 1, "updated_at" = transaction_timestamp()
      WHERE "id" = ${input.runId}
    `
    return rows[0]
  }
  return input.tx?work(input.tx):prisma.$transaction(work,{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}

export async function lockRun(tx: Tx, organizationId: string, runId: string): Promise<AssessmentRunRecord> {
  const rows = await tx.$queryRaw<AssessmentRunRecord[]>`
    SELECT ${Prisma.raw(runProjection)}
    FROM "assessment_runs"
    WHERE "organization_id" = ${organizationId} AND "id" = ${runId}
    FOR UPDATE
  `
  if (!rows[0]) throw new AssessmentRunRepositoryError('RUN_NOT_FOUND', 'Run not found', 404)
  return rows[0]
}

export async function listRunTracks(tx: Tx, organizationId: string, runId: string): Promise<AssessmentRunTrackRecord[]> {
  return tx.$queryRaw<AssessmentRunTrackRecord[]>`
    SELECT "id", "organization_id" AS "organizationId", "run_id" AS "runId",
      "resource_family" AS "resourceFamily", "resource_key" AS "resourceKey", "resource_version" AS "resourceVersion",
      "subject_selector" AS "subjectSelector", "respondent_selector" AS "respondentSelector",
      "requested_policy" AS "requestedPolicy", "frozen_resource_policy" AS "frozenResourcePolicy",
      "resource_policy_hash" AS "resourcePolicyHash"
    FROM "assessment_run_tracks"
    WHERE "organization_id" = ${organizationId} AND "run_id" = ${runId}
    ORDER BY "created_at", "id"
    FOR UPDATE
  `
}

export async function insertRunActorSnapshot(tx: Tx, input: {
  organizationId: string
  runId: string
  provenanceKind: RunActorProvenanceKind
  userId: string
  membershipId?: string | null
  actorRole: RunActorRole
  externalRelationshipRef?: string | null
  snapshotPayload: unknown
}): Promise<RunActorSnapshotRecord> {
  const id = randomUUID()
  const snapshotHash = canonicalHash(input.snapshotPayload)
  const payload = JSON.stringify(input.snapshotPayload)
  const rows = await tx.$queryRaw<RunActorSnapshotRecord[]>`
    INSERT INTO "assessment_run_actor_snapshots" (
      "id", "organization_id", "run_id", "provenance_kind", "user_id", "membership_id", "actor_role",
      "external_relationship_ref", "snapshot_payload", "snapshot_hash"
    ) VALUES (
      ${id}, ${input.organizationId}, ${input.runId}, ${input.provenanceKind}, ${input.userId}, ${input.membershipId ?? null},
      ${input.actorRole}, ${input.externalRelationshipRef ?? null}, ${payload}::jsonb, ${snapshotHash}
    )
    RETURNING "id", "organization_id" AS "organizationId", "run_id" AS "runId",
      "provenance_kind" AS "provenanceKind", "user_id" AS "userId", "membership_id" AS "membershipId",
      "actor_role" AS "actorRole", "external_relationship_ref" AS "externalRelationshipRef",
      "snapshot_payload" AS "snapshotPayload", "snapshot_hash" AS "snapshotHash"
  `
  return rows[0]
}

export async function insertRunRelationshipSnapshot(tx: Tx, input: {
  organizationId: string
  runId: string
  relationshipKind: string
  relationshipRef?: string | null
  subjectActorSnapshotId: string
  respondentActorSnapshotId: string
  snapshotPayload: unknown
}): Promise<{ id: string; snapshotHash: string }> {
  const id = randomUUID()
  const snapshotHash = canonicalHash(input.snapshotPayload)
  const payload = JSON.stringify(input.snapshotPayload)
  const rows = await tx.$queryRaw<Array<{ id: string; snapshotHash: string }>>`
    INSERT INTO "assessment_run_relationship_snapshots" (
      "id", "organization_id", "run_id", "relationship_kind", "relationship_ref",
      "subject_actor_snapshot_id", "respondent_actor_snapshot_id", "snapshot_payload", "snapshot_hash"
    ) VALUES (
      ${id}, ${input.organizationId}, ${input.runId}, ${input.relationshipKind}, ${input.relationshipRef ?? null},
      ${input.subjectActorSnapshotId}, ${input.respondentActorSnapshotId}, ${payload}::jsonb, ${snapshotHash}
    )
    RETURNING "id", "snapshot_hash" AS "snapshotHash"
  `
  return rows[0]
}

export async function insertRunExecution(tx: Tx, input: {
  organizationId: string
  runId: string
  trackId: string
  subjectActorSnapshotId: string
  respondentActorSnapshotId: string
  relationshipSnapshotId: string
  status?: RunExecutionStatus
  relationalAssignmentId?: string | null
  runtimeBindingKind?: string | null
  runtimeBindingRef?: string | null
  startedAt?: Date | null
  completedAt?: Date | null
}): Promise<{ id: string }> {
  const id = randomUUID()
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "assessment_run_executions" (
      "id", "organization_id", "run_id", "track_id", "subject_actor_snapshot_id", "respondent_actor_snapshot_id",
      "relationship_snapshot_id", "status", "relational_assignment_id", "runtime_binding_kind", "runtime_binding_ref",
      "started_at", "completed_at"
    ) VALUES (
      ${id}, ${input.organizationId}, ${input.runId}, ${input.trackId}, ${input.subjectActorSnapshotId},
      ${input.respondentActorSnapshotId}, ${input.relationshipSnapshotId}, ${input.status ?? 'ASSIGNED'},
      ${input.relationalAssignmentId ?? null}, ${input.runtimeBindingKind ?? null}, ${input.runtimeBindingRef ?? null},
      ${input.startedAt ?? null}, ${input.completedAt ?? null}
    )
    RETURNING "id"
  `
  return rows[0]
}
