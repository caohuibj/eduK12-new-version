import { trainingReleaseQueryFixture } from './training-release-query.fixture'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
process.env.COGNITIVE_MODULE_ENABLED = 'true'

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    compositeAssessment: { findUnique: vi.fn(), update: vi.fn() },
    cognitiveAssignment: { findUnique: vi.fn() },
    compositeAssessmentItem: { create: vi.fn() },
    course: { findUnique: vi.fn() },
    scale: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    materialGrant: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  }
  // addItem materializes FORM sections inside the same transaction, so the
  // mock must expose $transaction and run the callback against itself.
  mockPrisma.$transaction = vi.fn(async (callback: any) => callback(mockPrisma))
  return { mockPrisma }
})

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { addItem, publishComposite, updateComposite } from '../../modules/composite/composite.service'
import { ADEXI_V2_DEFINITION } from '../../modules/scale/packages/adexi-v2'

const TEACHER = UserRole.TEACHER

const publishedConfig = {
  id: 'config-1',
  testType: 'fake',
  configVersion: '1.0.0',
  name: 'Fake 1.0.0',
  status: 'PUBLISHED',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: { trialCount: 3, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 },
}

const draftComposite = (overrides: Record<string, unknown> = {}) => ({
  id: 'composite-1',
  code: 'C-1',
  name: '综合测评 1',
  status: 'DRAFT',
  courseId: 'course-1',
  createdBy: 'teacher-a',
  publicEnabled: false,
  expiresAt: null,
  items: [],
  ...overrides,
})

const assignment = (overrides: Record<string, unknown> = {}) => ({
  id: 'asg-1',
  courseId: 'course-1',
  createdBy: 'teacher-a',
  status: 'PUBLISHED',
  title: 'Fake',
  config: publishedConfig,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$queryRaw.mockImplementation(trainingReleaseQueryFixture(async () => {
    const last = mockPrisma.compositeAssessment.findUnique.mock.results.at(-1)
    if (!last || last.type !== 'return') throw new Error('Expected an authoritative composite read before release lookup')
    return await last.value
  }))
  mockPrisma.compositeAssessmentItem.create.mockResolvedValue({ id: 'item-1' })
  mockPrisma.course.findUnique.mockResolvedValue({ id: 'course-1', creatorId: 'teacher-a' })
  mockPrisma.materialGrant.findUnique.mockResolvedValue(null)
  mockPrisma.user.findUnique.mockResolvedValue({ accountDomain: 'TRAINING' })
})

describe('addItem cognitive course match', () => {
  it('keeps non-Form modules required', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite())

    await expect(addItem('teacher-a', TEACHER, 'composite-1', {
      type: 'SCALE',
      scaleId: 'scale-1',
      required: false,
    })).rejects.toMatchObject({ statusCode: 400 })
    expect(mockPrisma.compositeAssessmentItem.create).not.toHaveBeenCalled()
  })

  it('allows a published assignment on the same course', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite())
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue(assignment())

    await addItem('teacher-a', TEACHER, 'composite-1', {
      type: 'COGNITIVE',
      cognitiveAssignmentId: 'asg-1',
      required: true,
    })

    expect(mockPrisma.compositeAssessmentItem.create).toHaveBeenCalled()
  })

  it('rejects a report-package wrapper in collection-only mode', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite())
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue(assignment({ listedStandalone: false }))

    await expect(addItem('teacher-a', TEACHER, 'composite-1', {
      type: 'COGNITIVE',
      cognitiveAssignmentId: 'asg-1',
      required: true,
    })).rejects.toMatchObject({ statusCode: 403 })
    expect(mockPrisma.compositeAssessmentItem.create).not.toHaveBeenCalled()
  })

  it('rejects an assignment from another course', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite())
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue(assignment({ courseId: 'course-2' }))

    await expect(addItem('teacher-a', TEACHER, 'composite-1', {
      type: 'COGNITIVE',
      cognitiveAssignmentId: 'asg-1',
      required: true,
    })).rejects.toMatchObject({ statusCode: 400, message: '认知任务必须与综合测评属于同一课程' })
    expect(mockPrisma.compositeAssessmentItem.create).not.toHaveBeenCalled()
  })

  it('rejects a cognitive item when the composite has no course', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({ courseId: null }))
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue(assignment())

    await expect(addItem('teacher-a', TEACHER, 'composite-1', {
      type: 'COGNITIVE',
      cognitiveAssignmentId: 'asg-1',
      required: true,
    })).rejects.toMatchObject({ statusCode: 400, message: '含认知模块的综合测评必须绑定课程' })
  })
})

describe('addItem scale grants', () => {
  it('forbids another teacher published scale without a grant', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite())
    mockPrisma.scale.findUnique.mockResolvedValue({ id: 'scale-other', creatorId: 'admin-1', status: 'PUBLISHED', instrumentClass: 'STANDARD', instrumentVersion: '2.0.0', definition: ADEXI_V2_DEFINITION })
    await expect(addItem('teacher-a', TEACHER, 'composite-1', {
      type: 'SCALE',
      scaleId: 'scale-other',
      required: true,
    })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('allows a granted published scale', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite())
    mockPrisma.scale.findUnique.mockResolvedValue({ id: 'scale-other', creatorId: 'admin-1', status: 'PUBLISHED', instrumentClass: 'STANDARD', instrumentVersion: '2.0.0', definition: ADEXI_V2_DEFINITION })
    mockPrisma.materialGrant.findUnique.mockResolvedValue({ id: 'g1' })
    await addItem('teacher-a', TEACHER, 'composite-1', {
      type: 'SCALE',
      scaleId: 'scale-other',
      required: true,
    })
    expect(mockPrisma.compositeAssessmentItem.create).toHaveBeenCalled()
  })

  it('keeps an existing scale item after a grant is revoked', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      items: [{ id: 'item-scale', type: 'SCALE', scaleId: 'scale-other' }],
    }))
    mockPrisma.scale.findUnique.mockResolvedValue({ id: 'scale-other', creatorId: 'admin-1', status: 'PUBLISHED' })
    expect(draftComposite({
      items: [{ id: 'item-scale', type: 'SCALE', scaleId: 'scale-other' }],
    }).items).toHaveLength(1)
    await expect(addItem('teacher-a', TEACHER, 'composite-1', {
      type: 'SCALE',
      scaleId: 'scale-other',
      required: true,
    })).rejects.toMatchObject({ statusCode: 403 })
  })

  it.each(['missing-release','wrong-digest'] as const)('retains real measurement publication rejection for %s',async failure=>{
    const source=draftComposite({items:[{id:'item-scale',type:'SCALE',scaleId:'scale-other',required:true,position:0,
      scale:{id:'scale-other',code:'adexi_v1',creatorId:'admin-1',status:'PUBLISHED',instrumentClass:'STANDARD',instrumentVersion:'2.0.0',definition:ADEXI_V2_DEFINITION}}]})
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(source)
    mockPrisma.materialGrant.findUnique.mockResolvedValue({id:'valid-use'})
    const rows=trainingReleaseQueryFixture(async()=>source)
    mockPrisma.$queryRaw.mockImplementation(async(query:any,...args:unknown[])=>{
      const sql=Array.from(query.strings??query).join(' ')
      const result=await rows(query,...args)
      if(failure==='missing-release'&&sql.includes('WITH scale_sources AS'))return result.map(row=>({...row,measurement_release_id:null}))
      if(failure==='wrong-digest'&&sql.includes('SELECT * FROM measurement_content_releases'))return result.map(row=>({...row,content_hash:'0'.repeat(64)}))
      return result
    })
    await expect(publishComposite('teacher-a',TEACHER,'composite-1')).rejects.toThrow(failure==='missing-release'?'CONTENT_TRAINING_RELEASE_REQUIRED':'CONTENT_RELEASE_HASH_MISMATCH')
    expect(mockPrisma.compositeAssessment.update).not.toHaveBeenCalled()
  })

  it('rejects a new publication after its scale grant is revoked', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      items: [{ id:'item-scale',type: 'SCALE', scaleId:'scale-other', required:true,position:0, scale: { id: 'scale-other', code:'adexi_v1', status: 'PUBLISHED', creatorId: 'admin-1', instrumentClass:'STANDARD',instrumentVersion:'2.0.0',definition:ADEXI_V2_DEFINITION } }],
    }))
    mockPrisma.materialGrant.findUnique.mockResolvedValue(null)
    mockPrisma.compositeAssessment.update.mockResolvedValue({ status: 'PUBLISHED' })
    mockPrisma.scale.findMany.mockResolvedValue([{id:'scale-other',creatorId:'admin-1',status:'PUBLISHED'}])
    await expect(publishComposite('teacher-a', TEACHER, 'composite-1')).rejects.toMatchObject({statusCode:403})
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'teacher-a' }, select: { accountDomain: true } })
    expect(mockPrisma.materialGrant.findUnique).toHaveBeenCalled()
    expect(mockPrisma.compositeAssessment.update).not.toHaveBeenCalled()
  })
})

describe('publishComposite cognitive course match', () => {
  it('refuses to publish when an existing cognitive item is on another course', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      items: [{
        type: 'COGNITIVE',
        cognitiveAssignment: assignment({ courseId: 'course-2' }),
      }],
    }))

    await expect(publishComposite('teacher-a', TEACHER, 'composite-1'))
      .rejects.toMatchObject({ statusCode: 400, message: '认知任务必须与综合测评属于同一课程' })
  })

  it('uses a published scientific configuration and its exact release as publication authority', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      items: [{
        id:'item-cognitive',position:0,required:true,type: 'COGNITIVE',
        cognitiveAssignment: assignment({config:{...publishedConfig,testType:'reaction',configVersion:'1.1.0',scoringVersion:'1.1.0',
          config:{totalTrials:20,foreperiodMinMs:700,foreperiodMaxMs:1500,timeoutMs:2000,readyDurationMs:1000,
            report:{reportVersion:'1.1.0',referenceMode:'simulated',referenceVersion:'lit-sim-k12-v0.2',referenceBand:'K7-9'}}}}),
      }],
    }))
    mockPrisma.compositeAssessment.update.mockResolvedValue({ status: 'PUBLISHED' })

    await publishComposite('teacher-a', TEACHER, 'composite-1')
    expect(mockPrisma.compositeAssessment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PUBLISHED' }),
    }))
  })
})

describe('updateComposite course change with cognitive items', () => {
  it('rejects changing courseId when the draft already has a cognitive module', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      items: [{ type: 'COGNITIVE', cognitiveAssignment: assignment() }],
    }))
    mockPrisma.course.findUnique.mockResolvedValue({ id: 'course-2', creatorId: 'teacher-a' })

    await expect(updateComposite('teacher-a', TEACHER, 'composite-1', { courseId: 'course-2' }))
      .rejects.toMatchObject({ statusCode: 400, message: '请先移除认知模块，或复制到目标课程' })
    expect(mockPrisma.compositeAssessment.update).not.toHaveBeenCalled()
  })

  it('allows changing courseId when the draft has no cognitive module', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      items: [{ type: 'SCALE', scale: { status: 'PUBLISHED' } }],
    }))
    mockPrisma.course.findUnique.mockResolvedValue({ id: 'course-2', creatorId: 'teacher-a' })
    mockPrisma.compositeAssessment.update.mockResolvedValue({ id: 'composite-1', courseId: 'course-2' })

    await updateComposite('teacher-a', TEACHER, 'composite-1', { courseId: 'course-2' })
    expect(mockPrisma.compositeAssessment.update).toHaveBeenCalled()
  })

  it('allows a no-op courseId patch when cognitive items exist', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      items: [{ type: 'COGNITIVE', cognitiveAssignment: assignment() }],
    }))
    mockPrisma.compositeAssessment.update.mockResolvedValue({ id: 'composite-1', courseId: 'course-1' })

    await updateComposite('teacher-a', TEACHER, 'composite-1', { courseId: 'course-1' })
    expect(mockPrisma.compositeAssessment.update).toHaveBeenCalled()
  })
})

describe('C04 direct composite typed authoring', () => {
  it('generates the database UUID and matching stable key in one insert for an optional typed field', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite())
    await addItem('teacher-a', TEACHER, 'composite-1', {
      type: 'FORM', formType: 'number', formLabel: '数值', required: false,
      formDefinition: { type: 'NUMBER', prompt: '数值', required: false, options: [], rows: [], min: -10, max: 10 },
    })
    const data = mockPrisma.compositeAssessmentItem.create.mock.calls[0][0].data
    expect(data.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(data.formDefinition.itemKey).toBe('q_' + data.id)
    expect(data.required).toBe(false)
    expect(data.formDefinition.min).toBe(-10)
    expect(mockPrisma.compositeAssessmentItem.create).toHaveBeenCalledTimes(1)
  })
  it('does not relax legacy composite optional authoring as a side effect', async () => {
    await expect(addItem('teacher-a', TEACHER, 'composite-1', {
      type: 'FORM', formType: 'text_input', formLabel: '旧题', required: false,
    })).rejects.toMatchObject({ statusCode: 400 })
    expect(mockPrisma.compositeAssessmentItem.create).not.toHaveBeenCalled()
  })
})
