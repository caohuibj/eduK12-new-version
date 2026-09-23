/** Read-only durable completion probe scoped to one disposable fixture group. */
import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

if (process.env.PERF_ISOLATED_TEST_MODE !== '1') throw new Error('durable probe requires isolated test mode')
const databaseUrl = new URL(process.env.DATABASE_URL || '')
if (!process.env.PERF_FIXTURE_DB_NAME || decodeURIComponent(databaseUrl.pathname.slice(1)) !== process.env.PERF_FIXTURE_DB_NAME) {
  throw new Error('PERF_FIXTURE_DB_NAME must match DATABASE_URL')
}
const fixtureFile = process.env.PERF_FIXTURE_FILE
const group = process.env.PERF_FIXTURE_GROUP
if (!fixtureFile || !group) throw new Error('PERF_FIXTURE_FILE and PERF_FIXTURE_GROUP are required')
const groups = JSON.parse(readFileSync(fixtureFile, 'utf8')) as Record<string, Array<{
  path: string
  body: { submissionId: string; attemptEpoch: number }
  durableType?: 'situational' | 'scale' | 'cognitive' | 'form' | 'compositeForm'
  durableChildId?: string
  durableParentId?: string
  durableSectionId?: string
}>>
const fixtures = groups[group]
if (!fixtures?.length) throw new Error(`empty or absent fixture group ${group}`)

const expected = new Map<string, string>()
const IDs: Record<'situational' | 'scale' | 'cognitive' | 'form' | 'compositeForm', string[]> = {
  situational: [], scale: [], cognitive: [], form: [], compositeForm: [],
}
const formPairs: Array<{ parentId: string; sectionId: string }> = []
const compositeFormPairs: Array<{ parentId: string; sectionId: string }> = []
for (const fixture of fixtures) {
  if (fixture.durableType) {
    const type = fixture.durableType
    const id = type === 'form' || type === 'compositeForm'
      ? `${fixture.durableParentId}:${fixture.durableSectionId}` : fixture.durableChildId
    if (!id || id.includes('undefined') || expected.has(`${type}:${id}`)) throw new Error('invalid or duplicate explicit durable fixture identity')
    expected.set(`${type}:${id}`, fixture.body.submissionId)
    if (type === 'form') formPairs.push({ parentId: fixture.durableParentId!, sectionId: fixture.durableSectionId! })
    else if (type === 'compositeForm') compositeFormPairs.push({ parentId: fixture.durableParentId!, sectionId: fixture.durableSectionId! })
    else IDs[type].push(id)
    continue
  }
  const matches = [
    ['situational', /^\/api\/situational\/attempts\/([^/]+)\/submit$/],
    ['scale', /^\/api\/scales\/assessments\/([^/]+)\/submit$/],
    ['cognitive', /^\/api\/cognitive\/sessions\/([^/]+)\/submit$/],
    ['form', /^\/api\/questionnaires\/assessments\/([^/]+)\/form-sections\/([^/]+)\/submit$/],
  ] as const
  const found = matches.map(([type, pattern]) => ({ type, parts: fixture.path.match(pattern) })).find((item) => item.parts)
  if (!found?.parts) throw new Error(`unsupported durable fixture path: ${fixture.path}`)
  const id = found.type === 'form' ? `${found.parts[1]}:${found.parts[2]}` : found.parts[1]!
  if (expected.has(`${found.type}:${id}`)) throw new Error('duplicate durable fixture child')
  expected.set(`${found.type}:${id}`, fixture.body.submissionId)
  if (found.type === 'form') {
    formPairs.push({ parentId: found.parts[1]!, sectionId: found.parts[2]! })
  } else {
    IDs[found.type].push(id)
  }
}

async function main() {
const db = new PrismaClient()
try {
  const [situational, scale, cognitive, form, compositeForm, sjtRaw, cognitiveRaw, snapshots] = await Promise.all([
    IDs.situational.length ? db.situationalAttempt.findMany({ where: { id: { in: IDs.situational } }, select: { id: true, status: true, submissionId: true } }) : [],
    IDs.scale.length ? db.assessment.findMany({ where: { id: { in: IDs.scale } }, select: { id: true, status: true, submissionId: true, answers: true } }) : [],
    IDs.cognitive.length ? db.cognitiveSession.findMany({ where: { id: { in: IDs.cognitive } }, select: { id: true, status: true, submissionId: true } }) : [],
    formPairs.length ? db.questionnaireFormSectionAttempt.findMany({
      where: { OR: formPairs.map(({ parentId, sectionId }) => ({ questionnaireAssessmentId: parentId, sectionId })) },
      select: { questionnaireAssessmentId: true, sectionId: true, status: true, submissionId: true },
    }) : [],
    compositeFormPairs.length ? db.compositeFormSectionAttempt.findMany({
      where: { OR: compositeFormPairs.map(({ parentId, sectionId }) => ({ attemptId: parentId, sectionId })) },
      select: { attemptId: true, sectionId: true, status: true, submissionId: true },
    }) : [],
    IDs.situational.length ? db.situationalRawSubmission.count({ where: { attemptId: { in: IDs.situational } } }) : 0,
    IDs.cognitive.length ? db.cognitiveRawSubmission.count({ where: { sessionId: { in: IDs.cognitive } } }) : 0,
    [...IDs.situational, ...IDs.scale, ...IDs.cognitive].length ? db.assessmentUnitSnapshot.count({
      where: { sourceAttemptId: { in: [...IDs.situational, ...IDs.scale, ...IDs.cognitive] } },
    }) : 0,
  ])
  let completed = 0
  let wrongIdentity = 0
  const byType = {
    situational: { fixtureCount: IDs.situational.length, completed: 0 },
    scale: { fixtureCount: IDs.scale.length, completed: 0 },
    cognitive: { fixtureCount: IDs.cognitive.length, completed: 0 },
    form: { fixtureCount: formPairs.length, completed: 0 },
    compositeForm: { fixtureCount: compositeFormPairs.length, completed: 0 },
  }
  const inspect = (type: keyof typeof byType, id: string, status: string, submissionId: string | null) => {
    if (status !== 'COMPLETED') return
    if (submissionId !== expected.get(`${type}:${id}`)) {
      wrongIdentity += 1
      return
    }
    completed += 1
    byType[type].completed += 1
  }
  situational.forEach((row) => inspect('situational', row.id, row.status, row.submissionId))
  scale.forEach((row) => inspect('scale', row.id, row.status, row.submissionId))
  cognitive.forEach((row) => inspect('cognitive', row.id, row.status, row.submissionId))
  form.forEach((row) => inspect('form', `${row.questionnaireAssessmentId}:${row.sectionId}`, row.status, row.submissionId))
  compositeForm.forEach((row) => inspect('compositeForm', `${row.attemptId}:${row.sectionId}`, row.status, row.submissionId))
  console.log(JSON.stringify({
    group, fixtureCount: fixtures.length, completed, wrongIdentity, byType,
    rawRecords: { situational: sjtRaw, cognitive: cognitiveRaw, scaleAnswers: scale.filter((row) => row.answers != null).length },
    unitSnapshots: snapshots,
  }))
} finally {
  await db.$disconnect()
}
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
