import { beforeEach, describe, expect, it, vi } from 'vitest'
import {compileSjtTemplate} from '../../modules/situational/authoring/template'
import {sjtNativeStagedTemplate} from '../fixtures/sjt-native-staged.fixture'
import fixture from '../../modules/situational/authoring/examples/online-hand-calculated.json'
import { compileSjtOnlineDocument } from '../../modules/situational/authoring/online'
import { adaptCatalogSjt } from '../../modules/survey/catalog.sources'
import { compileCatalogUnit } from '../../modules/survey/catalog.service'
import { authorizedCatalogSjtMedia } from '../../modules/survey/catalog-sjt-media.authorization'
import { assertSurveyMediaOwned } from '../../modules/survey/media.references'
const h = vi.hoisted(() => ({ snapshots: vi.fn(), authority:vi.fn() }))
vi.mock('../../modules/situational/entry-authority',async original=>({...await original<object>(),recheckSjtEntryDistributionAuthority:h.authority}))
import {SjtEntryAuthorityError} from '../../modules/situational/entry-authority'
vi.mock('../../modules/survey/catalog.service', async original => ({ ...await original<object>(), catalogSnapshotsForDrafts: h.snapshots }))
const identity = { assetId: 'source-image', contentHash: 'a'.repeat(64), mimeType: 'image/png' }
const image = { asset: identity, altText: '情境图', rightsStatus: 'self_authored', rightsNote: 'synthetic source' }
function setup(native=false) {
  const document: any = structuredClone(native?sjtNativeStagedTemplate:fixture)
  if(native)document.nodes[0].image=image;else document.display.scenes[0].image=image
  const pkg = { ...(native?compileSjtTemplate(document):compileSjtOnlineDocument(document)).package, releaseStatus: 'PUBLISHED' as const }
  const snapshot = adaptCatalogSjt({ kind: 'SJT', sourceId: 'release', sourceVersion: pkg.instrumentVersion }, 'SJT', pkg)
  const frozen = compileCatalogUnit({ id: 'draft', instrumentKey: 'sjt', kind: 'SJT', title: 'SJT', revision: 1, definition: snapshot.displayDefinition }, snapshot)
  const unit = { kind: frozen.kind, definition: frozen.displayDefinition, compiledDefinition: frozen.compiledDefinition, sourceProvenance: frozen.sourceProvenance }
  const asset = { id: identity.assetId, sha256: identity.contentHash, mimeType: identity.mimeType, sizeBytes: 12, objectKey: 'synthetic.png', storageObjectKey: null,
    provider: 'local', deletedAt: null, accessScope: 'PRIVATE', scopeId: 'sjt-authoring', ownerId: 'original-author' }
  const release = { status: 'PUBLISHED', authorizationPolicy: null, instrumentVersion: pkg.instrumentVersion, definitionHash: snapshot.provenance.definitionHash }
  const db = { $queryRaw: vi.fn().mockResolvedValue([{ id: 'grant',snapshot }]), sjtAuthorRelease: { findUnique: vi.fn().mockResolvedValue(release) },
    storedAsset: { findMany: vi.fn().mockResolvedValue([asset]) }, assetReference: { findMany: vi.fn().mockResolvedValue([{ assetId: identity.assetId }]) } }
  h.snapshots.mockResolvedValue(new Map([['grant', snapshot]]))
  return { db, unit, asset, release, snapshot }
}
beforeEach(() => vi.clearAllMocks())
describe('catalog SJT media authority is release-bound, not asset-ID borrowing', () => {
  it('matches the pinned grant added by current compilation without borrowing an identical replacement',async()=>{
    const {db,unit,snapshot}=setup(true)
    unit.sourceProvenance!.sourceGrantId='grant'
    db.$queryRaw.mockResolvedValue([{id:'replacement',snapshot},{id:'grant',snapshot}])
    await expect(authorizedCatalogSjtMedia(db as never,'researcher',unit)).resolves.toEqual([identity])
    expect(h.snapshots).toHaveBeenCalledWith(db,'researcher',['grant'])
    h.snapshots.mockClear()
    db.$queryRaw.mockResolvedValue([{id:'replacement',snapshot}])
    await expect(authorizedCatalogSjtMedia(db as never,'researcher',unit)).rejects.toThrow('SOURCE_SJT_MEDIA_AUTHORIZATION_REQUIRED')
    expect(h.snapshots).not.toHaveBeenCalled()
  })
  it('uses the same exact grant and release-pin policy for native upload images, not just their asset IDs',async()=>{
    const {db,unit,asset}=setup(true)
    expect(await assertSurveyMediaOwned(db as never,'researcher','project',[unit])).toEqual([identity])
    expect(h.snapshots).toHaveBeenCalledWith(db,'researcher',['grant'])
    db.assetReference.findMany.mockResolvedValueOnce([])
    await expect(authorizedCatalogSjtMedia(db as never,'researcher',unit)).rejects.toThrow('SOURCE_SJT_MEDIA_AUTHORIZATION_REQUIRED')
    asset.accessScope='PUBLIC'
    await expect(authorizedCatalogSjtMedia(db as never,'researcher',unit)).rejects.toThrow('SOURCE_SJT_MEDIA_AUTHORIZATION_REQUIRED')
  })
  it('validates only the exact frozen replacement grant, without an unrelated expired chain blocking it',async()=>{
    const {db,unit,snapshot}=setup(true)
    const old=structuredClone(snapshot)
    old.provenance.sjtEntryAuthority={protocol:'sjt-survey-distribution-v1',grantId:'old-root',grantVersion:1}
    db.$queryRaw.mockResolvedValue([{id:'old-tool',snapshot:old},{id:'grant',snapshot}])
    h.snapshots.mockImplementation(async(_tx,_user,ids)=>{
      if(ids.includes('old-tool'))throw new Error('old distribution revoked')
      return new Map([['grant',snapshot]])
    })
    await expect(authorizedCatalogSjtMedia(db as never,'researcher',unit)).resolves.toEqual([identity])
    expect(h.snapshots).toHaveBeenCalledWith(db,'researcher',['grant'])
    // The old unit cannot silently borrow the replacement's authority.
    const oldUnit={...unit,sourceProvenance:{...unit.sourceProvenance,sjtEntryAuthority:old.provenance.sjtEntryAuthority}}
    await expect(authorizedCatalogSjtMedia(db as never,'researcher',oldUnit)).rejects.toThrow('old distribution revoked')
  })
  it('fails closed for multiple exact candidates or an identity changed between selection and locked validation',async()=>{
    const {db,unit,snapshot}=setup(true)
    db.$queryRaw.mockResolvedValue([{id:'grant',snapshot},{id:'duplicate',snapshot}])
    await expect(authorizedCatalogSjtMedia(db as never,'researcher',unit)).rejects.toThrow('SOURCE_SJT_MEDIA_AUTHORIZATION_REQUIRED')
    expect(h.snapshots).not.toHaveBeenCalled()
    db.$queryRaw.mockResolvedValue([{id:'grant',snapshot}])
    h.snapshots.mockResolvedValue(new Map([['grant',{...snapshot,definitionDigest:'changed'}]]))
    await expect(authorizedCatalogSjtMedia(db as never,'researcher',unit)).rejects.toThrow('SOURCE_SJT_MEDIA_AUTHORIZATION_REQUIRED')
  })
  it('uses current grant admission and original release retention without changing private ownership', async () => {
    const { db, unit, asset } = setup()
    expect(await assertSurveyMediaOwned(db as never, 'researcher', 'project', [unit])).toEqual([identity])
    expect(h.snapshots).toHaveBeenCalledWith(db, 'researcher', ['grant'])
    expect(db.assetReference.findMany).toHaveBeenCalledWith({ where: { assetId: { in: [identity.assetId] }, entityType: 'SjtAuthorRelease', entityId: 'release', field: 'media' }, select: { assetId: true } })
    expect(asset.ownerId).toBe('original-author'); expect(asset.accessScope).toBe('PRIVATE')
  })
  it('propagates revoked/source-stopped admission and rejects an unrelated active grant', async () => {
    const { db, unit } = setup(); h.snapshots.mockRejectedValueOnce(new Error('revoked'))
    await expect(authorizedCatalogSjtMedia(db as never, 'researcher', unit)).rejects.toThrow('revoked')
    h.snapshots.mockResolvedValueOnce(new Map())
    await expect(authorizedCatalogSjtMedia(db as never, 'researcher', unit)).rejects.toThrow('SOURCE_SJT_MEDIA_AUTHORIZATION_REQUIRED')
  })
  it.each(['COURSE_GRANT_V1', 'FUTURE', undefined])('never replaces source permission policy %s with a Survey grant', async policy => {
    const { db, unit, release } = setup(); Object.assign(release, { authorizationPolicy: policy })
    await expect(authorizedCatalogSjtMedia(db as never, 'researcher', unit)).rejects.toThrow('SOURCE_SJT_MEDIA_AUTHORIZATION_REQUIRED')
  })
  it('accepts only the exact separately authorized Survey source and retains private asset checks',async()=>{
    const {db,unit,release,snapshot,asset}=setup()
    Object.assign(release,{authorizationPolicy:'COURSE_GRANT_V1'})
    const receipt={protocol:'sjt-survey-distribution-v1',grantId:'exact-capability'}
    snapshot.provenance.sjtEntryAuthority=receipt
    unit.sourceProvenance!.sjtEntryAuthority=receipt
    h.authority.mockResolvedValue(undefined)
    expect(await authorizedCatalogSjtMedia(db as never,'researcher',unit)).toEqual([identity])
    expect(h.authority).toHaveBeenCalledWith(db,receipt)
    h.authority.mockRejectedValueOnce(new SjtEntryAuthorityError('SOURCE_SJT_ENTRY_AUTHORITY_REQUIRED'))
    await expect(authorizedCatalogSjtMedia(db as never,'researcher',unit)).rejects.toThrow('SOURCE_SJT_MEDIA_AUTHORIZATION_REQUIRED')
    asset.accessScope='PUBLIC'
    await expect(authorizedCatalogSjtMedia(db as never,'researcher',unit)).rejects.toThrow('SOURCE_SJT_MEDIA_AUTHORIZATION_REQUIRED')
  })
  it('rejects missing source retention, altered hash, public or deleted assets', async () => {
    const { db, unit, asset } = setup(); db.assetReference.findMany.mockResolvedValueOnce([])
    await expect(authorizedCatalogSjtMedia(db as never, 'researcher', unit)).rejects.toThrow('SOURCE_SJT_MEDIA_AUTHORIZATION_REQUIRED')
    asset.sha256 = 'b'.repeat(64)
    await expect(authorizedCatalogSjtMedia(db as never, 'researcher', unit)).rejects.toMatchObject({ name: 'CatalogSourceError', statusCode: 403, code: 'SOURCE_SJT_MEDIA_AUTHORIZATION_REQUIRED' })
    asset.sha256 = identity.contentHash; asset.accessScope = 'PUBLIC'
    await expect(authorizedCatalogSjtMedia(db as never, 'researcher', unit)).rejects.toThrow('SOURCE_SJT_MEDIA_AUTHORIZATION_REQUIRED')
    asset.accessScope = 'PRIVATE'; Object.assign(asset, { deletedAt: new Date() })
    await expect(authorizedCatalogSjtMedia(db as never, 'researcher', unit)).rejects.toThrow('SOURCE_SJT_MEDIA_AUTHORIZATION_REQUIRED')
  })
  it('does not fall back to native ownership for malformed source provenance or substituted display', async () => {
    const { db, unit } = setup()
    await expect(assertSurveyMediaOwned(db as never, 'researcher', 'project', [{ ...unit, sourceProvenance: {} }])).rejects.toThrow('SOURCE_SJT_MEDIA_AUTHORIZATION_REQUIRED')
    await expect(authorizedCatalogSjtMedia(db as never, 'researcher', { ...unit, definition: { ...(unit.definition as object), title: 'substituted' } })).rejects.toThrow('SOURCE_SJT_MEDIA_AUTHORIZATION_REQUIRED')
  })
  it('leaves native Survey image ownership checks intact', async () => {
    const { db, unit, asset } = setup(); const native = { ...unit, sourceProvenance: undefined }
    expect(await authorizedCatalogSjtMedia(db as never, 'researcher', native)).toBeNull()
    db.$queryRaw.mockResolvedValue([{ id: asset.id }]); asset.ownerId = 'researcher'
    expect(await assertSurveyMediaOwned(db as never, 'researcher', 'project', [native])).toEqual([identity])
    expect(db.storedAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerId: 'researcher', accessScope: 'PRIVATE', deletedAt: null }) }))
    db.storedAsset.findMany.mockResolvedValueOnce([])
    await expect(assertSurveyMediaOwned(db as never, 'researcher', 'project', [native])).rejects.toThrow('缺少本项目授权')
  })
})
