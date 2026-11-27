import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { approveGovernedTool, submitGovernedPackage, submitOriginalForm } from '../../modules/survey/governed-tool.service'
import { create, publish } from '../../modules/questionnaire-product/service'
import { listTrainingGovernedSources } from '../../modules/questionnaire-product/training-governed-source'
import { createToolLicense, readToolLicense, terminateToolLicense } from '../../modules/tool-licensing/management'
import { getAttemptState, listAttemptsForTeacher, startUserAttempt } from '../../modules/composite/composite.service'
import { submitCompositeFormSectionFinal } from '../../modules/composite/final-submit.service'
import { publishScaleCourseLinks } from '../../modules/scale/scale-course-publication'
import { listScaleInstrumentSources } from '../../modules/scale/onboarding/instrument-registry'
import { scaleSourcePolicyIdentity } from '../../modules/scale/onboarding/source-snapshot'

const url = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/no_database')
const isolated = process.env.TOOL_LICENSING_TRAINING_TEST_DB === '1' &&
  ['localhost', '127.0.0.1'].includes(url.hostname) && url.port === '55434' &&
  url.pathname === '/tool_licensing_training_test_20261127'
const actorId = randomUUID()
const teacherId = randomUUID()
const studentId = randomUUID()
const courseId = randomUUID()
const prefix = 'training_license_fixture_' + randomUUID().replaceAll('-', '')
const proof = () => ({
  tokenVersion: 0, adminSessionId: randomUUID(), adminVerifiedAt: Math.floor(Date.now() / 1000),
  adminAuthenticationMethod: 'TOTP' as const,
})
const teacher = { userId: teacherId, role: UserRole.TEACHER }
const createDraft = (source: { id: string; hash: string }) => create(teacher, {
  requestId: randomUUID(), name: '合成 Training 投放', questionnaireType: 'COURSE',
  publicEnabled: false, courseIds: [courseId], governedSource: { id: source.id, hash: source.hash },
})

async function form(slug: string, refusal = false) {
  return submitOriginalForm(actorId, {
    requestId: randomUUID(), toolKey: prefix + slug, version: '1.0.0', title: '合成 Training 表单',
    statement: '隔离环境合成测试内容', reference: {},
    definition: { schemaVersion: 2, pages: [{ pageKey: 'intro', title: '第一组',
      questions: [{ itemKey: 'q1', type: 'SHORT_TEXT', prompt: '输入合成答案', required: true, ...(refusal ? { allowRefusal: true } : {}) }],
    }] },
  })
}

async function approve(row: { id: string; version: number; hash: string }, allowedProducts: string[] = ['SURVEY', 'TRAINING']) {
  return approveGovernedTool(actorId, row.id, {
    expectedVersion: row.version, hash: row.hash, reason: '隔离环境审核', decision: 'APPROVE', allowedProducts,
  }, proof())
}

describe.skipIf(!isolated)('Training governed authoring and formal publication on isolated PostgreSQL', () => {
  beforeAll(async () => {
    vi.stubEnv('TRAINING_TOOL_LICENSING_ENABLED', 'true')
    vi.stubEnv('DATA_ENCRYPTION_KEY', randomBytes(32).toString('hex'))
    await prisma.user.createMany({ data: [
      { id: actorId, username: prefix + '_admin', passwordHash: '-', role: 'ADMIN', platformRole: 'SYSTEM_ADMIN', accountDomain: 'TRAINING' },
      { id: teacherId, username: prefix + '_teacher', passwordHash: '-', role: 'TEACHER', accountDomain: 'TRAINING', teacherApproved: true },
      { id: studentId, username: prefix + '_student', passwordHash: '-', role: 'STUDENT', accountDomain: 'TRAINING' },
    ] })
    await prisma.course.create({ data: {
      id: courseId, title: '合成 Training 课程', courseCode: prefix, creatorId: teacherId,
      courseType: 'TRAINING_COURSE', status: 'PUBLISHED',
    } })
    await prisma.courseStudent.create({ data: { studentId, courseId, status: 'ACTIVE' } })
  })
  afterAll(async () => { vi.unstubAllEnvs(); await prisma.$disconnect() })

  it('approves current Form and combination, proves published quota and preserves admitted participant delivery', async () => {
    const approvedForm = await approve(await form('_plain'))
    expect(approvedForm.state).toBe('ONLINE')
    const composite = await submitGovernedPackage(actorId, {
      requestId: randomUUID(), family: 'COMBINATION', toolKey: prefix + '_combo', title: '合成双表单组合', version: '1.0.0',
      reference: {}, report: null,
      components: ['first','second'].map(slotKey => ({ slotKey, source: { type: 'GOVERNED', id: approvedForm.id, hash: approvedForm.hash } })),
    }, proof())
    const approvedCombo = await approve(composite)
    expect(approvedCombo.state).toBe('ONLINE')
    const catalog = await listTrainingGovernedSources(teacherId, {q: '合成'})
    expect(catalog.list.map(tool => tool.id)).toEqual(expect.arrayContaining([approvedForm.id, approvedCombo.id]))
    const standalone = await createDraft(approvedForm)
    const combo = await createDraft(approvedCombo)
    expect(standalone.governedSourceLocked).toBe(true)
    expect(combo.formSections).toHaveLength(2)
    await expect(publish(teacher, combo.id, { revision: combo.revision })).rejects.toMatchObject({ statusCode: 409 })
    const license = await createToolLicense({ actorUserId: actorId, actorSession: proof() }, {
      requestId: randomUUID(), product: 'TRAINING', subjectId: teacherId, reason: '合成许可',
      startsAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(),
      tools: [
        { key: approvedForm.toolKey, limit: 1 },
        { key: 'COMBINATION:' + approvedCombo.toolKey, limit: 1 },
      ],
    })
    expect((await publish(teacher, standalone.id, { revision: standalone.revision })).status).toBe('PUBLISHED')
    expect((await publish(teacher, combo.id, { revision: combo.revision })).status).toBe('PUBLISHED')
    expect((await readToolLicense(license.id)).tools.map(tool => tool.used)).toEqual([1, 1])
    const retry = await createDraft(approvedForm)
    await expect(publish(teacher, retry.id, { revision: retry.revision })).rejects.toMatchObject({ statusCode: 409 })
    expect((await prisma.compositeAssessment.findUniqueOrThrow({ where: { id: retry.id } })).status).toBe('DRAFT')
    const admitted = await startUserAttempt(studentId, combo.id)
    await terminateToolLicense({ actorUserId: actorId, actorSession: proof() }, license.id,
      { expectedRevision: license.revision, reason: '合成许可停止' })
    const attemptId = admitted.attempt.id
    expect((await startUserAttempt(studentId, combo.id)).attempt.id).toBe(attemptId)
    const sections = await prisma.compositeFormSection.findMany({
      where: { compositeAssessmentId: combo.id }, include: { items: true }, orderBy: { position: 'asc' },
    })
    for (const section of sections) {
      const state = await getAttemptState(attemptId, { userId: studentId })
      expect(state.currentItem).toMatchObject({ id: section.id, type: 'FORM_SECTION' })
      await submitCompositeFormSectionFinal({ attemptId, sectionId: section.id, userId: studentId,
        submissionId: randomUUID(), attemptEpoch: 1, definitionHash: state.currentItem!.definitionHash!,
        answers: section.items.map(item => ({ formItemId: item.id, value: '合成验证答案' })),
      })
    }
    expect((await listAttemptsForTeacher(teacherId, teacher.role, combo.id, { page: 1, pageSize: 20 }))
      .list.find(row => row.id === attemptId)).toMatchObject({ status: 'COMPLETED' })
  }, 30000)

  it('rejects a governed Form whose response semantics cannot be preserved by Training', async () => {
    const unsupported = await form('_refusal', true)
    await expect(approve(unsupported)).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('拒答') })
    const survey = await approve(unsupported, ['SURVEY'])
    expect(survey.state).toBe('ONLINE')
    await expect(createDraft(survey)).rejects.toMatchObject({ statusCode: 409 })
  }, 20000)

  it('reserves one persisted standalone course link and leaves the retry free', async () => {
    const nativeSource = listScaleInstrumentSources().find(source => source.executable?.releaseStatus === 'PUBLISHED')!
    const { instrumentKey, instrumentVersion } = nativeSource.identity
    const courseTeacher = await prisma.user.create({ data: {
      username: prefix + '_scale_teacher', passwordHash: '-', role: 'TEACHER', accountDomain: 'TRAINING', teacherApproved: true,
    } })
    const course = await prisma.course.create({ data: {
      title: '合成独立量表投放', courseCode: prefix + '_scale', creatorId: courseTeacher.id,
      courseType: 'TRAINING_COURSE', status: 'PUBLISHED',
    } })
    let scale = await prisma.scale.findUnique({ where: { code: instrumentKey } })
    if (!scale) {
      const measurement = await prisma.measurementContentRelease.create({ data: {
        id: randomUUID(), layer: 'MEASUREMENT', family: 'SCALE', key: instrumentKey, version: instrumentVersion,
        hashScheme: 'SHA256', contentHash: randomBytes(32).toString('hex'), content: {}, scope: { kind: 'PLATFORM' },
        assetRefs: [], publishedBy: actorId,
      } })
      scale = await prisma.scale.create({ data: {
        code: instrumentKey, name: '合成量表投放', creatorId: actorId, status: 'PUBLISHED', visibility: 'COURSE',
        instrumentClass: 'STANDARD', instrumentVersion, measurementReleaseId: measurement.id,
      } })
    }
    const nativeScale = scale
    const measurement = await prisma.measurementContentRelease.findUniqueOrThrow({ where: { id: nativeScale.measurementReleaseId! } })
    const approvalId = randomUUID(), trial = randomUUID(), hash = randomBytes(32).toString('hex')
    await prisma.$executeRaw`
      INSERT INTO survey_standard_releases (id,tool_key,combination_hash,snapshot,reference,state,approved_by)
      VALUES (${approvalId},${instrumentKey},${hash},
        jsonb_build_object('instrumentVersion',${instrumentVersion}::text,'title','合成量表投放'),'{}','APPROVED',${actorId})
    `
    await prisma.$executeRaw`
      INSERT INTO survey_standard_trials(id,release_id,run_id,case_index,answers,scores,report,record_hash)
      SELECT ${trial}||case_index,${approvalId},${trial},case_index,'[]','{}','{}',${hash} FROM generate_series(0,2) case_index
    `
    await prisma.$executeRaw`
      UPDATE survey_standard_releases SET state='ONLINE',latest_trial=${trial},
        measurement_release=jsonb_build_object('releaseId',${measurement.id}::text,'contentHash',${measurement.contentHash}::text)
      WHERE id=${approvalId}
    `
    for (const identity of [scaleSourcePolicyIdentity(nativeSource), { resourceKey: 'standard-release:' + approvalId, fingerprint: hash }]) {
      await prisma.$executeRaw`
        INSERT INTO survey_tool_policies (product,resource_key,fingerprint,decision,paused,reason,reviewed_by)
        VALUES ('TRAINING',${identity.resourceKey},${identity.fingerprint},'APPROVED',false,'合成测试',${actorId})
        ON CONFLICT (product,resource_key,fingerprint) DO NOTHING
      `
    }
    const license = await createToolLicense({ actorUserId: actorId, actorSession: proof() }, {
      requestId: randomUUID(), product: 'TRAINING', subjectId: courseTeacher.id, reason: '合成量表投放许可',
      startsAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(),
      tools: [{ key: 'SCALE:' + instrumentKey, limit: 1 }],
    })
    const attach = () => prisma.$transaction(tx => publishScaleCourseLinks(tx, nativeScale, [course]))
    expect(await attach()).toEqual({ count: 1 })
    expect(await attach()).toEqual({ count: 0 })
    expect((await readToolLicense(license.id)).tools[0].used).toBe(1)
    const delivery = await prisma.courseScale.findUniqueOrThrow({ where: { courseId_scaleId: { courseId: course.id, scaleId: nativeScale.id } } })
    const charges = await prisma.$queryRaw<Array<{publication_id: string}>>`SELECT publication_id FROM tool_license_charges WHERE license_id=${license.id}`
    expect(charges).toEqual([{ publication_id: delivery.id }])
  }, 20000)
})
