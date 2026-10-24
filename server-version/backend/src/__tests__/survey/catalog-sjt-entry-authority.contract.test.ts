import {beforeEach,describe,expect,it,vi} from 'vitest'
import document from '../../modules/situational/authoring/examples/online-hand-calculated.json'
import {compileSjtOnlineDocument} from '../../modules/situational/authoring/online'
import {validateSituationPackage} from '../../modules/situational/situation-package'
import {assertCatalogSourcesCurrent,getCatalogSourceSnapshot,recheckCatalogSjtSourceAuthority} from '../../modules/survey/catalog.sources'
import {SjtEntryAuthorityError} from '../../modules/situational/entry-authority'
const h=vi.hoisted(()=>({admit:vi.fn(),recheck:vi.fn()}))
vi.mock('../../modules/situational/entry-authority',async original=>({...await original<object>(),
  assertSjtEntryDistributionAuthority:h.admit,recheckSjtEntryDistributionAuthority:h.recheck}))
const ref={kind:'SJT' as const,sourceId:'release',sourceVersion:document.instrumentVersion}
const receipt={protocol:'sjt-survey-distribution-v1',actorId:'admin',grantId:'original-capability',grantVersion:1,
  measurementReleaseId:'measurement',measurementContentHash:'a'.repeat(64),releaseId:ref.sourceId,
  instrumentVersion:ref.sourceVersion,definitionHash:'b'.repeat(64),contentDigest:'c'.repeat(64)}
function setup(){
  const pkg={...compileSjtOnlineDocument(document).package,releaseStatus:'PUBLISHED' as const}
  const row={id:ref.sourceId,instrumentKey:pkg.key,instrumentVersion:pkg.instrumentVersion,package:pkg,
    definitionHash:validateSituationPackage(pkg).definitionHash,authorizationPolicy:'COURSE_GRANT_V1'}
  return {$queryRaw:vi.fn().mockResolvedValue([]),sjtAuthorRelease:{findFirst:vi.fn().mockResolvedValue(row),findMany:vi.fn().mockResolvedValue([row])}}
}
beforeEach(()=>{vi.resetAllMocks();h.admit.mockResolvedValue(receipt);h.recheck.mockResolvedValue(undefined)})
describe('SJT Survey catalog capability pin and final fence contracts',()=>{
  it('rechecks the stored exact capability rather than discovering replacement permission',async()=>{
    const db=setup(),snapshot=await getCatalogSourceSnapshot({actorUserId:'admin',ref},db as never)
    await assertCatalogSourcesCurrent([{snapshot,actorUserId:'admin'}],db as never)
    expect(h.admit).toHaveBeenLastCalledWith(db,{actorId:'admin',releaseId:'release',instrumentVersion:ref.sourceVersion,pinned:receipt})
  })
  it('rejects a changed authority identity and propagates revocation with no fallback',async()=>{
    const db=setup(),snapshot=await getCatalogSourceSnapshot({actorUserId:'admin',ref},db as never)
    h.admit.mockResolvedValueOnce({...receipt,grantId:'replacement'})
    await expect(assertCatalogSourcesCurrent([{snapshot,actorUserId:'admin'}],db as never)).rejects.toThrow('SOURCE_SNAPSHOT_CHANGED')
    h.admit.mockRejectedValueOnce(new SjtEntryAuthorityError())
    await expect(assertCatalogSourcesCurrent([{snapshot,actorUserId:'admin'}],db as never)).rejects.toMatchObject({statusCode:403})
  })
  it('checks serialized pinned receipts after later publication waits, only once for duplicates',async()=>{
    const db=setup(),snapshot=await getCatalogSourceSnapshot({actorUserId:'admin',ref},db as never)
    const copied=JSON.parse(JSON.stringify(snapshot))
    await recheckCatalogSjtSourceAuthority(db as never,[snapshot,copied])
    expect(h.recheck).toHaveBeenCalledTimes(1)
    expect(h.recheck).toHaveBeenCalledWith(db,receipt)
    h.recheck.mockRejectedValueOnce(new SjtEntryAuthorityError('SOURCE_SJT_ENTRY_EXPIRED'))
    await expect(recheckCatalogSjtSourceAuthority(db as never,[copied])).rejects.toMatchObject({code:'SOURCE_SJT_ENTRY_EXPIRED',statusCode:403})
  })
  it('does not add capability checks to existing unrestricted snapshots',async()=>{
    const db=setup();db.sjtAuthorRelease.findFirst.mockResolvedValue({...await db.sjtAuthorRelease.findFirst(),authorizationPolicy:null})
    const snapshot=await getCatalogSourceSnapshot({actorUserId:'admin',ref},db as never)
    expect(snapshot.provenance).not.toHaveProperty('sjtEntryAuthority')
    await recheckCatalogSjtSourceAuthority(db as never,[snapshot])
    expect(h.admit).not.toHaveBeenCalled();expect(h.recheck).not.toHaveBeenCalled()
  })
})
