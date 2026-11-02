import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gzipSync } from 'node:zlib'

const { db } = vi.hoisted(() => {
  process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
  process.env.COGNITIVE_MODULE_ENABLED = 'true'
  return { db: {
  courseStudent: { findMany: vi.fn() }, compositeAssessment: { findMany: vi.fn() },
  compositeAssessmentAttempt: { findMany: vi.fn() },
} }
})
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../modules/composite/report-package-label', async importOriginal => {
  const actual = await importOriginal<typeof import('../../modules/composite/report-package-label')>()
  return { ...actual, getFrozenPackageSlotLabels: vi.fn(actual.getFrozenPackageSlotLabels) }
})
import { listAvailableForStudent } from '../../modules/composite/composite.service'
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
  id: 'assessment', code: 'SYNTHETIC', name: '合成组合', productKind: 'ASSESSMENT_BUNDLE',
  description: null, instruction: '合成说明', status: 'PUBLISHED', maxAttempts: 3,
  opensAt: null, expiresAt: null,
  course: { id: 'course', title: '合成课程', courseCode: 'C', isLibrary: false },
  trainingVariantFrozen: null, trainingFlowDraft: null, trainingFlowFrozen: null, trainingFlowDigest: null,
  reportPackageKey: 'synthetic', reportPackageVersion: '1', reportPackageSnapshotEncrypted: frozen,
  items, formSections: [section], ...override,
})
// Model Prisma's select instead of returning full rows regardless of projection.
const project = (row: Record<string, any>, select: Record<string, any>) => Object.fromEntries(
  Object.entries(select).filter(([, value]) => value !== false).map(([key, value]) => [key, value === true || !value.select ? row[key]
    : Array.isArray(row[key]) ? row[key].map((child: any) => project(child, value.select))
      : row[key] == null ? row[key] : project(row[key], value.select)]))
let source: ReturnType<typeof fixture>[]
beforeEach(() => {
  vi.clearAllMocks()
  source = [fixture()]
  db.courseStudent.findMany.mockResolvedValue([{ courseId: 'course' }])
  db.compositeAssessmentAttempt.findMany.mockResolvedValue([])
  db.compositeAssessment.findMany.mockImplementation(async ({ select }) => source.map(row => project(row, select)))
})
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
    const cards = (rows: any[]) => rows.map(({ instruction, items, units, formSections, ...card }) => card)
    expect(cards(summary)).toEqual(cards(detail))
    expect(summary).toHaveLength(475)
    expect(summary.every(row => row.items.length === 0 && row.units.length === 0 && row.formSections.length === 0 && row.instruction === null)).toBe(true)
    expect(getFrozenPackageSlotLabels).not.toHaveBeenCalled()
    const select = db.compositeAssessment.findMany.mock.calls.at(-1)![0].select
    expect(select.reportPackageSnapshotEncrypted).toBe(false)
    expect(select.instruction).toBe(false)
    expect(select.items.select.scale).toBe(false)
    expect(select.items.select.cognitiveAssignment).toBe(false)
    expect(select.formSections).toEqual({ select: { id: true } })
    expect(select.trainingFlowDraft).toBe(true)
    expect(select.trainingFlowFrozen).toBe(true)
    expect(select.trainingFlowDigest).toBe(true)
    expect(select.trainingVariantFrozen).toBe(true)
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
    expect(await listAvailableForStudent('student', 0, 'denied', true)).toEqual([])
    expect(db.compositeAssessment.findMany).not.toHaveBeenCalled()
  })
})
