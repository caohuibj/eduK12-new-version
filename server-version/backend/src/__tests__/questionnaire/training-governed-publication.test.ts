import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import type { GovernedArtifact } from '../../modules/survey/governed-tool.model'
import { inspectTrainingGovernedDefinition, trainingGovernedSections } from '../../modules/questionnaire-product/training-governed-definition'
import { authorizeTrainingGovernedPublication, materializeTrainingGovernedSource } from '../../modules/questionnaire-product/training-governed-source'

const mocks = vi.hoisted(() => ({
  read: vi.fn(), dependencies: vi.fn(), policies: vi.fn(), policy: vi.fn(), enabled: vi.fn(), authorize: vi.fn(),
}))
vi.mock('../../modules/survey/governed-tool.service', () => ({
  assertGovernedOnline: mocks.read, assertGovernedDependencies: mocks.dependencies,
}))
vi.mock('../../modules/assessment-governance/tool-entry-policy', () => ({
  assertToolEntryPolicy: mocks.policy, prefetchToolPolicyAdmission: mocks.policies,
}))
vi.mock('../../modules/tool-licensing/runtime', () => ({
  authorizeToolPublication: mocks.authorize, isExpandedToolLicensingEnabled: mocks.enabled,
  ToolLicenseAccessError: class {},
}))
vi.mock('../../config/database', () => ({ prisma: {} }))

const source = { id: '00000000-0000-4000-8000-000000000001', hash: 'a'.repeat(64) }
const form = (conditions: object = {}) => ({
  family: 'FORM', unit: { ref: { kind: 'FORM' }, instruction: '精确指导语', displayDefinition: {
    schemaVersion: 2, pages: [{ pageKey: 'p', title: '基础问题', description: '分组说明',
      questions: [{ itemKey: 'q', type: 'SHORT_TEXT', required: true, prompt: '你的答案', ...conditions }] }],
  } }, parameters: null, report: null, components: [], packageReport: null,
} as unknown as GovernedArtifact)
const combination = (): GovernedArtifact => ({
  ...form(), family: 'COMBINATION', unit: null,
  components: [1, 2].map(index => ({ slotKey: 'slot-' + index, title: '固定表单', source: { type: 'GOVERNED',
    id: source.id, hash: source.hash }, unit: form().unit! })),
})
const db = {
  user: { findUnique: vi.fn() }, compositeFormSection: { create: vi.fn() },
  compositeAssessmentItem: { createMany: vi.fn() },
  assessmentManagementEvent: { create: vi.fn(), findUnique: vi.fn() },
}
const tx = db as unknown as Prisma.TransactionClient
const base = { id: 'delivery-1', creationKey: 'training-governed:teacher:request', createdBy: 'teacher',
  productKind: 'QUESTIONNAIRE', status: 'DRAFT' }
const materialized = (artifact: GovernedArtifact) => {
  const parts = trainingGovernedSections(artifact)
  return {
    ...base, formSections: parts.map(({items: _items, ...section}, index) => ({ id: 'section-' + index, ...section })),
    items: parts.flatMap((section, index) => section.items.map(item => ({ ...item, formSectionId: 'section-' + index }))),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.enabled.mockReturnValue(true)
  db.user.findUnique.mockResolvedValue({ role: 'TEACHER', accountDomain: 'TRAINING', isActive: true, isFrozen: false, teacherApproved: true })
  db.assessmentManagementEvent.findUnique.mockResolvedValue({ action: 'TRAINING_GOVERNED_SOURCE', resourceId: base.id, actorId: 'teacher', metadata: source })
  db.compositeFormSection.create.mockResolvedValue({ id: 'section-0' })
  mocks.read.mockResolvedValue({ id: source.id, snapshot_hash: source.hash, family: 'FORM', tool_key: 'FORM:canonical-form', snapshot: form() })
})

describe('fixed governed Training form publication', () => {
  it('keeps instruction, pages, type and order in the existing typed form', () => {
    const parts = trainingGovernedSections(combination())
    expect(parts.map(part => part.description)).toEqual(['精确指导语\n\n分组说明', '精确指导语\n\n分组说明'])
    expect(parts.flatMap(part => part.items.map(item => item.formDefinition.itemKey))).toEqual(['governed_1', 'governed_2'])
    expect(parts[0].items[0]).toMatchObject({ formType: 'text_input', formLabel: '你的答案', required: true })
    expect(inspectTrainingGovernedDefinition(form({ allowRefusal: true }))).toEqual({ available: false, reason: expect.stringContaining('拒答') })
  })

  it('stores the exact source and no charge during draft creation', async () => {
    await materializeTrainingGovernedSource(tx, base.id, 'teacher', source)
    expect(db.compositeAssessmentItem.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({
      compositeAssessmentId: base.id, formSectionId: 'section-0', formType: 'text_input', type: 'FORM',
    })] })
    expect(db.assessmentManagementEvent.create).toHaveBeenCalledWith({ data: {
      id: base.id, actorId: 'teacher', resourceId: base.id, action: 'TRAINING_GOVERNED_SOURCE', metadata: source,
    } })
    expect(mocks.authorize).not.toHaveBeenCalled()
  })

  it('checks exact approvals and requests one active commercial license for the combination', async () => {
    const artifact = combination()
    mocks.read.mockResolvedValue({ id: source.id, snapshot_hash: source.hash, family: 'COMBINATION', tool_key: 'combo', snapshot: artifact })
    await authorizeTrainingGovernedPublication(tx, materialized(artifact))
    expect(mocks.policy).toHaveBeenCalledWith(tx, { resourceKey: 'governed-release:' + source.id, fingerprint: source.hash }, 'TRAINING')
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(tx, {
      product: 'TRAINING', subjectId: 'teacher', publicationId: base.id, toolKeys: ['COMBINATION:combo'], requireIssuedLicense: true,
    })
  })

  it('keeps ordinary questionnaires untouched and rejects changed fixed material before charging', async () => {
    const publication = materialized(form())
    await authorizeTrainingGovernedPublication(tx, { ...publication, creationKey: 'plain' })
    expect(db.assessmentManagementEvent.findUnique).not.toHaveBeenCalled()
    publication.items[0].formLabel = 'changed'
    await expect(authorizeTrainingGovernedPublication(tx, publication)).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
})
