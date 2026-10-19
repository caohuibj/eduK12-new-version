import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assertTrainingVariantAuthoringScope } from '../../modules/questionnaire-product/training-variant-authoring'
const tx = { $queryRaw: vi.fn() }
const row = (extra: Record<string, unknown> = {}) => ({ id: 'questionnaire', createdBy:'teacher', productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', maxAttempts: 1, questionnaireCourses: [{ courseId: 'training' }], publicEnabled: false, ...extra })
const setup=(facts:any[]=[{id:'training',courseType:'TRAINING_COURSE',isLibrary:false}],waves:any[]=[])=>tx.$queryRaw.mockImplementation((query:any)=>Promise.resolve(query.sql?.includes('FROM users')?[{id:'teacher'}]:query.sql?.includes('FROM courses')?facts:waves))
beforeEach(() => { vi.resetAllMocks(); setup() })
describe('Training weighted variant authoring source boundary', () => {
  it('locks user before sorted real course facts and checks anonymous provenance', async () => {
    await expect(assertTrainingVariantAuthoringScope(tx as any, row())).resolves.toBeUndefined()
    expect(tx.$queryRaw.mock.calls[0][0].sql).toContain('FROM users')
    expect(tx.$queryRaw.mock.calls[1][0].sql).toContain('ORDER BY id FOR SHARE')
    expect(tx.$queryRaw.mock.calls[1][0].values).toEqual(['training'])
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3)
  })
  it.each([0,-1,101,Infinity,1.5,null])('rejects invalid maxAttempts=%s before queries',async maxAttempts=>{
    await expect(assertTrainingVariantAuthoringScope(tx as any,row({maxAttempts}))).rejects.toMatchObject({statusCode:400});expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it.each([{productKind:'LEGACY_COMPOSITE'},{questionnaireType:'GENERAL'},{reportPackageKey:'package'},{analysisProtocolKey:'analysis'},{bundleInstance:{}},{deliveryPolicy:{}},{selectionPolicy:{}},{routingPolicy:{}},{randomizationPolicy:{}},{assignmentRef:'assignment'},{anonymousStudy:{}},{anonymousStudyId:'study'},{createdBy:null}])('rejects unsupported source or combined policies %j',async change=>{
    await expect(assertTrainingVariantAuthoringScope(tx as any,row(change))).rejects.toMatchObject({statusCode:400});expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it.each([[],[{courseId:'training'},{courseId:'training'}],[{courseId:''}]].map(value=>[value]))('rejects missing/duplicate/malformed provenance %j',async questionnaireCourses=>{
    await expect(assertTrainingVariantAuthoringScope(tx as any,row({questionnaireCourses}))).rejects.toMatchObject({statusCode:400});expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it.each([[],[{id:'training',courseType:'LEGACY',isLibrary:false}],[{id:'training',courseType:'TRAINING_COURSE',isLibrary:true}]].map(value=>[value]))('rejects missing or nonTraining actual rows %j',async facts=>{
    setup(facts);await expect(assertTrainingVariantAuthoringScope(tx as any,row())).rejects.toMatchObject({statusCode:400});expect(tx.$queryRaw).toHaveBeenCalledTimes(2)
  })
  it('permits a unique Training public source but rejects multi-course anonymous provenance',async()=>{
    await expect(assertTrainingVariantAuthoringScope(tx as any,row({publicEnabled:true}))).resolves.toBeUndefined();tx.$queryRaw.mockClear()
    await expect(assertTrainingVariantAuthoringScope(tx as any,row({publicEnabled:true,questionnaireCourses:[{courseId:'a'},{courseId:'b'}]}))).rejects.toMatchObject({statusCode:400});expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it('rejects existing anonymous-study bindings rather than guessing policy',async()=>{
    setup(undefined,[{id:'wave'}]);await expect(assertTrainingVariantAuthoringScope(tx as any,row())).rejects.toMatchObject({statusCode:400,message:expect.stringContaining('匿名研究')})
    expect(tx.$queryRaw.mock.calls[2][0].join('')).toContain('anonymous_study_waves')
  })
})
