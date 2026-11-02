import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  Object.entries(select).map(([key, value]) => [key, value === true || !value.select ? row[key]
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
