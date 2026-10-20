import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({read:vi.fn(),publish:vi.fn(),decrypt:vi.fn()}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.read,publishContentRelease:mocks.publish}))
vi.mock('../../modules/cognitive/cognitive.security',()=>({decryptCognitivePayload:mocks.decrypt,encryptCognitivePayload:vi.fn()}))
import {publishAssignmentMeasurementRelease} from '../../modules/cognitive/assignment-measurement-release'
import {SURVEY_GONOGO_CONFIG} from '../../modules/survey/cognitive.definition'
import {prepareRelease} from '../../modules/measurement-content/release'
import {hashResolvedConfig} from '../../modules/cognitive/profile-freeze'
const db={$queryRaw:vi.fn(),$executeRaw:vi.fn()}
let assignment:any,config:any
const sql=(q:any)=>q.strings.join(' ')
const call=()=>publishAssignmentMeasurementRelease(db as never,'teacher','assignment')
beforeEach(()=>{
 vi.clearAllMocks();assignment={id:'assignment',created_by:'teacher',config_id:'config',status:'PUBLISHED',profile:null,profile_definition_version:null,resolved_config_snapshot_encrypted:null,resolved_config_hash:null,measurement_release_id:null}
 config={id:'config',status:'PUBLISHED',test_type:'gonogo',config_version:'1.1.0',engine_version:'1.0.0',scoring_version:'1.0.0',config:SURVEY_GONOGO_CONFIG}
 db.$queryRaw.mockImplementation(async q=>sql(q).includes('FROM cognitive_assignments')?[assignment]:[config]);db.$executeRaw.mockResolvedValue(1)
 mocks.publish.mockImplementation(async(_db,input)=>({...prepareRelease(input),releaseId:'11111111-1111-4111-8111-111111111111',status:'PUBLISHED',publishedBy:'teacher',publishedAt:new Date()}))
})
describe('explicit owned assignment effective measurement publication',()=>{
 it('uses real registry default and private assignment scope; only CAS-fills the pointer',async()=>{
  const result=await call();expect(result.measurementHash).toMatch(/^[a-f0-9]{64}$/)
  const input=mocks.publish.mock.calls[0][1]
  expect(input.scope).toEqual({kind:'PRIVATE',product:'TRAINING',ownerId:'teacher',resourceId:'assignment'})
  expect(input.provenance).toMatchObject({configId:'config',configVersion:'1.1.0',profile:null,assignmentId:'assignment'})
  expect(sql(db.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');expect(sql(db.$queryRaw.mock.calls[1][0])).toContain('FOR SHARE')
  expect(sql(db.$executeRaw.mock.calls[0][0])).toContain('measurement_release_id IS NULL')
  expect(sql(db.$executeRaw.mock.calls[0][0])).not.toContain('cognitive_test_configs')
 })
 it('uses exact frozen effective profile instead of the global default',async()=>{
  await call();const defaultHash=mocks.publish.mock.calls[0][1].content.measurementHash
  const effective={...SURVEY_GONOGO_CONFIG,stimulusMs:900}
  assignment={...assignment,profile:'research',profile_definition_version:'profile-v1',resolved_config_snapshot_encrypted:'cipher',resolved_config_hash:hashResolvedConfig(effective)}
  mocks.decrypt.mockReturnValue(effective);await call()
  expect(mocks.decrypt).toHaveBeenCalledWith('cipher');expect(mocks.publish.mock.calls[1][1].content.measurementHash).not.toBe(defaultHash)
 })
 it('rejects another owner, unpublished source, broken frozen hash and partial freeze',async()=>{
  assignment.created_by='other';await expect(call()).rejects.toThrow('SOURCE_DENIED');assignment.created_by='teacher'
  config.status='RETIRED';await expect(call()).rejects.toThrow('CONFIG_NOT_PUBLISHED');config.status='PUBLISHED'
  assignment.profile='research';await expect(call()).rejects.toThrow('PROFILE_INVALID')
  Object.assign(assignment,{profile_definition_version:'v1',resolved_config_snapshot_encrypted:'cipher',resolved_config_hash:'0'.repeat(64)});mocks.decrypt.mockReturnValue(SURVEY_GONOGO_CONFIG)
  await expect(call()).rejects.toThrow('PROFILE_INVALID');expect(mocks.publish).not.toHaveBeenCalled()
 })
 it('idempotently validates existing pointer and rejects wrong scope, changed config and retired/revoked release',async()=>{
  await call();const input=mocks.publish.mock.calls[0][1],stored={...prepareRelease(input),releaseId:'11111111-1111-4111-8111-111111111111',status:'PUBLISHED'}
  assignment.measurement_release_id=stored.releaseId;db.$executeRaw.mockClear();mocks.publish.mockClear();mocks.read.mockResolvedValue(stored)
  expect(await call()).toMatchObject({releaseId:stored.releaseId});expect(mocks.publish).not.toHaveBeenCalled();expect(db.$executeRaw).not.toHaveBeenCalled()
  for(const status of ['RETIRED','REVOKED','SUPERSEDED']){mocks.read.mockResolvedValue({...stored,status});await expect(call()).rejects.toThrow('RELEASE_NOT_PUBLISHED')}
  mocks.read.mockResolvedValue({...stored,scope:{kind:'PLATFORM'}});await expect(call()).rejects.toThrow('RELEASE_MISMATCH')
  mocks.read.mockResolvedValue(stored);config.config={...SURVEY_GONOGO_CONFIG,stimulusMs:900};await expect(call()).rejects.toThrow('RELEASE_MISMATCH')
 })
 it('fails pointer CAS and unknown registry without modifying global config',async()=>{
  db.$executeRaw.mockResolvedValue(0);await expect(call()).rejects.toThrow('SOURCE_CHANGED')
  config.test_type='unsupported';await expect(call()).rejects.toThrow('PROFILE_INVALID')
 })
})

it('report-only config changes preserve scientific hash/version while provenance retains full source digest',async()=>{
 await call();const first=mocks.publish.mock.calls[0][1]
 assignment.id='second-assignment';config.config={...SURVEY_GONOGO_CONFIG,report:{...SURVEY_GONOGO_CONFIG.report,reportVersion:'2.0.0'}}
 await call();const second=mocks.publish.mock.calls[1][1]
 expect(second.content.measurementHash).toBe(first.content.measurementHash)
 expect(second.version).toBe(first.version);expect(second.version).toBe('assignment-v1:'+second.content.measurementHash)
 expect(second.key).not.toBe(first.key)
 expect(second.provenance.effectiveConfigHash).not.toBe(first.provenance.effectiveConfigHash)
})
