import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gzipSync } from 'node:zlib'

const { db } = vi.hoisted(() => {
  process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
  process.env.COGNITIVE_MODULE_ENABLED = 'true'
  return { db: {
  courseStudent: { findMany: vi.fn() }, compositeAssessment: { findMany: vi.fn() },
  compositeAssessmentAttempt: { findMany: vi.fn() }, $queryRaw: vi.fn(),
} }
})
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../modules/composite/report-package-label', async importOriginal => {
  const actual = await importOriginal<typeof import('../../modules/composite/report-package-label')>()
  return { ...actual, getFrozenPackageSlotLabels: vi.fn(actual.getFrozenPackageSlotLabels) }
})
import { listAvailableForStudent } from '../../modules/composite/composite.service'
import { resetStartReadCachesForTests } from '../../modules/composite/start-read-cache'
import { config } from '../../config'
import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { getFrozenPackageSlotLabels } from '../../modules/composite/report-package-label'

const items = [
  { id: 'scale', type: 'SCALE', position: 2, scale: { name: 'live scale' } },
  { id: 'cognitive', type: 'COGNITIVE', position: 0, cognitiveAssignment: { title: 'live assignment' } },
  { id: 'context', type: 'FORM', position: 1, formLabel: '合成资料' },
]
const section = { id: 'section', title: '合成表单', position: 1, description: null,
  contextSection: false, items: [{ id: 'context', contextKey: 'grade' }],
  compositeAssessmentId: 'assessment', createdAt: new Date(0), updatedAt: new Date(0) }
const frozen = encryptCognitivePayload({ snapshotVersion: 1, packageKey: 'synthetic', packageVersion: '1',
  packageDefinition: { slots: [{ position: 0, label: '冻结认知名称' }, { position: 2, label: '冻结量表名称' }] },
  analysisProtocolSnapshot: { synthetic: true } })
const fixture = (override: Record<string, unknown> = {}) => ({
  courseId: 'course', questionnaireCourses: [{courseId:'course',course:{isLibrary:false}}],
  id: 'assessment', code: 'SYNTHETIC', name: '合成组合', productKind: 'ASSESSMENT_BUNDLE',
  description: null, instruction: '合成说明', status: 'PUBLISHED', maxAttempts: 3,
  opensAt: null, expiresAt: null,
  course: { id: 'course', title: '合成课程', courseCode: 'C', isLibrary: false },
  trainingVariantFrozen: null, trainingFlowDraft: null, trainingFlowFrozen: null, trainingFlowDigest: null,
  reportPackageKey: 'synthetic', reportPackageVersion: '1', reportPackageSnapshotEncrypted: frozen,
  items, formSections: [section], ...override,
})
const presenceFlag = (value: unknown) => value === undefined ? undefined : value !== null
// Model Prisma's select instead of returning full rows regardless of projection.
const project = (row: Record<string, any>, select: Record<string, any>) => Object.fromEntries(
  Object.entries(select).filter(([, value]) => value !== false).map(([key, value]) => {
    if (key === '_count') {
      const counts = Object.fromEntries(Object.entries(value.select).map(([rel, spec]) => {
        const children = row[rel] ?? []
        const excluded = spec && typeof spec === 'object' ? (spec as { where?: { type?: { not?: string } } }).where?.type?.not : undefined
        return [rel, excluded ? children.filter((child: any) => child.type !== excluded).length : children.length]
      }))
      return [key, counts]
    }
    return [key, value === true || !value.select ? row[key]
      : Array.isArray(row[key]) ? row[key].map((child: any) => project(child, value.select))
        : row[key] == null ? row[key] : project(row[key], value.select)]
  }))
let source: ReturnType<typeof fixture>[]
beforeEach(() => {
  vi.stubEnv('COMPOSITE_AVAILABLE_CACHE_ENABLED', 'true')
  resetStartReadCachesForTests()
  vi.clearAllMocks()
  source = [fixture()]
  db.courseStudent.findMany.mockResolvedValue([{ courseId: 'course' }])
  db.compositeAssessmentAttempt.findMany.mockResolvedValue([])
  db.compositeAssessment.findMany.mockImplementation(async ({ select }) => source.map(row => project(row, select)))
  db.$queryRaw.mockImplementation(async () => source.map(row => {
    const trainingFlowDraft = presenceFlag(row.trainingFlowDraft)
    const trainingFlowFrozen = presenceFlag(row.trainingFlowFrozen)
    const trainingFlowDigest = presenceFlag(row.trainingFlowDigest)
    const trainingVariantFrozen = presenceFlag(row.trainingVariantFrozen)
    const flow = trainingFlowDraft === true || trainingFlowFrozen === true || trainingFlowDigest === true
    const nonForm = (row.items ?? []).filter((item: { type: string }) => item.type !== 'FORM').length
    return {
      id: row.id,
      trainingFlowDraft,
      trainingFlowFrozen,
      trainingFlowDigest,
      trainingVariantFrozen,
      // The module-on query returns NULL. JSON null and SQL NULL both map to false.
      hasCognitive: config.cognitiveModuleEnabled ? null : (row.items ?? []).some((item: { type: string }) => item.type === 'COGNITIVE'),
      moduleCount: flow ? null : nonForm + (row.formSections?.length ?? 0),
    }
  }))
})
const cards = (rows: any[]) => rows.map(({ instruction, items, units, formSections, ...card }) => card)
describe('student available projection', () => {
  it('keeps frozen labels, form sections and ordered units with one package read', async () => {
    const [row] = await listAvailableForStudent('student')
    expect(row).toMatchObject({ estimatedModules: 3, weightedVariants: false, canStartNewAttempt: true })
    expect(row.items.map((item: any) => item.label)).toEqual(['冻结量表名称', '冻结认知名称', '合成资料'])
    expect(row.units.map((unit: any) => [unit.id, unit.label, unit.contextSection])).toEqual([
      ['cognitive', '冻结认知名称', false], ['section', '合成表单', true], ['scale', '冻结量表名称', false],
    ])
    expect(row.formSections).toEqual([section])
    expect(getFrozenPackageSlotLabels).toHaveBeenCalledTimes(1)
    const select = db.compositeAssessment.findMany.mock.calls[0][0].select
    for (const field of ['analysisProtocolSnapshotEncrypted', 'trainingContentSnapshot', 'trainingFeedbackPolicy', 'trainingPersistencePolicy', 'trainingTimingPolicy', 'trainingReportSelectionDraft', 'trainingReferenceSelectionDraft']) {
      expect(select).not.toHaveProperty(field)
    }
  })
  it.each(['trainingFlowDraft', 'trainingFlowFrozen', 'trainingFlowDigest', 'trainingVariantFrozen'])('hides candidate labels when %s is set', async marker => {
    source = [fixture({ [marker]: marker.endsWith('Digest') ? 'digest' : {} })]
    const [row] = await listAvailableForStudent('student')
    expect(row).toMatchObject({ items: [], units: [], formSections: [],
      estimatedModules: marker === 'trainingVariantFrozen' ? 3 : null,
      weightedVariants: marker === 'trainingVariantFrozen' })
    expect(getFrozenPackageSlotLabels).not.toHaveBeenCalled()
  })
  it('keeps incomplete flow markers fail-closed', async () => {
    source = [fixture({ trainingFlowFrozen: undefined })]
    const [row] = await listAvailableForStudent('student')
    expect(row).toMatchObject({ estimatedModules: null, items: [], units: [], formSections: [] })
    expect(getFrozenPackageSlotLabels).not.toHaveBeenCalled()
  })
  it('retains every one of 475 authorized assessments and reads each package once', async () => {
    source = Array.from({ length: 475 }, (_, i) => fixture({ id: 'assessment-' + i }))
    const rows = await listAvailableForStudent('student')
    expect(rows.map((row: any) => row.id)).toEqual(source.map(row => row.id))
    expect(rows.every((row: any) => row.units.length === 3 && row.items.length === 3)).toBe(true)
    expect(getFrozenPackageSlotLabels).toHaveBeenCalledTimes(475)
    expect(db.compositeAssessment.findMany).toHaveBeenCalledTimes(1)
    expect(db.compositeAssessmentAttempt.findMany).toHaveBeenCalledTimes(1)
    expect(db.$queryRaw).not.toHaveBeenCalled()
    const select = db.compositeAssessment.findMany.mock.calls[0][0].select
    expect(select.trainingFlowDraft).toBe(true)
    expect(select.trainingFlowFrozen).toBe(true)
    expect(select.trainingFlowDigest).toBe(true)
    expect(select.trainingVariantFrozen).toBe(true)
    expect(select.items.select.scale).toEqual({ select: { name: true } })
    expect(db.compositeAssessmentAttempt.findMany.mock.calls[0][0].select.cognitiveSessions).toEqual({ select: { status: true, frozenAdmissionSnapshotHash: true } })
  })
})


describe('opt-in student catalog summary', () => {
  it('retains card state and all rows without loading or decoding detail payloads', async () => {
    source = Array.from({ length: 475 }, (_, i) => fixture({ id: 'assessment-' + i }))
    db.compositeAssessmentAttempt.findMany.mockResolvedValue([
      { id: 'active', compositeAssessmentId: 'assessment-0', status: 'IN_PROGRESS', progress: 12, taskSatisfaction: null, cognitiveSessions: [] },
      { id: 'finished', compositeAssessmentId: 'assessment-1', status: 'COMPLETED', progress: 100, taskSatisfaction: 'SATISFIED', cognitiveSessions: [] },
    ])
    const detail = await listAvailableForStudent('student', 0, 'course')
    vi.mocked(getFrozenPackageSlotLabels).mockClear()
    const summary = await listAvailableForStudent('student', 0, 'course', true)
    expect(cards(summary)).toEqual(cards(detail))
    expect(summary).toHaveLength(475)
    expect(summary.every(row => row.items.length === 0 && row.units.length === 0 && row.formSections.length === 0 && row.instruction === null)).toBe(true)
    expect(getFrozenPackageSlotLabels).not.toHaveBeenCalled()
    const select = db.compositeAssessment.findMany.mock.calls.at(-1)![0].select
    expect(select.reportPackageSnapshotEncrypted).toBe(false)
    expect(select.instruction).toBe(false)
    expect(select.items).toBe(false)
    expect(select.formSections).toBe(false)
    expect(select).not.toHaveProperty('_count')
    expect(select).not.toHaveProperty('trainingFlowDraft')
    expect(select).not.toHaveProperty('trainingFlowFrozen')
    expect(select).not.toHaveProperty('trainingFlowDigest')
    expect(select).not.toHaveProperty('trainingVariantFrozen')
    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
    const presenceSql = db.$queryRaw.mock.calls[0][0]
    const presenceText = presenceSql.strings.join('\n')
    expect(presenceText.match(/IS NOT NULL/g)).toHaveLength(4)
    expect(presenceText.match(/jsonb_typeof/g)).toHaveLength(3)
    expect(presenceText).toContain(`jsonb_typeof("training_flow_draft") <> 'null'`)
    expect(presenceText).toContain(`jsonb_typeof("training_flow_frozen") <> 'null'`)
    expect(presenceText).toContain(`jsonb_typeof("training_variant_frozen") <> 'null'`)
    expect(presenceText).toContain('"training_flow_digest" IS NOT NULL')
    expect(presenceText).toContain('NULL::boolean')
    expect(presenceText).not.toContain('EXISTS')
    expect(presenceText).not.toContain('::text')
    expect(presenceText).toContain('count(*)::int')
    expect(presenceSql.values).toEqual(source.map(row => row.id))
    expect(db.compositeAssessmentAttempt.findMany.mock.calls.at(-1)![0].select).not.toHaveProperty('cognitiveSessions')
    expect(db.compositeAssessment.findMany.mock.calls.at(-2)![0].select.trainingVariantFrozen).toBe(true)
    const bytes = (rows: unknown) => ({ json: Buffer.byteLength(JSON.stringify(rows)), gzip: gzipSync(JSON.stringify(rows)).byteLength })
    expect(bytes(summary).gzip).toBeLessThan(bytes(detail).gzip)
    console.info('COMPOSITE_SUMMARY_BYTES', JSON.stringify({ rows: 475, detail: bytes(detail), summary: bytes(summary), source: 'synthetic rows, not production timing' }))
  })
  it('does not broaden membership or hide flow/variant state in summary mode', async () => {
    source = [fixture({ trainingFlowFrozen: {} }), fixture({ id: 'variant', trainingVariantFrozen: {} })]
    const rows = await listAvailableForStudent('student', 0, 'course', true)
    expect(rows[0].estimatedModules).toBeNull()
    expect(rows[1]).toMatchObject({ weightedVariants: true, estimatedModules: 3 })
    expect(db.courseStudent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { studentId: 'student', status: { in: ['ACTIVE', 'APPROVED'] }, courseId: 'course' } }))
    db.courseStudent.findMany.mockResolvedValue([])
    db.compositeAssessment.findMany.mockClear()
    db.$queryRaw.mockClear()
    expect(await listAvailableForStudent('student', 0, 'denied', true)).toEqual([])
    expect(db.compositeAssessment.findMany).not.toHaveBeenCalled()
    expect(db.$queryRaw).not.toHaveBeenCalled()
  })
  it.each(['trainingFlowDraft', 'trainingFlowFrozen', 'trainingFlowDigest', 'trainingVariantFrozen'])('summary matches detail when %s is set', async marker => {
    source = [fixture({ [marker]: marker.endsWith('Digest') ? 'digest' : { frozen: true } })]
    const detail = await listAvailableForStudent('student', 0, 'course')
    const summary = await listAvailableForStudent('student', 0, 'course', true)
    expect(cards(summary)).toEqual(cards(detail))
    expect(summary[0]).toMatchObject({ items: [], units: [], formSections: [], instruction: null })
    expect(db.compositeAssessment.findMany.mock.calls.at(-1)![0].select).not.toHaveProperty(marker)
  })
  it('summary matches detail when flow and variant markers are both set', async () => {
    source = [fixture({ trainingFlowFrozen: { frozen: true }, trainingVariantFrozen: { variant: true } })]
    const detail = await listAvailableForStudent('student', 0, 'course')
    const summary = await listAvailableForStudent('student', 0, 'course', true)
    expect(detail[0]).toMatchObject({ estimatedModules: null, weightedVariants: true, items: [], units: [], formSections: [] })
    expect(cards(summary)).toEqual(cards(detail))
  })
  it('summary keeps an incomplete presence flag fail-closed', async () => {
    source = [fixture({ trainingFlowFrozen: undefined })]
    const detail = await listAvailableForStudent('student', 0, 'course')
    const summary = await listAvailableForStudent('student', 0, 'course', true)
    expect(detail[0]).toMatchObject({ estimatedModules: null, weightedVariants: false, items: [], units: [], formSections: [] })
    expect(cards(summary)).toEqual(cards(detail))
    expect(summary[0].instruction).toBeNull()
  })
  it('reloads markers through Prisma when the raw result misses a row', async () => {
    db.$queryRaw.mockResolvedValueOnce([])
    const detail = await listAvailableForStudent('student', 0, 'course')
    const summary = await listAvailableForStudent('student', 0, 'course', true)
    expect(cards(summary)).toEqual(cards(detail))
    const fallback = db.compositeAssessment.findMany.mock.calls.at(-1)![0].select
    expect(fallback.trainingFlowDraft).toBe(true)
    expect(fallback._count).toEqual({ select: { items: { where: { type: { not: 'FORM' } } }, formSections: true } })
    expect(fallback).not.toHaveProperty('items')
  })
  it('stays fail-closed when Prisma also omits the marker row', async () => {
    db.$queryRaw.mockResolvedValueOnce([])
    let calls = 0
    db.compositeAssessment.findMany.mockImplementation(async ({ select }) => {
      calls += 1
      return calls === 1 ? source.map(row => project(row, select)) : []
    })
    const [row] = await listAvailableForStudent('student', 0, 'course', true)
    expect(calls).toBe(2)
    expect(row).toMatchObject({ estimatedModules: null, weightedVariants: false, items: [], units: [], formSections: [], instruction: null })
  })
  it('reloads markers when a raw flag is not a boolean', async () => {
    db.$queryRaw.mockResolvedValueOnce([{
      id: 'assessment', trainingFlowDraft: 'null', trainingFlowFrozen: false, trainingFlowDigest: false,
      trainingVariantFrozen: false, hasCognitive: null, moduleCount: 3,
    }])
    const detail = await listAvailableForStudent('student', 0, 'course')
    const summary = await listAvailableForStudent('student', 0, 'course', true)
    expect(cards(summary)).toEqual(cards(detail))
    expect(db.compositeAssessment.findMany.mock.calls.at(-1)![0].select.trainingVariantFrozen).toBe(true)
  })
  it('summary treats a JSON-null marker flag the same as a JS null marker', async () => {
    source = [fixture({ trainingFlowDraft: null, trainingVariantFrozen: null })]
    const detail = await listAvailableForStudent('student', 0, 'course')
    const summary = await listAvailableForStudent('student', 0, 'course', true)
    expect(detail[0]).toMatchObject({ estimatedModules: 3, weightedVariants: false })
    expect(cards(summary)).toEqual(cards(detail))
  })
  it('summary hides new cognitive work when the module is off without loading item rows', async () => {
    config.cognitiveModuleEnabled = false
    try {
      source = [
        fixture({ id: 'hidden-cog' }),
        fixture({ id: 'paused', items }),
        fixture({ id: 'scale-only', items: items.filter(item => item.type !== 'COGNITIVE') }),
      ]
      db.compositeAssessmentAttempt.findMany.mockResolvedValue([
        { id: 'paused-attempt', compositeAssessmentId: 'paused', status: 'IN_PROGRESS', progress: 1, taskSatisfaction: null,
          cognitiveSessions: [{ status: 'IN_PROGRESS', frozenAdmissionSnapshotHash: null }] },
      ])
      const rows = await listAvailableForStudent('student', 0, 'course', true)
      expect(rows.map(row => row.id)).toEqual(['paused', 'scale-only'])
      expect(rows[0]).toMatchObject({ canStartNewAttempt: false, canContinue: false, admissionPaused: true, estimatedModules: 3 })
      expect(rows[1]).toMatchObject({ canStartNewAttempt: true, estimatedModules: 2, weightedVariants: false })
      expect(db.compositeAssessment.findMany.mock.calls[0][0].select.items).toBe(false)
      const presenceText = db.$queryRaw.mock.calls[0][0].strings.join('\n')
      expect(presenceText).toContain('EXISTS')
      expect(presenceText).toContain(`item."type" = 'COGNITIVE'::"CompositeAssessmentItemType"`)
      expect(presenceText).not.toContain('::text')
      expect(presenceText).not.toContain('NULL::boolean')
      expect(db.compositeAssessmentAttempt.findMany.mock.calls[0][0].select.cognitiveSessions).toEqual({
        where: { status: 'IN_PROGRESS' }, select: { status: true, frozenAdmissionSnapshotHash: true },
      })
    } finally {
      config.cognitiveModuleEnabled = true
    }
  })
})


describe('shared Available templates with live participant state',()=>{
 it('coalesces 150 cold catalog reads while reading current memberships and attempts separately',async()=>{
  const rows=await Promise.all(Array.from({length:150},(_,i)=>listAvailableForStudent('student-'+i)))
  expect(rows.every(row=>row.length===1)).toBe(true)
  expect(db.compositeAssessment.findMany).toHaveBeenCalledTimes(1)
  expect(db.courseStudent.findMany).toHaveBeenCalledTimes(150)
  expect(db.compositeAssessmentAttempt.findMany).toHaveBeenCalledTimes(150)
 })
 it('keeps archived Cognitive history visible only to its current member with an existing attempt',async()=>{
  const enabled=config.cognitiveModuleEnabled
  config.cognitiveModuleEnabled=false
  try{
   source=[fixture({status:'ARCHIVED'})]
   expect(await listAvailableForStudent('student')).toEqual([])
   db.compositeAssessmentAttempt.findMany.mockResolvedValue([{id:'historical',compositeAssessmentId:'assessment',status:'COMPLETED',cognitiveSessions:[]}])
   expect(await listAvailableForStudent('student')).toHaveLength(1)
   db.courseStudent.findMany.mockResolvedValue([])
   expect(await listAvailableForStudent('student')).toEqual([])
   expect(db.compositeAssessment.findMany).toHaveBeenCalledTimes(1)
  }finally{config.cognitiveModuleEnabled=enabled}
 })
})
