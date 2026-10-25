import { beforeEach,describe,expect,it,vi } from 'vitest'
const mocks=vi.hoisted(()=>({guard:vi.fn(),authority:vi.fn()}))
vi.mock('../../modules/scale-library-governance/collection-guard',()=>({assertScaleLibraryCollectionAllowed:mocks.guard}))
vi.mock('../../modules/measurement-content/content-authority.repository',()=>({assertContentAuthority:mocks.authority}))
import { assertTrainingScaleCollectionAllowed } from '../../modules/scale/scale-collection-guard'
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
