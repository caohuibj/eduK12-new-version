import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma, UserRole } from '@prisma/client'
import { randomUUID } from 'node:crypto'
const { db, helpers } = vi.hoisted(() => ({ db: {
  $transaction: vi.fn(), $queryRawUnsafe: vi.fn(), $queryRaw: vi.fn(),
  compositeAssessment: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), create: vi.fn() },
  questionnaire: { findUnique: vi.fn() }, course: { findMany: vi.fn() },
  compositeFormSection: { create: vi.fn() }, compositeAssessmentItem: { create: vi.fn() }, compositeAssessmentAttempt: { findMany: vi.fn() },
}, helpers: { getCompositeForTeacher: vi.fn(), getTrainingVariantReportsForTeacher: vi.fn(), getReportForTeacher: vi.fn(), resolveCompositeSituationalItems: vi.fn(), ensureCompositeFormSections: vi.fn() } }))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../modules/composite/composite.service', () => ({ ...helpers, compositeSjtGrantScope: (row: unknown) => row }))
vi.mock('../../modules/composite/final-submit.service', () => ({ ensureCompositeFormSections: helpers.ensureCompositeFormSections }))
import { copy, updateTrainingVariants, exportReports } from '../../modules/questionnaire-product/service'
import { compileWeightedVariants } from '../../modules/assessment-core/weighted-variants'
import { buildTrainingVariantUnion } from '../../modules/composite/training-variant-scope'
const actor = { userId: 'teacher', role: UserRole.TEACHER }
const item = (id: string, position: number) => ({ id, compositeAssessmentId: 'questionnaire', type: 'SCALE', position, required: true, scaleId: 'scale-' + id, formDefinition: null, formOptions: null, formPolicy: null, formSectionId: null, cognitiveAssignment: null })
const base = () => ({ id: 'questionnaire', code: 'q-code', name: 'Name', description: null, instruction: null, createdBy: 'teacher', productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', status: 'DRAFT', revision: 3, maxAttempts: 1, publicEnabled: false,
  questionnaireCourses: [{ courseId: 'course' }], trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null,
  trainingTimingPolicy: null, items: [item('one', 0), item('two', 1)], formSections: [] })
const config = () => ({ schemaVersion: 1 as const, groups: [
  { variantKey: 'a', label: 'A', weight: 1, units: [{ type: 'ITEM' as const, id: 'one' }] },
  { variantKey: 'b', label: 'B', weight: 3, units: [{ type: 'ITEM' as const, id: 'two' }] },
] })
let current: any
beforeEach(() => {
  vi.resetAllMocks(); current = base();db.$transaction.mockImplementation((run: any) => run(db))
  db.$queryRaw.mockImplementation((query: any) => Promise.resolve(query.sql?.includes('FROM courses') ? [{ id: 'course', courseType: 'TRAINING_COURSE', isLibrary: false }] : []))
  db.compositeAssessment.findUnique.mockImplementation(({ where }: any) => Promise.resolve(where.creationKey ? null : current))
  db.compositeAssessment.update.mockImplementation(({ data }: any) => {for (const [key, value] of Object.entries(data)) current[key] = value === Prisma.DbNull ? null : key === 'revision' ? current.revision + 1 : value;return Promise.resolve(current)})
  helpers.getCompositeForTeacher.mockImplementation(() => Promise.resolve(current))
})
describe('revision-guarded explicit variant authoring', () => {
  it('saves explicit groups and finite attempts without freezing a draft', async () => {
    await updateTrainingVariants(actor,current.id,{revision:3,config:config(),maxAttempts:5})
    expect(current.trainingVariantDraft).toEqual(config());expect(current.trainingVariantFrozen).toBeNull();expect(current.trainingVariantDigest).toBeNull();expect(current.maxAttempts).toBe(5);expect(current.revision).toBe(4)
    expect(db.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'),'questionnaire')
  })
  it('uses current finite attempts when omitted',async()=>{await updateTrainingVariants(actor,current.id,{revision:3,config:config()});expect(current.maxAttempts).toBe(1)})
  it.each([{maxAttempts:0},{maxAttempts:101},{maxAttempts:1.5},{ignoredPolicy:{}}])('rejects malformed endpoint payload %j',async extra=>{
    await expect(updateTrainingVariants(actor,current.id,{revision:3,config:config(),...extra})).rejects.toThrow();expect(db.compositeAssessment.update).not.toHaveBeenCalled()
  })
  it.each([{revision:2},{status:'PUBLISHED'},{status:'ARCHIVED'},{createdBy:'someone-else'}])('refuses stale, published, archived or unauthorized edits %j',async change=>{
    Object.assign(current,change);await expect(updateTrainingVariants(actor,current.id,{revision:3,config:config()})).rejects.toMatchObject({statusCode:change.createdBy?403:409});expect(db.compositeAssessment.update).not.toHaveBeenCalled()
  })
  it('rejects unknown refs before mutation',async()=>{
    const invalid=config();invalid.groups[1].units[0].id='absent'
    await expect(updateTrainingVariants(actor,current.id,{revision:3,config:invalid})).rejects.toMatchObject({statusCode:400});expect(db.compositeAssessment.update).not.toHaveBeenCalled()
  })
  it('disables only by explicit null and preserves finite attempts',async()=>{
    current.trainingVariantDraft=config();current.maxAttempts=5
    await updateTrainingVariants(actor,current.id,{revision:3,config:null});expect(current.trainingVariantDraft).toBeNull();expect(current.maxAttempts).toBe(5);expect(db.$queryRaw).not.toHaveBeenCalled()
  })
  it('does not silently change attempts through disable',async()=>{
    await expect(updateTrainingVariants(actor,current.id,{revision:3,config:null,maxAttempts:10})).rejects.toMatchObject({statusCode:400});expect(db.compositeAssessment.update).not.toHaveBeenCalled()
  })
})
describe('weighted definition-only copying',()=>{
  const prepareCopy=()=>{
    current.trainingVariantDraft=config();current.maxAttempts=7
    const source=current,target:any={...base(),id:'copy',revision:0,items:[],formSections:[]}
    db.questionnaire.findUnique.mockResolvedValue(null);db.course.findMany.mockResolvedValue([{id:'course',creatorId:'teacher',isLibrary:false}])
    db.compositeAssessment.findUnique.mockImplementation(({where}:any)=>Promise.resolve(where.creationKey?null:where.id===source.id?source:target))
    db.compositeAssessment.create.mockImplementation(({data}:any)=>{Object.assign(target,data);target.questionnaireCourses=[{courseId:'course'}];return Promise.resolve(target)})
    db.compositeAssessmentItem.create.mockImplementation(({data}:any)=>{target.items.push(data);return Promise.resolve(data)})
    db.compositeFormSection.create.mockImplementation(({data}:any)=>{const section={...data,id:randomUUID(),items:[]};target.formSections.push(section);return Promise.resolve(section)})
    db.compositeAssessment.findUniqueOrThrow.mockImplementation(()=>Promise.resolve({...target,formSections:target.formSections.map((section:any)=>({...section,items:target.items.filter((child:any)=>child.formSectionId===section.id)}))}))
    db.compositeAssessment.update.mockImplementation(({data}:any)=>{Object.assign(target,data);return Promise.resolve(target)})
    helpers.getCompositeForTeacher.mockImplementation(()=>Promise.resolve(target));return {source,target}
  }
  it('remaps all units, rechecks C13 use and recompiles without inherited freeze',async()=>{
    const {source,target}=prepareCopy();await copy(actor,source.id,{requestId:randomUUID()})
    expect(target.maxAttempts).toBe(7);expect(target.items.map((entry:any)=>entry.id)).not.toContain('one')
    expect(target.trainingVariantDraft.groups.flatMap((group:any)=>group.units.map((unit:any)=>unit.id))).toEqual(target.items.map((entry:any)=>entry.id))
    expect(target.trainingVariantFrozen).toBe(Prisma.DbNull);expect(target.trainingVariantDigest).toBeNull()
    expect(helpers.resolveCompositeSituationalItems).toHaveBeenCalledWith(source.items,db,true,expect.objectContaining({createdBy:'teacher',questionnaireCourses:[{courseId:'course'}]}))
    expect(compileWeightedVariants(target.trainingVariantDraft,buildTrainingVariantUnion(target)).configDigest).not.toBe(compileWeightedVariants(source.trainingVariantDraft,buildTrainingVariantUnion(source)).configDigest)
  })
  it('remaps whole sections and global stable Form condition keys without replacing labels',async()=>{
    const {source,target}=prepareCopy()
    const policy={version:3,requiredRefusal:'BLOCK_SUBMIT',hiddenRequired:'EXEMPT'}
    const question={...item('form-source',2),type:'FORM',scaleId:null,formType:'single_choice',formLabel:'Choose',formSectionId:'section',formSectionPosition:0,
      formOptions:[{value:'yes',label:'Yes'},{value:'no',label:'No'}],formPolicy:policy,formDefinition:{itemKey:'q_source',type:'SINGLE',prompt:'Choose',required:true,options:[{optionKey:'yes',label:'Yes'},{optionKey:'no',label:'No'}],rows:[]}}
    const dependent={...item('form-dependent',3),type:'FORM',scaleId:null,formType:'text_input',formLabel:'q_source stays a literal label',formSectionId:'section',formSectionPosition:1,formPolicy:policy,
      formDefinition:{itemKey:'q_dependent',type:'SHORT_TEXT',prompt:'q_source stays a literal label',required:true,options:[],rows:[],displayIf:{itemKey:'q_source',operator:'EQUALS',optionKey:'yes'}}}
    source.items.push(question,dependent)
    source.formSections=[{id:'section',title:'Form',description:null,contextSection:false,position:2}]
    source.trainingVariantDraft.groups.forEach((group:any)=>group.units.push({type:'FORM_SECTION',id:'section'}))
    await copy(actor,source.id,{requestId:randomUUID()})
    const copiedSource=target.items.find((entry:any)=>entry.formType==='single_choice'),copiedDependent=target.items.find((entry:any)=>entry.formType==='text_input')
    expect(copiedSource.formDefinition.itemKey).toBe('q_'+copiedSource.id)
    expect(copiedDependent.formDefinition.displayIf.itemKey).toBe(copiedSource.formDefinition.itemKey)
    expect(copiedDependent.formLabel).toBe('q_source stays a literal label')
    expect(copiedDependent.formSectionId).toBe(copiedSource.formSectionId)
    expect(copiedSource.formSectionId).not.toBe('section')
    expect(target.trainingVariantDraft.groups.every((group:any)=>group.units[1].id===copiedSource.formSectionId)).toBe(true)
  })
  it('refuses course-free templates before creating any prototype',async()=>{
    const {source}=prepareCopy();await expect(copy(actor,source.id,{requestId:randomUUID()},{allowTrainingVariants:false})).rejects.toMatchObject({statusCode:400,message:expect.stringContaining('私有模板')});expect(db.compositeAssessment.create).not.toHaveBeenCalled()
  })
  it('blocks idempotent weighted-copy reuse from bypassing the template boundary',async()=>{
    const {source,target}=prepareCopy()
    const {canonicalHash}=await import('../../modules/assessment-runtime/canonical')
    db.compositeAssessment.findUnique.mockResolvedValueOnce({...target,trainingVariantDraft:config(),creationHash:canonicalHash({copySource:source.id})})
    await expect(copy(actor,source.id,{requestId:randomUUID()},{allowTrainingVariants:false})).rejects.toMatchObject({statusCode:400,message:expect.stringContaining('私有模板')})
    expect(db.compositeAssessment.create).not.toHaveBeenCalled()
  })
  it('preserves ordinary null copy and old default attempts',async()=>{
    const {source,target}=prepareCopy();source.trainingVariantDraft=null;source.maxAttempts=25
    await copy(actor,source.id,{requestId:randomUUID()});expect(target.trainingVariantDraft).toBeNull();expect(target.maxAttempts).toBe(1);expect(db.$queryRaw).not.toHaveBeenCalled()
  })
})

describe('weighted paged report export batching',()=>{
  it('delegates a weighted page to one authorized batch helper',async()=>{
    current.trainingVariantDraft=config();helpers.getTrainingVariantReportsForTeacher.mockResolvedValue({reports:[{id:'report'}],next:null})
    const result=await exportReports(actor,current.id,{})
    expect(result).toMatchObject({schemaVersion:'questionnaire-independent-reports-v1',reports:[{id:'report'}],next:null})
    expect(helpers.getTrainingVariantReportsForTeacher).toHaveBeenCalledWith(actor.userId,actor.role,current.id,undefined)
    expect(db.compositeAssessmentAttempt.findMany).not.toHaveBeenCalled();expect(helpers.getReportForTeacher).not.toHaveBeenCalled()
  })
  it('keeps ordinary null report export on its original path',async()=>{
    const after=randomUUID();db.compositeAssessmentAttempt.findMany.mockResolvedValue([{id:'one'},{id:'two'}]);helpers.getReportForTeacher.mockImplementation((_user:any,_role:any,_parent:any,id:string)=>Promise.resolve({id}))
    const result=await exportReports(actor,current.id,{after})
    expect(result.reports).toEqual([{id:'one'},{id:'two'}]);expect(helpers.getTrainingVariantReportsForTeacher).not.toHaveBeenCalled();expect(helpers.getReportForTeacher).toHaveBeenCalledTimes(2)
    expect(db.compositeAssessmentAttempt.findMany.mock.calls[0][0]).toMatchObject({where:{id:{gt:after}},take:101})
  })
})
