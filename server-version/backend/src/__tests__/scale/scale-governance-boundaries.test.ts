import { beforeEach,describe,expect,it,vi } from 'vitest'
const mocks=vi.hoisted(()=>({guard:vi.fn(),authority:vi.fn()}))
vi.mock('../../modules/scale-library-governance/collection-guard',()=>({assertScaleLibraryCollectionAllowed:mocks.guard}))
vi.mock('../../modules/measurement-content/content-authority.repository',()=>({assertContentAuthority:mocks.authority}))
import { assertTrainingScaleCollectionAllowed,assertScaleNewEntryAllowed,assertQuestionnaireScaleNewEntryAllowed } from '../../modules/scale/scale-collection-guard'
import { assertSurveyScaleCollectionAllowed } from '../../modules/survey/scale-collection-guard'
import { canStudentAccessScale } from '../../modules/scale/scale-access'
describe('scale governance consumption boundaries',()=>{
 beforeEach(()=>vi.clearAllMocks())
 it('resolves exact stored release and always protects legacy scale identities',async()=>{
  const tx={$queryRaw:vi.fn().mockResolvedValue([])}
  await assertTrainingScaleCollectionAllowed(tx as never,['scale','legacy','scale'])
  expect(mocks.guard).toHaveBeenCalledWith(tx,[],['legacy','scale'])
 })
 it('stops on frozen Survey exact and licensed source IDs without inventing a legacy release',async()=>{
  const tx={}
  await assertSurveyScaleCollectionAllowed(tx as never,{units:[
   {kind:'SCALE',draftId:'legacy'},{kind:'SCALE',draftId:'licensed',measurementRelease:{releaseId:'private'},sourceProvenance:{sourceMeasurementRelease:{releaseId:'upstream'}}},
   {kind:'COGNITIVE',draftId:'cognitive',measurementRelease:{releaseId:'not-a-scale'}},
  ]} as never)
  expect(mocks.guard).toHaveBeenCalledWith(tx,['private','upstream'],[],['legacy','licensed'])
 })
 it('does not treat a PUBLIC client record as distribution permission',async()=>{
  const tx={scale:{findUnique:vi.fn().mockResolvedValue({legacyPublicAccess:false,publicDistributionGrantId:null,instrumentClass:'CUSTOM_DESCRIPTIVE'})}}
  expect(await canStudentAccessScale({id:'scale',visibility:'PUBLIC',status:'PUBLISHED'},'student',tx as never)).toBe(false)
 })
 it('preserves only the persisted migration marker, not an implicit new approval',async()=>{
  const tx={scale:{findUnique:vi.fn().mockResolvedValue({legacyPublicAccess:true,publicDistributionGrantId:null,instrumentClass:'CUSTOM_DESCRIPTIVE'})}}
  expect(await canStudentAccessScale({id:'old',visibility:'PUBLIC',status:'PUBLISHED'},'student',tx as never)).toBe(true)
  expect(mocks.authority).not.toHaveBeenCalled()
 })
 it('rechecks exact platform grant for new PUBLIC admission and honors revocation',async()=>{
  const tx={scale:{findUnique:vi.fn().mockResolvedValue({legacyPublicAccess:false,publicDistributionGrantId:'grant',instrumentClass:'CUSTOM_DESCRIPTIVE'})},
   contentCapabilityGrant:{findUnique:vi.fn().mockResolvedValue({subjectId:'publisher'})}}
  mocks.authority.mockResolvedValueOnce({grantId:'grant',version:1})
  expect(await canStudentAccessScale({id:'scale',visibility:'PUBLIC',status:'PUBLISHED'},'student',tx as never)).toBe(true)
  expect(mocks.authority).toHaveBeenCalledWith(tx,{actorId:'publisher',grantId:'grant',capability:'material.distribute',scope:{product:'TRAINING',scopeKind:'PLATFORM',scopeId:'scale-public-delivery',resourceKind:'material',resourceKeys:['scale']}})
  mocks.authority.mockRejectedValueOnce(new Error('revoked'))
  expect(await canStudentAccessScale({id:'scale',visibility:'PUBLIC',status:'PUBLISHED'},'student',tx as never)).toBe(false)
 })
})


describe('persisted education entry keeps source and emergency boundaries',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.guard.mockReset()})
 it('uses the existing shared emergency guard for a persisted SCHOOL principal',async()=>{
  const tx={user:{findUnique:vi.fn().mockResolvedValue({accountDomain:'SCHOOL'})},$queryRaw:vi.fn()}
  await assertScaleNewEntryAllowed(tx as never,['scale'],'school-principal')
  expect(tx.user.findUnique).toHaveBeenCalledWith({where:{id:'school-principal'},select:{accountDomain:true}})
  expect(mocks.guard).toHaveBeenCalledWith(tx,[],['scale']);expect(tx.$queryRaw).not.toHaveBeenCalled()
  mocks.guard.mockRejectedValueOnce(new Error('explicit emergency stop'))
  await expect(assertScaleNewEntryAllowed(tx as never,['scale'],'school-principal')).rejects.toThrow('explicit emergency stop')
 })
 it('reads the real Questionnaire owner for anonymous/new entry rather than borrowing a participant realm',async()=>{
  const tx={questionnaire:{findUnique:vi.fn().mockResolvedValue({creatorId:'school-owner'})},user:{findUnique:vi.fn().mockResolvedValue({accountDomain:'SCHOOL'})},$queryRaw:vi.fn()}
  await assertQuestionnaireScaleNewEntryAllowed(tx as never,'stored-questionnaire',['scale'])
  expect(tx.questionnaire.findUnique).toHaveBeenCalledWith({where:{id:'stored-questionnaire'},select:{creatorId:true}})
  expect(tx.user.findUnique.mock.calls[0][0].where.id).toBe('school-owner')
  expect(mocks.guard).toHaveBeenCalledWith(tx,[],['scale']);expect(tx.$queryRaw).not.toHaveBeenCalled()
 })
 it('preserves shared emergency policy for an entered non-exact child without rechecking new-entry policy',async()=>{
  const tx={$queryRaw:vi.fn(async(query:any)=>{
   const sql=query.sql??query.join('?')
   if(sql.includes('FROM composite_assessment_attempts a WHERE'))return []
   if(sql.includes('FROM assessments a'))return [{scale_id:'ordinary'}]
   throw new Error('Entered child must not repeat current new-entry queries')
  })}
  const scope={compositeAttemptId:'parent',compositeItemIds:['item']}
  await assertTrainingScaleCollectionAllowed(tx as never,['ordinary'],scope)
  expect(mocks.guard).toHaveBeenCalledWith(tx,[],['ordinary'])
  mocks.guard.mockRejectedValueOnce(new Error('explicit emergency stop'))
  await expect(assertTrainingScaleCollectionAllowed(tx as never,['ordinary'],scope)).rejects.toThrow('explicit emergency stop')
 })
 it('fails closed when the stored principal or container is missing',async()=>{
  const tx={questionnaire:{findUnique:vi.fn().mockResolvedValue(null)},user:{findUnique:vi.fn().mockResolvedValue(null)}}
  await expect(assertScaleNewEntryAllowed(tx as never,['scale'],'missing')).rejects.toThrow('CONTENT_SCALE_ENTRY_PRINCIPAL_MISSING')
  await expect(assertQuestionnaireScaleNewEntryAllowed(tx as never,'missing',['scale'])).rejects.toThrow('CONTENT_SCALE_ENTRY_SOURCE_MISSING')
  expect(mocks.guard).not.toHaveBeenCalled()
 })
})
