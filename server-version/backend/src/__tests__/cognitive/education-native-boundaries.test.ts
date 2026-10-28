import {describe,it,expect,vi} from 'vitest'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
import {getCognitiveTaskResource,assertNativeDeliverySupported} from '../../modules/cognitive/task-resource'
import {getCognitiveRegistryEntry,requireCognitiveRegistryEntry} from '../../modules/cognitive/cognitive.registry'
import {SURVEY_GONOGO_CONFIG,cognitiveDraftSchema,surveyCognitiveTaskDefinition} from '../../modules/survey/cognitive.definition'
import {getCognitiveRawArchiveStatus} from '../../modules/cognitive/raw-archive.service'

describe('education entry native authority boundaries',()=>{
 it('finds Enumeration in the native resource registry but not the legacy Composite registry or public admission',()=>{
  const resource=getCognitiveTaskResource('enumeration','0.2.0','0.2.0')!
  expect(resource.kind).toBe('native');expect(()=>assertNativeDeliverySupported(resource,'authenticated')).not.toThrow()
  expect(getCognitiveRegistryEntry('enumeration','0.2.0','0.2.0')).toBeUndefined()
  expect(()=>requireCognitiveRegistryEntry('enumeration','0.2.0','0.2.0')).toThrow('No cognitive registry entry')
  expect(()=>assertNativeDeliverySupported(resource,'public')).toThrow('not enabled')
 })
 it('keeps the actual Survey cognitive definition fixed to its 120-trial Go/No-Go template',()=>{
  expect(surveyCognitiveTaskDefinition().testType).toBe('gonogo');expect(SURVEY_GONOGO_CONFIG.totalTrials).toBe(120)
  expect(cognitiveDraftSchema.safeParse({schemaVersion:1,templateKey:'enumeration'}).success).toBe(false)
 })
 it.each([
  ['Composite parent',{compositeAttemptId:'parent'},'UNSUPPORTED_ARCHIVE_SCOPE',422],
  ['Composite slot',{compositeItemId:'slot'},'UNSUPPORTED_ARCHIVE_SCOPE',422],
  ['access-token',{accessTokenId:'token'},'UNSUPPORTED_ARCHIVE_SCOPE',422],
  ['userId=null',{userId:null},'ARCHIVE_FORBIDDEN',403],
  ['different owner',{userId:'other'},'ARCHIVE_FORBIDDEN',403],
 ] as const)('refuses %s before raw or asset reads/writes',async(_name,overrides,code,statusCode)=>{
  const db={cognitiveSession:{findUnique:vi.fn(async()=>({id:'entry-session',userId:'owner',compositeAttemptId:null,compositeItemId:null,accessTokenId:null,...overrides}))},cognitiveRawSubmission:{findUnique:vi.fn()}},storeAsset=vi.fn()
  await expect(getCognitiveRawArchiveStatus({sessionId:'entry-session',attemptEpoch:1,submissionId:'synthetic-entry-submission',definitionHash:'a'.repeat(64)},{userId:'owner'},{db:db as any,storeAsset:storeAsset as any})).rejects.toMatchObject({code,statusCode})
  expect(db.cognitiveSession.findUnique).toHaveBeenCalledTimes(1)
  expect(db.cognitiveRawSubmission.findUnique).not.toHaveBeenCalled();expect(storeAsset).not.toHaveBeenCalled()
 })
})
