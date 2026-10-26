import {beforeEach,describe,expect,it,vi} from 'vitest'
import { createScaleInstrumentRegistry, resolveFrozenScaleInstructionForScale, SCALE_INSTRUMENT_REGISTRY } from '../../modules/scale/onboarding/instrument-registry'
import { GENERATED_SCALE_INSTRUMENT_SOURCES } from '../../modules/scale/onboarding/instruments.generated'
import { projectScaleCompletedResponse, projectScaleAttemptForResume } from '../../modules/scale/projection/scale-attempt.projector'
import type { ScaleInstrumentSourceV1 } from '../../modules/scale/onboarding/types'

vi.mock('../../modules/scale/onboarding/instrument-registry', async original => ({
  ...(await original<object>()),
  getScaleInstrumentSource: vi.fn(),
}))
vi.mock('../../modules/scale/onboarding/axis-snapshots', async original => ({
  ...(await original<object>()),
  freezeScaleAxisSnapshot: vi.fn(),
  allowsScaleAxisRevision: vi.fn(() => true),
}))
const { getScaleInstrumentSource } = await import('../../modules/scale/onboarding/instrument-registry') as unknown as { getScaleInstrumentSource: ReturnType<typeof vi.fn> }

const instruction = { schemaVersion: 1 as const, text: '请根据最近两周的真实感受作答。', language: 'zh-CN', version: '1.0.0', source: '官方手册中文工作译稿' }
// Clone a real generated source so every catalog/executable field keeps its
// validated shape; only the identity and the instruction are synthetic.
const baseSource = structuredClone(GENERATED_SCALE_INSTRUMENT_SOURCES[0])
const source = (over: Partial<ScaleInstrumentSourceV1> = {}): ScaleInstrumentSourceV1 => ({
  ...baseSource,
  identity: { ...baseSource.identity, instrumentKey: 'nfc10_zh_cn' },
  executable: { ...baseSource.executable!, references: [] },
  instruction,
  ...over,
})

describe('frozen scale instruction content contract', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('freezes the versioned source instruction into the runtime snapshot and parses it back', async () => {
    process.env.DATA_ENCRYPTION_KEY ||= 'aa'.repeat(32)
    getScaleInstrumentSource.mockImplementation((_key: string, version: string) => source({ identity: { instrumentKey: 'nfc10_zh_cn', instrumentVersion: version } }))
    const { createFrozenScaleRuntimeSnapshot, loadFrozenScaleRuntimeSnapshot, persistFrozenScaleRuntimeSnapshot } = await import('../../modules/assessment-runtime/runtime-snapshot')
    const registry = createScaleInstrumentRegistry([source()])
    const scale = { code: 'nfc10_zh_cn', instrumentVersion: '1.0.0', instrumentClass: 'STANDARD', instruction: instruction.text }
    const resolved = resolveFrozenScaleInstructionForScale(scale, registry)
    expect(resolved).toEqual({ text: instruction.text, language: 'zh-CN', version: '1.0.0', origin: 'INSTRUMENT_SOURCE' })
    const draft = createFrozenScaleRuntimeSnapshot({
      instrumentKey: scale.code, instrumentVersion: scale.instrumentVersion,
      definition: source().executable!.definition, instruction: resolved,
    })
    expect(draft.instruction).toEqual(resolved)
    const selections = (draft.compiledRuntime as { referenceBindingDefinition?: { selections?: Array<{ referenceKey: string; referenceVersion: string }> } }).referenceBindingDefinition?.selections ?? []
    const snapshot = createFrozenScaleRuntimeSnapshot({
      instrumentKey: scale.code, instrumentVersion: scale.instrumentVersion,
      definition: source().executable!.definition, instruction: resolved,
      referenceBindings: selections.map(selection => ({ referenceKey: selection.referenceKey, referenceVersion: selection.referenceVersion, referenceHash: '0'.repeat(64), scoreKey: selection.scoreKey, referenceKind: selection.referenceKind })),
    })
    const restored = await loadFrozenScaleRuntimeSnapshot(await persistFrozenScaleRuntimeSnapshot(snapshot))
    expect(restored.instruction).toEqual(resolved)
  })

  it('keeps legacy snapshots without an instruction valid and falls back to the live Scale field', () => {
    const assessment = { id: 'a1', scaleId: 's1', scale: { id: 's1', code: 'x', name: 'X', instruction: '当前可变指导语' } }
    const legacy = projectScaleAttemptForResume({ assessment, answers: [], includeAnswers: false })
    expect(legacy.scale.instruction).toBe('当前可变指导语')
    const frozen = projectScaleAttemptForResume({ assessment, answers: [], includeAnswers: false, frozenInstruction: { text: '冻结时的指导语' } })
    expect(frozen.scale.instruction).toBe('冻结时的指导语')
  })

  it('resolves teacher-authored and source-less rows through the Scale field only', () => {
    expect(resolveFrozenScaleInstructionForScale({ code: 'custom', instrumentVersion: '1', instrumentClass: 'CUSTOM_DESCRIPTIVE', instruction: '自编指导语' }, createScaleInstrumentRegistry([])))
      .toEqual({ text: '自编指导语', origin: 'SCALE_FIELD' })
    expect(resolveFrozenScaleInstructionForScale({ code: 'std', instrumentVersion: '1', instrumentClass: 'STANDARD', instruction: '行内文本' }, createScaleInstrumentRegistry([])))
      .toEqual({ text: '行内文本', origin: 'SCALE_FIELD' })
    expect(resolveFrozenScaleInstructionForScale({ code: 'std', instrumentVersion: '1', instrumentClass: 'STANDARD', instruction: null }, createScaleInstrumentRegistry([])))
      .toBeNull()
  })

  it('projects identical frozen text/empty in resume and completed, retaining the legacy missing-field fallback',async()=>{
    const {createFrozenScaleRuntimeSnapshot,parseFrozenScaleRuntimeSnapshot}=await import('../../modules/assessment-runtime/runtime-snapshot')
    const {canonicalHashObjectParts}=await import('../../modules/assessment-runtime/canonical')
    const {compileResearchScale}=await import('../../modules/survey/builder.compiler')
    const definition=compileResearchScale('Empty',{schemaVersion:1,respondentType:'participant_self_report',responseOptions:[{optionKey:'low',label:'Low',score:0},{optionKey:'high',label:'High',score:2}],dimensions:[{dimensionKey:'sum',label:'Sum',direction:'descriptive'}],aggregation:'sum',items:[{itemKey:'i',prompt:'I',required:true,reverse:false,dimensionKeys:['sum']}]})
    const snapshot=createFrozenScaleRuntimeSnapshot({instrumentKey:'empty',instrumentVersion:'1',definition})
    expect(parseFrozenScaleRuntimeSnapshot(snapshot).instruction).toBeNull()
    const legacy:any=structuredClone(snapshot);delete legacy.instruction;delete legacy.snapshotHash
    legacy.snapshotHash=canonicalHashObjectParts(legacy)
    expect(parseFrozenScaleRuntimeSnapshot(legacy).instruction).toBeUndefined()
    const assessment={id:'a1',scaleId:'s1',scale:{id:'s1',code:'x',name:'X',instruction:'Later live text'}}
    for(const instruction of [{text:'Frozen original'},null,undefined]){
      const resumed=projectScaleAttemptForResume({assessment,answers:[],includeAnswers:false,frozenInstruction:instruction})
      const completed=projectScaleCompletedResponse({assessment,result:null,context:{frozenPolicy:{disposition:'UNKNOWN'}} as never,frozenInstruction:instruction})
      expect(completed.scale.instruction).toBe(resumed.scale.instruction)
      expect(completed.scale.instruction).toBe(instruction===undefined?'Later live text':instruction?.text??null)
    }
  })

  it('updates instruction alone and records its independent source version without rebuilding scoring',async()=>{
    getScaleInstrumentSource.mockReturnValue(source({instruction:{...instruction,version:'1.0.1',text:'Revised administration wording'}}))
    const {materializeScaleInstrumentContent}=await import('../../modules/scale/onboarding/materialize')
    const {hashScaleDefinition}=await import('../../modules/scale/scale-definition')
    const row={id:'s',status:'PUBLISHED',instrumentClass:'STANDARD',instrumentVersion:'1.0.0',definition:source().executable!.definition,definitionHash:hashScaleDefinition(source().executable!.definition),instruction:instruction.text}
    const db={scale:{findUnique:vi.fn(async()=>row),update:vi.fn(async({data}:any)=>({...row,...data}))},assessmentReferenceSet:{}}
    await materializeScaleInstrumentContent(db as never,{instrumentKey:'nfc10_zh_cn',instrumentVersion:'1.0.0',actorUserId:'admin'})
    expect(db.scale.update).toHaveBeenCalledExactlyOnceWith({where:{id:'s'},data:{instruction:'Revised administration wording'}})
    getScaleInstrumentSource.mockReturnValue(source({instruction:undefined}))
    db.scale.update.mockClear()
    await materializeScaleInstrumentContent(db as never,{instrumentKey:'nfc10_zh_cn',instrumentVersion:'1.0.0',actorUserId:'admin'})
    expect(db.scale.update).toHaveBeenCalledExactlyOnceWith({where:{id:'s'},data:{instruction:null}})
  })

  it('materializes the source instruction onto the Scale row and keeps it through axis revision', async () => {
    getScaleInstrumentSource.mockImplementation((_key: string, version: string) => source({ identity: { instrumentKey: 'nfc10_zh_cn', instrumentVersion: version } }))
    const { materializeScaleInstrumentContent } = await import('../../modules/scale/onboarding/materialize')
    const db = {
      scale: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'scale-1', ...data })),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'scale-1', ...data })),
      },
      assessmentReferenceSet: { findUnique: vi.fn(async () => null), create: vi.fn() },
    }
    const created = await materializeScaleInstrumentContent(db as never, { instrumentKey: 'nfc10_zh_cn', instrumentVersion: '1.0.0', actorUserId: 'admin' })
    expect(created.created).toBe(true)
    expect(db.scale.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ instruction: instruction.text }) }))
    // Axis revision re-materializes the same source-owned wording for STANDARD rows.
    db.scale.findUnique.mockResolvedValue({ id: 'scale-1', instrumentClass: 'STANDARD', instrumentVersion: '1.0.0', definition: null, definitionHash: null, instruction: instruction.text })
    const revision = await materializeScaleInstrumentContent(db as never, { instrumentKey: 'nfc10_zh_cn', instrumentVersion: '1.0.0', actorUserId: 'admin' })
    expect(revision.created).toBe(false)
    expect(db.scale.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ instruction: instruction.text }) }))
  })
})

describe('global registry instruction availability', () => {
  it('does not leak the synthetic fixture into the production registry', () => {
    expect(SCALE_INSTRUMENT_REGISTRY.getSource('nfc10_zh_cn', '1.0.0')).toBeUndefined()
  })
})
