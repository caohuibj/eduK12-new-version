import {describe,it,expect,vi,beforeEach} from 'vitest'
vi.mock('../../config/database',()=>({prisma:{}}))
vi.mock('../../modules/scale-library-governance/usage',()=>({assertLibraryUseGrantCurrent:vi.fn()}))
vi.mock('../../modules/scale-library-governance/service',()=>({loadEntry:vi.fn()}))
vi.mock('../../modules/scale-library-governance/media',async original=>({...await original<typeof import('../../modules/scale-library-governance/media')>(),assertLibraryMediaReady:vi.fn()}))
import {assertLibraryUseGrantCurrent} from '../../modules/scale-library-governance/usage'
import {loadEntry} from '../../modules/scale-library-governance/service'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {authorizedLibraryUnitMedia} from '../../modules/scale-library-governance/media.authorization'
import {assertSurveyMediaOwned} from '../../modules/survey/media.references'
const identity={assetId:'00000000-0000-4000-8000-000000000001',contentHash:'a'.repeat(64),mimeType:'image/png'}
const definition={rawScoreFeedback:{rules:[{images:[{asset:identity}]}]}}
const compiledDefinition={report:definition}
const sourceProvenance={libraryEntryId:'entry'}
const snapshot={displayDefinition:definition,compiledDefinition,provenance:sourceProvenance}
const body={schemaVersion:1 as const,releaseIds:['release'],items:[{...identity,sizeBytes:40,assetVersion:'2026-10-21T00:00:00.000Z',usages:['report'],rights:'AUTHOR_SHARED_FOR_BOUND_SCALE' as const,dependencyReleaseIds:['release']}]}
const manifest={...body,manifestHash:canonicalHash(body)}
const unit={kind:'SCALE' as const,definition,compiledDefinition,sourceProvenance}
const db=()=>({$queryRaw:vi.fn().mockResolvedValue([{snapshot,snapshot_digest:canonicalHash(snapshot)}]),storedAsset:{findMany:vi.fn().mockResolvedValue([{id:identity.assetId,objectKey:'assets/image',provider:'local',sha256:identity.contentHash,mimeType:identity.mimeType,sizeBytes:40,deletedAt:null}])}})
beforeEach(()=>{
 vi.mocked(assertLibraryUseGrantCurrent).mockReset();vi.mocked(loadEntry).mockReset()
 vi.mocked(assertLibraryUseGrantCurrent).mockResolvedValue({survey_tool_grant_id:'grant'} as never)
 vi.mocked(loadEntry).mockResolvedValue({entry:{release_id:'release'},submission:{snapshot:{mediaManifest:manifest}}} as never)
})
describe('cross-owner scale-bound publication media',()=>{
 it('retains the same fixed report asset after verifying exact authorized catalog definition',async()=>{
  const tx=db()
  await expect(assertSurveyMediaOwned(tx as never,'reader','reader-project',[unit])).resolves.toEqual([identity])
  expect(assertLibraryUseGrantCurrent).toHaveBeenCalledWith(tx,{entryId:'entry',userId:'reader',product:'SURVEY'})
  expect(tx.storedAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{id:{in:[identity.assetId]}}}))
 })
 it('cannot borrow a libraryEntryId for an edited definition, another scale or altered compiler output',async()=>{
  for(const changed of [{...unit,definition:{}},{...unit,compiledDefinition:{}},{...unit,kind:'FORM'}])
   await expect(authorizedLibraryUnitMedia(db() as never,'reader',changed)).rejects.toThrow()
 })
 it('rejects revoked parent grant and tampered stored catalog snapshot before permitting cross-owner media',async()=>{
  vi.mocked(assertLibraryUseGrantCurrent).mockRejectedValueOnce(new Error('revoked'))
  await expect(authorizedLibraryUnitMedia(db() as never,'reader',unit)).rejects.toThrow('revoked')
  const tx=db();tx.$queryRaw.mockResolvedValue([{snapshot,snapshot_digest:'tampered'}])
  await expect(authorizedLibraryUnitMedia(tx as never,'reader',unit)).rejects.toThrow('MISMATCH')
 })
 it('does not relax native author/project ownership without exact library provenance',async()=>{
  const tx=db()
  await expect(authorizedLibraryUnitMedia(tx as never,'reader',{kind:'SCALE',definition})).resolves.toBeNull()
  expect(assertLibraryUseGrantCurrent).not.toHaveBeenCalled()
  expect(tx.$queryRaw).not.toHaveBeenCalled()
 })
})
