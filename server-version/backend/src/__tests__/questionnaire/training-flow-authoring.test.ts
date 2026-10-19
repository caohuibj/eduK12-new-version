import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma, UserRole } from '@prisma/client'
import { randomUUID } from 'node:crypto'
const { db, helpers } = vi.hoisted(() => ({ db: {
  $transaction: vi.fn(), $queryRawUnsafe: vi.fn(), $queryRaw: vi.fn(),
  compositeAssessment: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), create: vi.fn() },
  questionnaire: { findUnique: vi.fn() }, course: { findMany: vi.fn() },
  compositeFormSection: { create: vi.fn() }, compositeAssessmentItem: { create: vi.fn(), delete: vi.fn() },
}, helpers: { getCompositeForTeacher: vi.fn(), resolveCompositeSituationalItems: vi.fn(), ensureCompositeFormSections: vi.fn() } }))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../modules/composite/composite.service', () => ({ ...helpers, compositeSjtGrantScope: (row: unknown) => row }))
vi.mock('../../modules/composite/final-submit.service', () => ({ ensureCompositeFormSections: helpers.ensureCompositeFormSections }))
import { copy, updateTrainingFlow, updateTrainingVariants, removeItem } from '../../modules/questionnaire-product/service'
import { assertTrainingFlowAuthoringScope, compileTrainingFlowDefinition, remapTrainingFlowDraft, trainingFlowSchema } from '../../modules/questionnaire-product/training-flow-authoring'
import { buildTrainingFlowUnits } from '../../modules/composite/training-flow-definition'
import { trainingFlowItemKey, trainingFlowUnitKey } from '../../modules/assessment-core/flow/training'
const actor = { userId: 'teacher', role: UserRole.TEACHER }
const sectionId='10000000-0000-4000-8000-000000000001', formId='20000000-0000-4000-8000-000000000001', scaleId='30000000-0000-4000-8000-000000000001'
const form = () => ({ id:formId, compositeAssessmentId:'questionnaire', type:'FORM', position:0, required:true, formSectionId:sectionId, formSectionPosition:0, formType:'single_choice', formLabel:'Choose', formOptions:[{value:'yes',label:'Yes'},{value:'no',label:'No'}], formDefinition:{itemKey:'q_original',type:'SINGLE',prompt:'Choose',required:true,options:[{optionKey:'yes',label:'Yes'},{optionKey:'no',label:'No'}],rows:[]},formPolicy:null,cognitiveAssignment:null })
const native = () => ({ id:scaleId, compositeAssessmentId:'questionnaire', type:'SCALE', position:1, required:true, scaleId:'scale', formSectionId:null, formDefinition:null, formOptions:null, formPolicy:null,cognitiveAssignment:null })
const base = () => {const child=form();return { id:'questionnaire', name:'Name', createdBy:'teacher', productKind:'QUESTIONNAIRE', questionnaireType:'COURSE', status:'DRAFT', revision:3, publicEnabled:false,maxAttempts:1,
  questionnaireCourses:[{courseId:'course'}], trainingVariantDraft:null,trainingVariantFrozen:null,trainingVariantDigest:null,trainingFlowDraft:null,trainingFlowFrozen:null,trainingFlowDigest:null,
  trainingTimingPolicy:null,items:[child,native()],formSections:[{id:sectionId,title:'Form',position:0,contextSection:false,items:[child]}] }}
const when = () => ({op:'EQUALS' as const,field:{source:'ANSWER' as const,instrumentKey:trainingFlowUnitKey(sectionId),itemKey:'q_original'},value:'yes'})
const config = () => ({ schemaVersion:1 as const,blocks:[
  {blockKey:'form',kind:'INSTRUMENT' as const,instrumentKey:trainingFlowUnitKey(sectionId)},
  {blockKey:'material',kind:'MATERIAL' as const,title:'q_original stays literal',body:trainingFlowUnitKey(sectionId)+' q_original',when:when()},
  {blockKey:'stop',kind:'END' as const,termination:'SCREEN_OUT' as const,when:when()},
  {blockKey:'scale',kind:'INSTRUMENT' as const,instrumentKey:trainingFlowItemKey(scaleId)},
] })
let current:any
beforeEach(() => {
  vi.resetAllMocks();current=base();db.$transaction.mockImplementation((run:any)=>run(db))
  db.$queryRaw.mockImplementation((query:any)=>Promise.resolve(query.sql?.includes('FROM courses')?[{id:'course',courseType:'TRAINING_COURSE',isLibrary:false}]:[]))
  db.compositeAssessment.findUnique.mockImplementation(({where}:any)=>Promise.resolve(where.creationKey?null:current))
  db.compositeAssessment.update.mockImplementation(({data}:any)=>{for(const [key,value] of Object.entries(data))current[key]=value===Prisma.DbNull?null:key==='revision'?current.revision+1:value;return Promise.resolve(current)})
  helpers.getCompositeForTeacher.mockImplementation(()=>Promise.resolve(current))
})
describe('Training explicit flow authoring API',()=>{
  it('saves a shared-language draft under revision lock, without a frozen publication',async()=>{
    await updateTrainingFlow(actor,current.id,{revision:3,config:config()})
    expect(current.trainingFlowDraft).toEqual(config());expect(current.trainingFlowFrozen).toBeNull();expect(current.trainingFlowDigest).toBeNull();expect(current.revision).toBe(4)
    expect(db.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'),'questionnaire')
  })
  it.each([{revision:2},{status:'PUBLISHED'},{status:'ARCHIVED'},{createdBy:'other'}])('rejects stale or unauthorized edits %j',async change=>{
    Object.assign(current,change);await expect(updateTrainingFlow(actor,current.id,{revision:3,config:config()})).rejects.toMatchObject({statusCode:change.createdBy?403:409});expect(db.compositeAssessment.update).not.toHaveBeenCalled()
  })
  it.each([{}, {config:undefined}, {config:{}}, {config:{...config(),embeddedData:[]}}, {config:{...config(),experiment:{}}}, {config:config(),unknown:true}])('rejects missing, malformed and unknown fields %j',async value=>{
    await expect(updateTrainingFlow(actor,current.id,{revision:3,...value})).rejects.toThrow();expect(db.compositeAssessment.update).not.toHaveBeenCalled()
  })
  it('rejects future, unknown and nonchoice references before storage',async()=>{
    const draft=config();draft.blocks[0]={...draft.blocks[0],when:when()} as any
    await expect(updateTrainingFlow(actor,current.id,{revision:3,config:draft})).rejects.toMatchObject({statusCode:400})
    current.items[0].formDefinition.itemKey='other';await expect(updateTrainingFlow(actor,current.id,{revision:3,config:config()})).rejects.toMatchObject({statusCode:400})
    expect(db.compositeAssessment.update).not.toHaveBeenCalled()
  })
  it('explicit null clears all metadata, preserving ordinary attempts and avoiding course lookup',async()=>{
    current.trainingFlowDraft=config();current.trainingFlowFrozen={};current.trainingFlowDigest='old'
    await updateTrainingFlow(actor,current.id,{revision:3,config:null});expect(current.trainingFlowDraft).toBeNull();expect(current.trainingFlowFrozen).toBeNull();expect(current.trainingFlowDigest).toBeNull();expect(current.maxAttempts).toBe(1);expect(db.$queryRaw).not.toHaveBeenCalled()
  })
  it('blocks both directions of variants and flow, including incomplete frozen markers',async()=>{
    current.trainingVariantDigest='digest';await expect(updateTrainingFlow(actor,current.id,{revision:3,config:config()})).rejects.toMatchObject({statusCode:400})
    current.trainingVariantDigest=null;current.trainingFlowFrozen={}
    await expect(updateTrainingVariants(actor,current.id,{revision:3,config:{schemaVersion:1,groups:[{variantKey:'a',label:'A',weight:1,units:[{type:'FORM_SECTION',id:sectionId}]},{variantKey:'b',label:'B',weight:1,units:[{type:'FORM_SECTION',id:sectionId},{type:'ITEM',id:scaleId}]}]}})).rejects.toMatchObject({statusCode:400})
    expect(db.compositeAssessment.update).not.toHaveBeenCalled()
  })
  it('revalidates a saved flow after content mutation, refusing dangling references',async()=>{
    current.trainingFlowDraft=config();db.compositeAssessmentItem.delete.mockImplementation(()=>{current.items=current.items.filter((item:any)=>item.id!==scaleId);return Promise.resolve({})})
    await expect(removeItem(actor,current.id,scaleId,{revision:3})).rejects.toMatchObject({statusCode:400});expect(current.revision).toBe(3)
  })
})
describe('scope, definition identity and bounded shared parsing',()=>{
  it.each([{productKind:'LEGACY_COMPOSITE'},{questionnaireType:'GENERAL'},{reportPackageKey:'p'},{analysisProtocolKey:'a'},{bundleInstance:{}},{deliveryPolicy:{}},{selectionPolicy:{}},{routingPolicy:{}},{randomizationPolicy:{}},{assignmentRef:'a'},{anonymousStudy:{}},{anonymousStudyId:'study'},{trainingVariantDraft:{}},{trainingVariantFrozen:{}},{trainingVariantDigest:''}])('rejects unsupported composition %j',async change=>{
    await expect(assertTrainingFlowAuthoringScope(db as any,{...current,...change})).rejects.toMatchObject({statusCode:400});expect(db.$queryRaw).not.toHaveBeenCalled()
  })
  it('checks actual Training courses rather than host or client claims',async()=>{
    db.$queryRaw.mockImplementation((q:any)=>Promise.resolve(q.sql?.includes('FROM courses')?[{id:'course',courseType:'SCHOOL_COURSE',isLibrary:false}]:[]))
    await expect(assertTrainingFlowAuthoringScope(db as any,current)).rejects.toMatchObject({statusCode:400})
  })
  it.each(['anonymous_study_waves','assignment_ref'])('refuses persisted incompatible source %s under lock',async pattern=>{
    const original=db.$queryRaw.getMockImplementation()!
    db.$queryRaw.mockImplementation((q:any)=>q.join?.('').includes(pattern)?Promise.resolve([{id:'binding'}]):original(q))
    await expect(assertTrainingFlowAuthoringScope(db as any,current)).rejects.toMatchObject({statusCode:400})
  })
  it('allows legacy fields as sequential units, never as invented condition sources',()=>{
    current.items[0].formDefinition=null
    const sequential={schemaVersion:1,blocks:config().blocks.filter(b=>b.kind==='INSTRUMENT')}
    expect(compileTrainingFlowDefinition(sequential,current).flowDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(()=>compileTrainingFlowDefinition(config(),current)).toThrow('题目不存在')
  })
  it('rejects optional native candidates and broken whole-section membership',()=>{
    current.items[1].required=false;expect(()=>buildTrainingFlowUnits(current)).toThrow('选填')
    current.items[1].required=true;current.items[0].formSectionId='other';expect(()=>buildTrainingFlowUnits(current)).toThrow('归属')
  })
  it('bounds recursive/cyclic input before the shared Zod lazy schema',()=>{
    const cycle:any={op:'NOT'};cycle.term=cycle
    const draft=config();draft.blocks[1].when=cycle
    expect(()=>trainingFlowSchema.parse({revision:3,config:draft})).toThrow('循环')
    let deep:any=when();for(let i=0;i<100;i++)deep={op:'NOT',term:deep};draft.blocks[1].when=deep
    expect(()=>trainingFlowSchema.parse({revision:3,config:draft})).toThrow('预算')
  })
  it('rewrites only AST reference fields, leaving literal content and comparison options intact',()=>{
    const out=remapTrainingFlowDraft(config(),new Map([[sectionId,'new-section']]),new Map([[scaleId,'new-scale']]),new Map([['q_original','q_new']]))
    expect(out.blocks[0].instrumentKey).toBe('section_new_section');expect(out.blocks[3].instrumentKey).toBe('item_new_scale')
    expect(out.blocks[1].when).toEqual({...when(),field:{...when().field,instrumentKey:'section_new_section',itemKey:'q_new'}})
    expect(out.blocks[1].title).toBe(config().blocks[1].title);expect(out.blocks[1].body).toBe(config().blocks[1].body)
    expect(()=>remapTrainingFlowDraft(config(),new Map(),new Map(),new Map())).toThrow('精确工具映射')
  })
})
describe('flow copy',()=>{
  it('remaps sections, native IDs and stable item keys, clearing publication identity',async()=>{
    current.trainingFlowDraft=config();current.trainingFlowFrozen={old:true};current.trainingFlowDigest='old'
    const source=current,target:any={...base(),id:'copy',revision:0,trainingFlowDraft:null,trainingFlowFrozen:null,trainingFlowDigest:null,items:[],formSections:[]}
    db.questionnaire.findUnique.mockResolvedValue(null);db.course.findMany.mockResolvedValue([{id:'course',creatorId:'teacher',isLibrary:false}])
    db.compositeAssessment.findUnique.mockImplementation(({where}:any)=>Promise.resolve(where.creationKey?null:where.id===source.id?source:target))
    db.compositeAssessment.create.mockImplementation(({data}:any)=>{Object.assign(target,data);target.questionnaireCourses=[{courseId:'course'}];return Promise.resolve(target)})
    db.compositeAssessmentItem.create.mockImplementation(({data}:any)=>{const saved=Object.fromEntries(Object.entries(data).map(([key,value])=>[key,value===Prisma.DbNull||value===Prisma.JsonNull?null:value]));target.items.push(saved);return Promise.resolve(saved)})
    db.compositeFormSection.create.mockImplementation(({data}:any)=>{const section={...data,id:randomUUID()};target.formSections.push(section);return Promise.resolve(section)})
    db.compositeAssessment.findUniqueOrThrow.mockImplementation(()=>Promise.resolve({...target,formSections:target.formSections.map((s:any)=>({...s,items:target.items.filter((i:any)=>i.formSectionId===s.id)}))}))
    db.compositeAssessment.update.mockImplementation(({data}:any)=>{Object.assign(target,data);return Promise.resolve(target)})
    helpers.getCompositeForTeacher.mockImplementation(()=>Promise.resolve(target))
    const result=await copy(actor,source.id,{requestId:randomUUID()})
    const child=target.items.find((i:any)=>i.type==='FORM')
    expect(result.trainingFlowDraft.blocks[0].instrumentKey).toBe(trainingFlowUnitKey(child.formSectionId))
    expect(result.trainingFlowDraft.blocks[1].when.field.itemKey).toBe(child.formDefinition.itemKey)
    expect(result.trainingFlowDraft.blocks[1].body).toBe(config().blocks[1].body)
    expect(target.trainingFlowFrozen).toBe(Prisma.DbNull);expect(target.trainingFlowDigest).toBeNull()
  })
  it('blocks flow copying into course-free templates before target creation',async()=>{
    current.trainingFlowDraft=config();db.questionnaire.findUnique.mockResolvedValue(null)
    await expect(copy(actor,current.id,{requestId:randomUUID()},{allowTrainingVariants:false})).rejects.toMatchObject({statusCode:400,message:expect.stringContaining('私有模板')})
    expect(db.compositeAssessment.create).not.toHaveBeenCalled()
  })
})
