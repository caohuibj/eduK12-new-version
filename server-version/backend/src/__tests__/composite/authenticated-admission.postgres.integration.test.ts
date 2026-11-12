import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'
import { lockAnonymousAdmission, lockAuthenticatedAdmission } from '../../modules/composite/authenticated-admission-lock'

const url = integrationDatabaseUrl('AUTHENTICATED_ADMISSION_TEST_DATABASE_URL')
const suite = url ? describe : describe.skip
const prefix = 'admission-concurrency-' + randomUUID()
const teacher = prefix + '-teacher', a = prefix + '-a', b = prefix + '-b'
let db: typeof import('../../config/database')['prisma']
let runtime: typeof import('../../modules/composite/composite.service')
let courseId: string
const publications: string[] = []
const scaleIds: string[] = []
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { resolve, promise } }
async function fixture() {
  const id = prefix + '-' + publications.length
  publications.push(id)
  const row = await db.compositeAssessment.create({ data: {
    id, code: id, name: 'Synthetic concurrent admission', createdBy: teacher,
    productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', status: 'DRAFT', maxAttempts: 1,
    questionnaireCourses: { create: { courseId } },
    formSections: { create: { title: 'Synthetic form', position: 0, contextSection: false } },
  }, include: { formSections: true } })
  await db.compositeAssessmentItem.create({ data: {
    compositeAssessmentId: id, type: 'FORM', position: 0, required: true,
    formType: 'text_input', formLabel: 'Synthetic answer', formSectionId: row.formSections[0].id, formSectionPosition: 0,
  } })
  await db.compositeAssessment.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() } })
  return id
}
async function legacyFixture() {
  const id = prefix + '-' + publications.length
  publications.push(id)
  const row = await db.compositeAssessment.create({ data: {
    id, code: id, name: 'Synthetic legacy concurrent admission', createdBy: teacher,
    productKind: 'LEGACY_COMPOSITE', status: 'DRAFT', maxAttempts: 1, courseId,
    formSections: { create: { title: 'Synthetic form', position: 0, contextSection: false } },
  }, include: { formSections: true } })
  await db.compositeAssessmentItem.create({ data: {
    compositeAssessmentId: id, type: 'FORM', position: 0, required: true,
    formType: 'text_input', formLabel: 'Synthetic answer', formSectionId: row.formSections[0].id, formSectionPosition: 0,
  } })
  await db.compositeAssessment.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() } })
  return id
}
// Several CUSTOM_DESCRIPTIVE Scale children: parent START admits them all at
// once; children are created without repeating that admission per item.
async function scaleFixture(count = 3) {
  const id = prefix + '-' + publications.length
  publications.push(id)
  const { compileResearchScale } = await import('../../modules/survey/builder.compiler')
  const { hashScaleDefinition } = await import('../../modules/scale/scale-definition')
  const definition = compileResearchScale('Synthetic admission source', { schemaVersion: 1, respondentType: 'participant_self_report', aggregation: 'mean',
    responseOptions: [{ optionKey: 'low', label: 'Low', score: 0 }, { optionKey: 'high', label: 'High', score: 2 }],
    dimensions: [{ dimensionKey: 'total', label: 'Total', direction: 'descriptive' }],
    items: [{ itemKey: 'item', prompt: 'Synthetic item', required: true, reverse: false, dimensionKeys: ['total'] }] })
  const scales: string[] = []
  for (let i = 0; i < count; i++) {
    const scale = await db.scale.create({ data: { code: id + '-scale-' + i, name: 'Synthetic admission scale', creatorId: teacher, status: 'PUBLISHED',
      instrumentClass: 'CUSTOM_DESCRIPTIVE', instrumentVersion: '1', definition, definitionHash: hashScaleDefinition(definition) } })
    scales.push(scale.id); scaleIds.push(scale.id)
  }
  await db.compositeAssessment.create({ data: { id, code: id, name: 'Synthetic multi-scale admission', createdBy: teacher,
    productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', status: 'DRAFT', maxAttempts: 1,
    questionnaireCourses: { create: { courseId } },
    items: { create: scales.map((scaleId, position) => ({ type: 'SCALE' as const, position, required: true, scaleId })) } } })
  await db.compositeAssessment.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() } })
  return { id, scales }
}
suite('authenticated admission lock boundaries (real isolated PostgreSQL)', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    ;({ prisma: db } = await import('../../config/database'))
    runtime = await import('../../modules/composite/composite.service')
    await db.user.createMany({ data: [teacher,a,b].map((id,i) => ({ id, username: id,
      role: i === 0 ? 'TEACHER' as const : 'STUDENT' as const, passwordHash: 'non-login-fixture' })) })
    const course = await db.course.create({ data: { creatorId: teacher, title: 'Synthetic admission',
      courseCode: prefix, courseType: 'TRAINING_COURSE', status: 'PUBLISHED',
      students: { create: [a,b].map(studentId => ({ studentId, status: 'ACTIVE' as const })) },
    } })
    courseId = course.id
  }, 60000)
  afterAll(async () => {
    if (!db) return
    try {
      await db.assessment.deleteMany({ where: { scaleId: { in: scaleIds } } })
      await db.compositeAssessmentAttempt.deleteMany({ where: { compositeAssessmentId: { in: publications } } })
      await db.compositeAssessment.deleteMany({ where: { id: { in: publications } } })
      // Emergency-stop history is append-only; its synthetic Scale/owner are retained.
      const retained = (await db.scaleLibraryEmergencyStop.findMany({ where: { targetId: { in: scaleIds } } })).map(row => row.targetId)
      await db.scale.deleteMany({ where: { id: { in: scaleIds.filter(id => !retained.includes(id)) } } })
      if (courseId) await db.course.delete({ where: { id: courseId } })
      await db.user.deleteMany({ where: { id: { in: retained.length ? [a,b] : [teacher,a,b] } } })
    } finally { await db.$disconnect() }
  })
  it('admits a different student while the first student owns its admission transaction', async () => {
    const id = await fixture(), ready = deferred(), release = deferred()
    const held = db.$transaction(async tx => {
      await lockAuthenticatedAdmission(tx,id,a); ready.resolve(); await release.promise
    }, { timeout: 10000 })
    await ready.promise
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const started = await Promise.race([runtime.startUserAttempt(b,id),new Promise<never>((_,reject) => {
        timer = setTimeout(() => reject(new Error('Different student blocked behind a publication writer lock')),4000)
      })])
      expect(started.attempt).toMatchObject({ status: 'IN_PROGRESS' })
    } finally { if (timer) clearTimeout(timer); release.resolve(); await held }
  })
  it('serializes duplicate starts for one student and retains maxAttempts', async () => {
    const id = await fixture()
    const results = await Promise.all(Array.from({ length: 4 },() => runtime.startUserAttempt(a,id)))
    expect(new Set(results.map(row => row.attempt.id)).size).toBe(1)
    expect(await db.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: id, userId: a } })).toBe(1)
    await db.compositeAssessmentAttempt.update({ where: { id: results[0].attempt.id }, data: { status: 'COMPLETED' } })
    await expect(runtime.startUserAttempt(a,id)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('replays one multi-scale START: same attempt, one quota decision, one child per Scale', async () => {
    const { id, scales } = await scaleFixture(3)
    const results = await Promise.all(Array.from({ length: 4 }, () => runtime.startUserAttempt(a, id)))
    expect(new Set(results.map(row => row.attempt.id)).size).toBe(1)
    expect(await db.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: id, userId: a } })).toBe(1)
    const children = await db.assessment.findMany({ where: { compositeAttemptId: results[0].attempt.id } })
    expect(children.map(child => child.scaleId).sort()).toEqual([...scales].sort())
    expect((await runtime.startUserAttempt(a, id)).attempt.id).toBe(results[0].attempt.id)
    await db.compositeAssessmentAttempt.update({ where: { id: results[0].attempt.id }, data: { status: 'COMPLETED' } })
    await expect(runtime.startUserAttempt(a, id)).rejects.toMatchObject({ statusCode: 409 })
  }, 60000)
  it('orders a child Scale emergency stop before START: no admission commits after the stop returns', async () => {
    const { id, scales } = await scaleFixture(3)
    const stopped = scales[2], ready = deferred(), release = deferred()
    // Same writes as scale-library stopCollection(TRAINING_SCALE), held open.
    const stop = db.$transaction(async tx => {
      await tx.$executeRaw`UPDATE scales SET id=id WHERE id=${stopped}`
      await tx.scaleLibraryEmergencyStop.create({ data: { targetKind: 'TRAINING_SCALE', targetId: stopped, actorId: teacher, reason: 'Synthetic ordering fixture' } })
      ready.resolve(); await release.promise
    }, { timeout: 15000 })
    await ready.promise
    let settled = false
    const racing = runtime.startUserAttempt(b, id).then(v => { settled = true; return v }, e => { settled = true; throw e })
    racing.catch(() => undefined)
    await new Promise(resolve => setTimeout(resolve, 500))
    expect(settled).toBe(false)
    release.resolve(); await stop
    await expect(racing).rejects.toMatchObject({ statusCode: 409 })
    await expect(runtime.startUserAttempt(a, id)).rejects.toMatchObject({ statusCode: 409 })
    expect(await db.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: id } })).toBe(0)
    expect(await db.assessment.count({ where: { scaleId: { in: scales } } })).toBe(0)
  }, 60000)
  it('keeps archive behind admitted readers and refuses a new start after archive commits', async () => {
    const id = await fixture(), ready = deferred(), release = deferred(), updateStarted = deferred()
    const held = db.$transaction(async tx => {
      await lockAuthenticatedAdmission(tx,id,a); ready.resolve(); await release.promise
    }, { timeout: 10000 })
    await ready.promise
    let pid = 0
    const closing = db.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`
      pid=rows[0].pid; updateStarted.resolve()
      await tx.compositeAssessment.update({ where: { id }, data: { status: 'ARCHIVED' } })
    }, { timeout: 10000 })
    await updateStarted.promise
    try {
      let blocked = false
      for (let attempt=0;attempt<30;attempt++) {
        const [row] = await db.$queryRaw<Array<{blocked:boolean}>>`SELECT cardinality(pg_blocking_pids(${pid}::int))>0 AS blocked`
        if (row.blocked) { blocked=true;break }
        await new Promise(resolve => setTimeout(resolve,10))
      }
      expect(blocked).toBe(true)
    } finally { release.resolve(); await held; await closing }
    await expect(runtime.startUserAttempt(b,id)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('admits a different student on LEGACY_COMPOSITE while the first student owns its admission transaction', async () => {
    const id = await legacyFixture(), ready = deferred(), release = deferred()
    const held = db.$transaction(async tx => {
      await lockAuthenticatedAdmission(tx,id,a); ready.resolve(); await release.promise
    }, { timeout: 10000 })
    await ready.promise
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const started = await Promise.race([runtime.startUserAttempt(b,id),new Promise<never>((_,reject) => {
        timer = setTimeout(() => reject(new Error('Different student blocked behind a publication writer lock')),4000)
      })])
      expect(started.attempt).toMatchObject({ status: 'IN_PROGRESS' })
    } finally { if (timer) clearTimeout(timer); release.resolve(); await held }
  })
  it('serializes duplicate LEGACY_COMPOSITE starts for one student and retains maxAttempts', async () => {
    const id = await legacyFixture()
    const results = await Promise.all(Array.from({ length: 4 },() => runtime.startUserAttempt(a,id)))
    expect(new Set(results.map(row => row.attempt.id)).size).toBe(1)
    expect(await db.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: id, userId: a } })).toBe(1)
    await db.compositeAssessmentAttempt.update({ where: { id: results[0].attempt.id }, data: { status: 'COMPLETED' } })
    await expect(runtime.startUserAttempt(a,id)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('keeps LEGACY_COMPOSITE archive behind admitted readers and refuses a new start after archive commits', async () => {
    const id = await legacyFixture(), ready = deferred(), release = deferred(), updateStarted = deferred()
    const held = db.$transaction(async tx => {
      await lockAuthenticatedAdmission(tx,id,a); ready.resolve(); await release.promise
    }, { timeout: 10000 })
    await ready.promise
    let pid = 0
    const closing = db.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`
      pid=rows[0].pid; updateStarted.resolve()
      await tx.compositeAssessment.update({ where: { id }, data: { status: 'ARCHIVED' } })
    }, { timeout: 10000 })
    await updateStarted.promise
    try {
      let blocked = false
      for (let attempt=0;attempt<30;attempt++) {
        const [row] = await db.$queryRaw<Array<{blocked:boolean}>>`SELECT cardinality(pg_blocking_pids(${pid}::int))>0 AS blocked`
        if (row.blocked) { blocked=true;break }
        await new Promise(resolve => setTimeout(resolve,10))
      }
      expect(blocked).toBe(true)
    } finally { release.resolve(); await held; await closing }
    await expect(runtime.startUserAttempt(b,id)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('anonymous locks admit distinct participants concurrently on the same Composite', async () => {
    const id = await fixture(), ready = deferred(), release = deferred()
    const held = db.$transaction(async tx => {
      await lockAnonymousAdmission(tx, id, 'participant-a')
      ready.resolve()
      await release.promise
    }, { timeout: 15000 })
    await ready.promise
    let timer: ReturnType<typeof setTimeout> | undefined
    const other = db.$transaction(async tx => {
      await lockAnonymousAdmission(tx, id, 'participant-b')
    }, { timeout: 10000 })
    try {
      await Promise.race([other, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Different anonymous participant blocked by Composite lock')), 4000)
      })])
    } finally {
      if (timer) clearTimeout(timer)
      release.resolve()
      await held
      await other.catch(() => undefined)
    }
  }, 30000)

  it('anonymous locks serialize the same participant without blocking the entire Composite', async () => {
    const id = await fixture(), ready = deferred(), release = deferred(), competing = deferred()
    const held = db.$transaction(async tx => {
      await lockAnonymousAdmission(tx, id, 'participant-same')
      ready.resolve()
      await release.promise
    }, { timeout: 15000 })
    await ready.promise
    let competingPid = 0
    const contender = db.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
      competingPid = rows[0].pid
      competing.resolve()
      await lockAnonymousAdmission(tx, id, 'participant-same')
    }, { timeout: 15000 })
    await competing.promise
    try {
      let blocked = false
      for (let attempt = 0; attempt < 60; attempt++) {
        const [row] = await db.$queryRaw<Array<{ blocked: boolean }>>`
          SELECT cardinality(pg_blocking_pids(${competingPid}::int)) > 0 AS blocked
        `
        if (row.blocked) { blocked = true; break }
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      expect(blocked).toBe(true)
    } finally {
      release.resolve()
      await held
      await contender
    }
  }, 30000)

  it('anonymous SHARE holds publication archive until the admission transaction settles', async () => {
    const id = await fixture(), ready = deferred(), release = deferred(), writerStarted = deferred()
    const held = db.$transaction(async tx => {
      await lockAnonymousAdmission(tx, id, 'participant-archive')
      ready.resolve()
      await release.promise
    }, { timeout: 15000 })
    await ready.promise
    let writerPid = 0
    const archiving = db.$transaction(async tx => {
      const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
      writerPid = backend.pid
      writerStarted.resolve()
      await tx.compositeAssessment.update({ where: { id }, data: { status: 'ARCHIVED' } })
    }, { timeout: 15000 })
    await writerStarted.promise
    try {
      let blocked = false
      for (let attempt = 0; attempt < 60; attempt++) {
        const [row] = await db.$queryRaw<Array<{ blocked: boolean }>>`
          SELECT cardinality(pg_blocking_pids(${writerPid}::int)) > 0 AS blocked
        `
        if (row.blocked) { blocked = true; break }
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      expect(blocked).toBe(true)
    } finally {
      release.resolve()
      await held
      await archiving
    }
    await expect(runtime.startUserAttempt(b, id)).rejects.toMatchObject({ statusCode: 400 })
  }, 30000)
})
