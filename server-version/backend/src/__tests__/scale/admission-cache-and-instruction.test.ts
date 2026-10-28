import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GENERATED_SCALE_INSTRUMENT_SOURCES } from '../../modules/scale/onboarding/instruments.generated'
import { createScaleInstrumentRegistry, getScaleInstrumentRuntimePolicy } from '../../modules/scale/onboarding/instrument-registry'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import * as scoring from '../../modules/scale/scale-scoring'
import { installScaleInstrument, planScaleInstrumentInstall } from '../../modules/scale/onboarding/install'
import { materializeScaleInstrumentContent } from '../../modules/scale/onboarding/materialize'
import { planStandardScalePublication, publishStandardScale } from '../../modules/scale/onboarding/publish'
import { seedScalePackages } from '../../../prisma/seeds/scales'
import { resolveScaleAdmissionInstruction } from '../../modules/scale/onboarding/instruction-admission'

const state = vi.hoisted(() => ({ registry: null as any, deployment: null as any, freezeBeforeTransaction: false, actor: null as any }))
vi.mock('../../modules/scale/onboarding/instrument-registry', async original => {
  const actual = await original<typeof import('../../modules/scale/onboarding/instrument-registry')>()
  return { ...actual,
    listScaleInstrumentSources: () => state.registry.listSources(),
    getScaleInstrumentSource: (...args: any[]) => state.registry.getSource(...args),
    getScaleInstrumentValidation: (...args: any[]) => state.registry.getValidation(...args),
    getScaleInstrumentRuntimePolicy: (...args: any[]) => state.registry.getRuntimePolicy(...args),
  }
})
vi.mock('../../modules/scale/onboarding/axis-snapshots', async original => ({
  ...await original<object>(), freezeScaleAxisSnapshot: vi.fn(async () => undefined),
}))
vi.mock('../../modules/scale/deployment/repository', () => ({
  readActiveScaleDeployment: vi.fn(async () => state.deployment),
  readScaleDeploymentRevision: vi.fn(async () => null),
  activateScaleDeploymentRevision: vi.fn(async () => undefined),
}))
vi.mock('../../modules/scale/deployment/transactions', () => ({
  withSerializableScaleTransaction: async (db: any, operation: any) => {
    if (state.freezeBeforeTransaction) state.actor.isFrozen = true
    return operation(db)
  },
}))
// Only the persistence sinks are mocked. Install, materialize, both publication
// planners and the selected-source validation/scoring/runtime compiler are real.
vi.mock('../../modules/measurement-content/scale', () => ({ publishScaleMeasurement: vi.fn(async () => ({ releaseId: 'synthetic-release' })) }))
vi.mock('../../modules/scale/scale-image.adapter', () => ({ publishedScaleMediaOwner: vi.fn(() => ({})), retainScaleAssessmentImages: vi.fn(async () => undefined) }))
vi.mock('../../modules/assessment-governance/tool-entry-policy', () => ({ approveToolEntryPolicies: vi.fn(async () => undefined), exactToolEntryProducts: (products: any) => products }))

const key = 'academic_self_concept_physics_zh_cn', version = '1.0.0'
const input = { instrumentKey: key, instrumentVersion: version, actorUserId: 'synthetic-admin' }
const originalSource = () => structuredClone(GENERATED_SCALE_INSTRUMENT_SOURCES.find(source => source.identity.instrumentKey === key)!)
function fixture() {
  const source = state.registry.getSource(key, version)!
  const policy = { schemaVersion: 2 as const, revision: 1, locale: 'zh-CN', territory: 'CN', deploymentModes: ['STANDALONE' as const], runtimePolicyHash: getScaleInstrumentRuntimePolicy(key, version)!.runtimePolicyHash, localizationVersion: '1.0.0', inFlightCompletion: 'FROZEN_DEADLINE' as const }
  state.deployment = { revision: 1, policyHash: 'a'.repeat(64), policy }
  const row = { id: 'synthetic-scale', creatorId: 'synthetic-admin', code: key, status: 'PUBLISHED', visibility: 'HIDDEN', instrumentClass: 'STANDARD', instrumentVersion: version, definition: source.executable!.definition, definitionHash: hashScaleDefinition(source.executable!.definition), instruction: '既有字段的原文，保留原有空白。 ' }
  const db = {
    user: { findUnique: vi.fn(async () => ({ ...state.actor })) },
    scale: { findUnique: vi.fn(async () => row), create: vi.fn(), update: vi.fn(async ({ data }: any) => Object.assign(row, data)) },
    assessmentReferenceSet: { findUnique: vi.fn(async () => ({ definition: source.executable!.references[0], status: source.executable!.references[0].status })) },
    $executeRaw: vi.fn(async () => 1),
  }
  return { source, row, db, installInput: { ...input, deploymentPolicy: policy }, publicationInput: { ...input, visibility: 'PUBLIC' as const, allowedProducts: ['SURVEY' as const] } }
}
beforeEach(() => {
  vi.restoreAllMocks()
  state.registry = createScaleInstrumentRegistry([originalSource()])
  state.actor = { id: 'synthetic-admin', platformRole: 'SYSTEM_ADMIN', isActive: true, isFrozen: false, expiresAt: null }
  state.freezeBeforeTransaction = false
})

describe('selected immutable scale admission contract and live row instruction', () => {
  it('executes each golden once through real install/materialize/publication layers and reuses frozen validation', async () => {
    const scored = vi.spyOn(scoring, 'scoreScale')
    const { source, row, db, installInput, publicationInput } = fixture()
    const expected = source.executable!.goldenCases.length
    expect(scored).toHaveBeenCalledTimes(expected)
    const validation = state.registry.getValidation(key, version)
    await installScaleInstrument(db as never, installInput)
    expect(db.user.findUnique).toHaveBeenCalledTimes(3)
    expect(db.scale.update).not.toHaveBeenCalled()
    const preview = await planStandardScalePublication(db as never, publicationInput)
    expect(preview.allowPublish).toBe(true)
    expect(preview.proof.instruction).toEqual({ origin: 'SCALE_FIELD', text: row.instruction })
    const callsBeforePublish = db.user.findUnique.mock.calls.length
    await publishStandardScale(db as never, { ...publicationInput, expectedProofHash: preview.proofHash })
    expect(db.user.findUnique.mock.calls.length).toBeGreaterThan(callsBeforePublish)
    expect(scored).toHaveBeenCalledTimes(expected)
    expect(state.registry.getValidation(key, version)).toBe(validation)
    expect(state.registry.getSource(key, version).instruction).toBeUndefined()
    expect(() => { state.registry.getSource(key, version).executable.definition.items[0].content = 'mutation' }).toThrow()
    expect(Object.isFrozen(validation.issues)).toBe(true)
  })

  it('reuses a failed immutable contract without promoting it or replaying golden scorers', () => {
    const broken = originalSource()
    const expected = broken.executable!.goldenCases[0].expected.scores
    const metric = Object.keys(expected)[0]
    expected[metric] = (expected[metric] ?? 0) + 1
    state.registry = createScaleInstrumentRegistry([broken])
    const scored = vi.spyOn(scoring, 'scoreScale')
    const first = state.registry.getValidation(key, version)
    expect(first.valid).toBe(false)
    expect(first.issues.some((issue: any) => issue.message.includes('golden case'))).toBe(true)
    expect(state.registry.getValidation(key, version)).toBe(first)
    expect(() => state.registry.getRuntimePolicy(key, version)).toThrow('Invalid ScaleInstrumentSource')
    expect(scored).toHaveBeenCalledTimes(broken.executable!.goldenCases.length)
  })

  it('rechecks administrator changes inside the transaction despite a cached valid source', async () => {
    const scored = vi.spyOn(scoring, 'scoreScale')
    const { source, db, installInput } = fixture()
    state.freezeBeforeTransaction = true
    await expect(installScaleInstrument(db as never, installInput)).rejects.toThrow('SYSTEM_ADMIN_REQUIRED')
    expect(db.user.findUnique).toHaveBeenCalledTimes(2)
    expect(db.scale.update).not.toHaveBeenCalled()
    expect(db.scale.create).not.toHaveBeenCalled()
    expect(scored).toHaveBeenCalledTimes(source.executable!.goldenCases.length)
  })

  it('rechecks deployment identity, installed version and reference data without replaying immutable scoring', async () => {
    const scored = vi.spyOn(scoring, 'scoreScale')
    const { source, row, db, installInput } = fixture()
    expect((await planScaleInstrumentInstall(db as never, installInput)).allowActivation).toBe(true)
    expect((await planScaleInstrumentInstall(db as never, { ...installInput, deploymentPolicy: { ...installInput.deploymentPolicy, runtimePolicyHash: '0'.repeat(64) } })).blockers).toContain('RUNTIME_POLICY_HASH_MISMATCH')
    row.instrumentVersion = '2.0.0'
    expect((await planScaleInstrumentInstall(db as never, installInput)).blockers).toContain('DEPLOYMENT_VERSION_CONFLICT')
    row.instrumentVersion = version
    const reference = source.executable!.references[0]
    db.assessmentReferenceSet.findUnique.mockResolvedValue({ definition: { ...reference, description: 'synthetic changed persisted reference' }, status: 'ACTIVE' })
    expect((await planScaleInstrumentInstall(db as never, installInput)).blockers).toContain(`ACTIVE_REFERENCE_IMMUTABLE:${reference.referenceVersion}`)
    expect(db.user.findUnique).toHaveBeenCalledTimes(4)
    expect(scored).toHaveBeenCalledTimes(source.executable!.goldenCases.length)
  })

  it('preserves old-row text and nullable instructions while still binding proof and rejecting wrong-version data', async () => {
    const scored = vi.spyOn(scoring, 'scoreScale')
    const { source, row, db, publicationInput } = fixture()
    const originalText = row.instruction
    await materializeScaleInstrumentContent(db as never, input)
    expect(row.instruction).toBe(originalText)
    expect(db.scale.update).not.toHaveBeenCalled()
    const preview = await planStandardScalePublication(db as never, publicationInput)
    row.instruction = '另一次数据库字段修订'
    const stale = await planStandardScalePublication(db as never, { ...publicationInput, expectedProofHash: preview.proofHash })
    expect(stale.blockers).toContain('PUBLICATION_PREVIEW_STALE')
    row.instruction = '  '
    const missing = await planStandardScalePublication(db as never, publicationInput)
    expect(missing.allowPublish).toBe(true)
    expect(missing.proof.instruction).toBeNull()
    expect(missing.proof.instructionDiagnostics).toContain('instruction:INSTRUCTION_NOT_DECLARED')
    expect(missing.blockers).not.toContain('instruction:INSTRUCTION_NOT_DECLARED')
    for (const changed of [{ instrumentVersion: '2.0.0' }, { instrumentClass: 'CUSTOM_DESCRIPTIVE' }, { definitionHash: '0'.repeat(64) }, { definition: null }]) {
      expect(resolveScaleAdmissionInstruction(source, { ...row, instruction: originalText, ...changed }).binding).toBeNull()
    }
    expect(scored).toHaveBeenCalledTimes(source.executable!.goldenCases.length)
  })

  it('seeds an empty store through the actual scale seed/materializer and admits nullable legacy installation with explicit diagnostics', async () => {
    const { source, db, installInput } = fixture()
    expect(source.executable!.releaseStatus).toBe('PUBLISHED')
    state.deployment = null
    const scales = new Map<string, any>(), references = new Map<string, any>()
    db.scale.findUnique.mockImplementation(async ({ where }: any) => scales.get(where.code) ?? null)
    db.scale.create.mockImplementation(async ({ data }: any) => {
      const row = { id: 'synthetic-seeded-scale', ...data }
      scales.set(data.code, row)
      return row
    })
    db.assessmentReferenceSet.findUnique.mockImplementation(async ({ where }: any) => references.get(where.instrumentType_instrumentKey_referenceVersion.referenceVersion) ?? null)
    Object.assign(db.assessmentReferenceSet, { create: vi.fn(async ({ data }: any) => { references.set(data.referenceVersion, data); return data }) })
    const plan = await planScaleInstrumentInstall(db as never, installInput)
    expect(plan.allowActivation).toBe(true)
    expect(plan.instruction).toEqual({ binding: null, diagnostics: ['instruction:INSTRUCTION_NOT_DECLARED'] })
    await seedScalePackages(db as never, input.actorUserId)
    expect(scales.size).toBe(1)
    expect(scales.get(key)).toMatchObject({ instruction: null, status: 'DRAFT', visibility: 'HIDDEN', instrumentVersion: version })
    expect(db.scale.create).toHaveBeenCalledTimes(1)
    const again = await materializeScaleInstrumentContent(db as never, input)
    expect(again.created).toBe(false)
    expect(db.scale.update).not.toHaveBeenCalled()
    expect(again.instruction.diagnostics).toContain('instruction:INSTRUCTION_NOT_DECLARED')
    expect(state.registry.getSource(key, version).instruction).toBeUndefined()
    const explicitlyDeclared = { ...originalSource(), instruction: { schemaVersion: 1 as const, text: '原文字节', language: 'zh-CN', version: 'synthetic-reviewed-1', source: 'Synthetic explicit declaration, not an inferred migration' } }
    expect(resolveScaleAdmissionInstruction(explicitlyDeclared).binding).toMatchObject({ origin: 'INSTRUMENT_SOURCE', text: '原文字节', version: 'synthetic-reviewed-1' })
  })})
