import { randomUUID } from 'node:crypto'
import type { PrismaClient, User, UserRole } from '@prisma/client'
import type { AuthenticatedPrincipal } from '../../types'
import { assignStaffToClass } from '../../modules/organization/classRelationships'
import { createOrganizationUnit } from '../../modules/organization/structure'
import { replaceCampusRoster, setCampusRegistrationWindow, issueCampusActivationCodes, registerCampusStudent, approveCampusClass } from '../../modules/campus/admission.service'
import { createCampusActivity, readCampusActivity, changeCampusActivityStatus } from '../../modules/campus/activity.service'
import { allocateCampusActivityParticipants } from '../../modules/campus/activity.allocation'
import { createCampusActivityRunDraft } from '../../modules/campus/activity.runs'
import { createHuiteacherTarget, createHuiteacherEvent, createHuiteacherEventRunDraft, transitionHuiteacherEvent } from '../../modules/huiteacher/evaluation.service'
import { addAssessmentRunTrackDraft } from '../../modules/assessment-run/repository'
import { previewAssessmentRun, publishAssessmentRun } from '../../modules/assessment-run/publish'
import { createCustomScaleDefinition, hashScaleDefinition } from '../../modules/scale/scale-definition'
import { submit, review, prepareMediaManifest } from '../../modules/scale-library-governance/service'
import { grantEducationLibraryUseInTransaction } from '../../modules/scale-library-governance/education-distribution'
import { listEducationLibraryResourcePage } from '../../modules/scale-library-governance/education-catalog'
import { grantSyntheticHuischoolProduct } from './educationProductFixture'
import { publishRegisteredScaleFixture } from './registered-resource-fixture'

const name = (prefix: string) => prefix + randomUUID().replace(/-/g, '').slice(0, 32 - prefix.length)
const principal = (u: Pick<User, 'id' | 'username' | 'role'>): AuthenticatedPrincipal => ({ userId: u.id,
  username: u.username, role: u.role, platformRole: 'STANDARD', tokenVersion: 0, mustChangePassword: false, accountDomain: 'SCHOOL' })
async function seedSchool(db: PrismaClient) {
  const admin = await db.user.create({ data: { username: name('edadmin'), passwordHash: 'synthetic-only', accountDomain: 'SCHOOL', role: 'ADMIN' } })
  const organization = await db.organization.create({ data: { id: randomUUID(), name: name('Synthetic '), productDomain: 'SCHOOL', createdByUserId: admin.id } })
  const adminMember = await db.organizationMembership.create({ data: { id: randomUUID(), organizationId: organization.id, userId: admin.id, orgRole: 'ORG_ADMIN' } })
  await grantSyntheticHuischoolProduct(db, { organizationId: organization.id, adminUserId: admin.id, adminMembershipId: adminMember.id })
  const grade = await createOrganizationUnit({ organizationId: organization.id, unitKind: 'GRADE', name: '五年级' })
  const cls = await createOrganizationUnit({ organizationId: organization.id, unitKind: 'CLASS', name: '合成测试班', parentUnitId: grade.id })
  const manager = await db.user.create({ data: { username: name('edpsych'), passwordHash: 'synthetic-only', accountDomain: 'SCHOOL', role: 'TEACHER', teacherApproved: true } })
  const managerMember = await db.organizationMembership.create({ data: { id: randomUUID(), organizationId: organization.id, userId: manager.id } })
  await db.organizationPersonaGrant.create({ data: { id: randomUUID(), organizationId: organization.id, membershipId: managerMember.id, persona: 'COUNSELOR', grantedByUserId: admin.id } })
  await db.organizationCapabilityGrant.create({ data: { id: randomUUID(), organizationId: organization.id, membershipId: managerMember.id, capability: 'PSYCHOLOGY_STAFF', grantedByUserId: admin.id } })
  const studentNumber = name('S'), scope = { actor: principal(admin), organizationId: organization.id, classUnitId: cls.id }
  const roster = await replaceCampusRoster({ ...scope, studentNumbers: [studentNumber] })
  await setCampusRegistrationWindow({ ...scope, action: 'OPEN', closesAt: new Date(Date.now() + 30 * 60_000) })
  const codes = await issueCampusActivationCodes({ ...scope, count: 1, ttlMinutes: 25 })
  const student = await registerCampusStudent({ organizationId: organization.id, classUnitId: cls.id, studentNumber,
    activationCode: codes.codes[0], username: name('edstudent'), password: 'SyntheticPassword123' })
  await setCampusRegistrationWindow({ ...scope, action: 'CLOSE' })
  await approveCampusClass({ ...scope, actor: principal(manager), expectedRosterVersion: roster.rosterVersion })
  const member = await db.organizationMembership.findFirstOrThrow({ where: { organizationId: organization.id, userId: student.userId, validUntil: null } })
  const [assignment] = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM organization_student_class_assignments WHERE organization_id=${organization.id} AND membership_id=${member.id} AND class_unit_id=${cls.id}`
  if (!assignment) throw new Error('Real student registration did not create a class assignment')
  return { organizationId: organization.id, manager: principal(manager), schoolAdmin: principal(admin), participantUserId: student.userId,
    participantMembershipId: member.id, studentNumber, classUnitId: cls.id, studentMembershipId: member.id, studentClassAssignmentId: assignment.id }
}
async function seedTeacher(db: PrismaClient) {
  const user = (role: UserRole = 'TEACHER') => db.user.create({ data: { username: name('edteacher'), passwordHash: 'synthetic-only', accountDomain: 'SCHOOL', role, teacherApproved: true } })
  const manager = await user(), participant = await user()
  const organization = await db.organization.create({ data: { id: randomUUID(), name: name('Synthetic '), productDomain: 'SCHOOL', createdByUserId: manager.id } })
  const managerMember = await db.organizationMembership.create({ data: { id: randomUUID(), organizationId: organization.id, userId: manager.id, orgRole: 'ORG_ADMIN' } })
  const member = await db.organizationMembership.create({ data: { id: randomUUID(), organizationId: organization.id, userId: participant.id } })
  for (const membershipId of [managerMember.id, member.id]) await db.organizationPersonaGrant.create({ data: {
    id: randomUUID(), organizationId: organization.id, membershipId, persona: 'TEACHER', grantedByUserId: manager.id } })
  await db.educationProductEntitlement.create({ data: { organizationId: organization.id, product: 'HUITEACHER', grantedByUserId: manager.id } })
  await db.educationProductRoleGrant.create({ data: { id: randomUUID(), organizationId: organization.id, membershipId: managerMember.id,
    product: 'HUITEACHER', role: 'PRODUCT_ADMIN', grantedByUserId: manager.id } })
  return { organizationId: organization.id, manager: principal(manager), schoolAdmin: null, participantUserId: participant.id,
    participantMembershipId: member.id, studentNumber: null, classUnitId: null, studentMembershipId: null, studentClassAssignmentId: null }
}

/** Reusable identities/workflow population only, without installing another
 * library tool or running any existing tool's acceptance journey. */
export async function setupEducationRuntimeActors(db:PrismaClient,product:'SCHOOL'|'TEACHER'){
 return product==='SCHOOL'?seedSchool(db):seedTeacher(db)
}
/** Synthetic identities only; real source approval, grants, catalog, draft and
 * publication services. No registry override, fake execution or fake FINAL. */
export async function setupEducationLibraryRuntimeFixture(input: {
  db: PrismaClient; product: 'SCHOOL' | 'TEACHER'; publish?: boolean; trackCount?: number
  withReportImage?: boolean; contentAudience?: 'student' | 'teacher' | null
  responseMode?: 'SELF' | 'PARENT_REPORT' | 'TEACHER_REPORT'
  publisher?: 'PSYCHOLOGY'
}) {
  const { db, product } = input
  const seed = product === 'SCHOOL' ? await seedSchool(db) : await seedTeacher(db)
  const responseMode = input.responseMode ?? 'SELF'
  if (product !== 'SCHOOL' && responseMode !== 'SELF') throw new Error('Observer fixture is School-only')
  // Keep established admin observer fixtures unchanged. The opt-in verifies
  // the separately authorized own-activity psychologist publication path.
  const manager = responseMode === 'SELF' || input.publisher === 'PSYCHOLOGY' ? seed.manager : seed.schoolAdmin!
  const managerUserId = manager.userId, { organizationId } = seed
  const subjectUserId = seed.participantUserId, subjectMembershipId = seed.participantMembershipId
  let participantUserId = subjectUserId, participantMembershipId: string | null = subjectMembershipId
  if (responseMode !== 'SELF') {
    const observer = await db.user.create({ data: { username: name('edobserver'), passwordHash: 'synthetic-only', accountDomain: 'SCHOOL',
      role: responseMode === 'PARENT_REPORT' ? 'PARENT' : 'TEACHER', teacherApproved: responseMode === 'TEACHER_REPORT' } })
    participantUserId = observer.id
    if (responseMode === 'PARENT_REPORT') {
      // Parent population authority comes from the real approved child relation,
      // not a fabricated organization membership/persona for the parent.
      participantMembershipId = null
      await db.parentStudentRelationship.create({ data: { parentUserId: observer.id, studentUserId: subjectUserId,
        status: 'ACTIVE', approvedAt: new Date(), approvedByUserId: managerUserId } })
    } else {
      const member = await db.organizationMembership.create({ data: { id: randomUUID(), organizationId, userId: observer.id } })
      participantMembershipId = member.id
      await db.organizationPersonaGrant.create({ data: { id: randomUUID(), organizationId, membershipId: member.id,
        persona: 'TEACHER', grantedByUserId: managerUserId } })
      await assignStaffToClass({ organizationId, membershipId: member.id, classUnitId: seed.classUnitId!, staffRole: 'HOMEROOM' })
    }
  }
  const libraryAdmin = await db.user.create({ data: { username: name('edlibadmin'), passwordHash: 'synthetic-only', role: 'ADMIN', platformRole: 'SYSTEM_ADMIN', accountDomain: 'LEGACY' } })
  const author = await db.user.create({ data: { username: name('edlibauthor'), passwordHash: 'synthetic-only', role: 'TEACHER', teacherApproved: true, accountDomain: 'TRAINING' } })
  const definition = createCustomScaleDefinition()
  definition.respondentType = responseMode === 'SELF' ? (product === 'SCHOOL' ? 'student_self_report' : 'teacher_self_report') : responseMode.toLowerCase()
  definition.source.title = '合成教育公库量表'
  definition.items = [{ itemCode: 'Q1', sortOrder: 0, content: '本次支持体验', type: 'single', required: true, responseSetKey: 'default', randomizeOptions: false }]
  definition.scoring.itemRules = [{ itemCode: 'Q1', transform: { type: 'identity' } }]
  definition.scoring.scores = [{ key: 'support', type: 'total', label: '支持体验', direction: 'descriptive', canonical: true, displayPrecision: 1,
    source: { type: 'items', aggregation: 'sum', items: [{ itemCode: 'Q1', weight: 1 }] } }]
  definition.report.primaryScoreKeys = ['support']; definition.report.scoreOrder = ['support']
  definition.report.interpretations = [{ scoreKey: 'support', headline: '本次支持体验', source: { type: 'score_only' },
    summary: '本结果只描述本次填写时对支持资源的主观体验，可用于回想具体情境，不代表稳定的人格特征，也不能判断个人能力或心理疾病。请结合近期生活与学习工作背景理解，分数不用于比较他人。', bands: [], guidance: [] }]
  const audience = input.contentAudience === undefined ? (product === 'SCHOOL' ? 'student' : 'teacher') : input.contentAudience
  if (audience) definition.report.audienceContract = { schemaVersion: 1, respondent: responseMode === 'SELF' ? (product === 'SCHOOL' ? 'STUDENT_SELF' : 'ADULT_SELF') : responseMode,
    audience, locale: 'zh-CN', qcReview: { reviewer: 'Synthetic fixture editor', reviewedAt: '2026-10-22T00:00:00.000Z', basis: 'Synthetic descriptive feedback only; no diagnosis or normative inference.' } }
  // The storage transport is intentionally not part of this fixture. Image
  // tests must mock only the final asset bytes, not authorization/projection.
  const asset = input.withReportImage ? await db.storedAsset.create({ data: { id: randomUUID(), objectKey: 'synthetic-report/' + randomUUID(),
    ownerId: author.id, accessScope: 'PRIVATE', provider: 'local', mimeType: 'image/png', sizeBytes: 68, sha256: 'a'.repeat(64) } }) : null
  const imageReference = asset ? { assetId: asset.id, contentHash: asset.sha256, mimeType: asset.mimeType as 'image/png' } : null
  definition.report.rawScoreFeedback = { schemaVersion: 1, rules: [{ scoreKey: 'support', ranges: [{ key: 'descriptive', min: 0, max: 5,
    includeMax: true, text: '本次支持体验仅用于自我反思，不是诊断。', ...(imageReference ? { images: [{ asset: imageReference, altText: '合成反馈配图', order: 0 }] } : {}) }] }] }
  const scale = await db.scale.create({ data: { code: 'edlib_' + randomUUID().replace(/-/g, ''), name: '合成教育公库量表', status: 'PUBLISHED',
    creatorId: author.id, instrumentClass: 'CUSTOM_DESCRIPTIVE', definition, definitionHash: hashScaleDefinition(definition) } })
  const release = await publishRegisteredScaleFixture(db, scale.id)
  const manifest = await prepareMediaManifest(author.id, 'TRAINING', { releaseId: release.releaseId, dependencyReleaseIds: [] })
  const application = await submit(author.id, 'TRAINING', { requestId: randomUUID(), releaseId: release.releaseId,
    metadata: { title: scale.name, author: 'Synthetic author', copyright: 'Self authored; redistribution allowed', applicability: 'Synthetic isolated test',
      scoringDescription: 'One descriptive raw score', reportDescription: 'Self reflection only' },
    educationApplicability: { schemaVersion: 1, administrations: [{ population: product === 'SCHOOL' ? 'STUDENT' : 'TEACHER', responseMode }] },
    ...(imageReference ? { mediaConsent: { manifestHash: manifest.mediaManifest.manifestHash, shareWithAuthorizedUsers: true } } : {}) })
  const approved = await review(libraryAdmin.id, application.id, { expectedVersion: 1, decision: 'APPROVE', allowedProducts: ['TRAINING', 'SURVEY'], reason: 'Synthetic test approval' })
  if (!approved.entryId) throw new Error('Library approval did not create an entry')
  const granted = await db.$transaction(tx => grantEducationLibraryUseInTransaction(tx, libraryAdmin.id, approved.entryId!, {
    requestId: randomUUID(), product, organizationId, scopeKind: 'ORGANIZATION', userId: null }))
  const registered = granted.resources[0]
  if (!registered) throw new Error('Exact education declaration did not materialize a resource')
  const resource = { family: 'SCALE' as const, key: registered.resourceEntry.applicability.resourceKey, version: registered.resourceEntry.applicability.resourceVersion }
  let runId: string, workflow: { kind: 'ACTIVITY' | 'EVENT'; id: string }, open: () => Promise<unknown>
  if (product === 'SCHOOL') {
    const activity = await createCampusActivity({ actor: manager, organizationId, title: '合成心理活动', purpose: 'STUDENT_WELLBEING' })
    const scope = { actor: manager, organizationId, courseId: activity.id }
    await allocateCampusActivityParticipants({ ...scope, classUnitIds: [seed.classUnitId!], requestKey: randomUUID(), expectedVersion: 1 })
    const run = await createCampusActivityRunDraft({ ...scope, name: '公库学生自评' }); runId = run.id
    workflow = { kind: 'ACTIVITY', id: activity.id }
    open = async () => { const detail = await readCampusActivity(scope)
      const submitted = await changeCampusActivityStatus({ ...scope, action: 'SUBMIT', expectedVersion: detail.version })
      return changeCampusActivityStatus({ ...scope, action: 'OPEN', expectedVersion: submitted.version }) }
  } else {
    const target = await createHuiteacherTarget({ organizationId, actorUserId: managerUserId, kind: 'ORGANIZATION', name: '合成本校教师' })
    const event = await createHuiteacherEvent({ organizationId, actorUserId: managerUserId, targetId: target.id, kind: 'ASSESSMENT', title: '合成教师自评' })
    const run = await createHuiteacherEventRunDraft({ organizationId, actorUserId: managerUserId, eventId: event.id, name: '公库教师自评' }); runId = run.runId
    workflow = { kind: 'EVENT', id: event.id }
    open = () => transitionHuiteacherEvent({ organizationId, actorUserId: managerUserId, eventId: event.id, action: 'OPEN', expectedVersion: 1 })
  }
  const catalog = await db.$transaction(tx => listEducationLibraryResourcePage(tx, { product, organizationId, actorId: managerUserId, workflow }))
  if (!catalog.entries.some(entry => entry.applicability.resourceKey === resource.key)) throw new Error('Granted exact source is absent from real catalog')
  const a = registered.resourceEntry.applicability
  const requestedPolicy: Parameters<typeof addAssessmentRunTrackDraft>[0]['requestedPolicy'] = { subjectRoles: a.subjectRoles, respondentRoles: a.respondentRoles, relationshipKinds: responseMode === 'TEACHER_REPORT' ? a.relationshipKinds.filter(kind => kind === 'CLASS_TEACHER_STUDENT') : a.relationshipKinds,
    perspectives: a.perspectives, analysisMode: a.analysisMode, visibilityPolicyKey: a.visibilityPolicyKey, minimumRespondents: a.minimumRespondents,
    ...(responseMode === 'TEACHER_REPORT' ? { targetPolicy: { mode: input.publisher === 'PSYCHOLOGY' ? 'HOMEROOM_TEACHER' as const : 'ALL_CLASS_TEACHERS' as const } } : {}) }
  for (let index = 0; index < (input.trackCount ?? 1); index++) await addAssessmentRunTrackDraft({ organizationId, runId,
    actorUserId: managerUserId, resource, subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [subjectMembershipId] },
    respondentSelector: responseMode === 'PARENT_REPORT' ? { kind: 'RELATED_PARENT' } : { kind: 'MEMBERSHIP_IDS', membershipIds: [participantMembershipId!] }, requestedPolicy })
  const readVersion = async () => (await db.$queryRaw<Array<{ version: number }>>`SELECT version FROM assessment_runs WHERE id=${runId}`)[0].version
  const expectedVersion = await readVersion()
  const preview = async () => previewAssessmentRun({ organizationId, runId, actorUserId: managerUserId, expectedVersion: await readVersion() })
  const publish = async (tracking?:unknown) => publishAssessmentRun({ organizationId, runId, actorUserId: managerUserId, expectedVersion: await readVersion(),tracking })
  const executions = () => db.$queryRaw<Array<{ id: string }>>`SELECT e.id FROM assessment_run_executions e
    JOIN assessment_run_actor_snapshots r ON r.id=e.respondent_actor_snapshot_id AND r.run_id=e.run_id AND r.organization_id=e.organization_id
    WHERE e.run_id=${runId} AND e.organization_id=${organizationId} AND r.user_id=${participantUserId} ORDER BY e.id`
  if (input.publish !== false) { await open(); await publish() }
  return { ...seed, manager, participantUserId, participantMembershipId, subjectUserId, subjectMembershipId, responseMode, product, managerUserId, runId, entryId: approved.entryId, resource, grantId: granted.grant.id,
    expectedVersion, libraryAdminUserId: libraryAdmin.id, authorUserId: author.id, sourceScaleId: scale.id, release, definition,
    imageReference, workflow, catalog, requestedPolicy, open, preview, publish, executions,
    executionId: (await executions())[0]?.id ?? null, answers: [{ itemCode: 'Q1', responseValue: 'option_3' }] }
}

// Identity metadata only, for native-profile fixtures that reuse an already installed source.
export {seedSchool as seedEducationSchoolRuntimeIdentity,seedTeacher as seedEducationTeacherRuntimeIdentity}
