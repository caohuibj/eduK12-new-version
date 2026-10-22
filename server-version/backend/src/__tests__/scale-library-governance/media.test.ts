import {describe,it,expect,vi} from 'vitest'
vi.mock('../../config/database',()=>({prisma:{}}))
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {collectLibraryMediaIdentities,buildLibraryMediaManifest,assertLibraryMediaConsent,assertLibraryMediaManifest,approveLibraryMedia,assertLibraryMediaReady} from '../../modules/scale-library-governance/media'
const image={assetId:'00000000-0000-4000-8000-000000000001',contentHash:'a'.repeat(64),mimeType:'image/png'}
const video={assetId:'00000000-0000-4000-8000-000000000002',contentHash:'b'.repeat(64),mimeType:'video/mp4'}
const caption={assetId:'00000000-0000-4000-8000-000000000003',contentHash:'c'.repeat(64),mimeType:'text/vtt'}
const createdAt=new Date('2026-10-21T00:00:00.000Z')
const assets=[image,video,caption].map(i=>({id:i.assetId,sha256:i.contentHash,mimeType:i.mimeType,sizeBytes:42,createdAt,ownerId:'author',accessScope:'PRIVATE',deletedAt:null,objectKey:`assets/${i.assetId}`,provider:'local'}))
const snapshot={definition:{items:[{video:{video,poster:image,captions:[{asset:caption}]}}]},compiledDefinition:{report:{image}}}
const release={releaseId:'release',content:{},assetRefs:[]}
const db=()=>({$queryRaw:vi.fn().mockResolvedValue([]),$executeRaw:vi.fn().mockResolvedValue(1),storedAsset:{findMany:vi.fn().mockResolvedValue(assets)},assetReference:{createMany:vi.fn().mockResolvedValue({count:3}),count:vi.fn().mockResolvedValue(3)}})
describe('scale-bound library media manifest',()=>{
 it('enumerates fixed video, poster, captions and report image once without fetching external records',async()=>{
  const tx=db(),m=await buildLibraryMediaManifest(tx as never,'author',snapshot as never,release as never)
  expect(m.items).toHaveLength(3)
  expect(m.items.find(i=>i.assetId===image.assetId)?.usages).toHaveLength(2)
  expect(m.items.every(i=>i.rights==='AUTHOR_SHARED_FOR_BOUND_SCALE'&&i.assetVersion===createdAt.toISOString())).toBe(true)
  expect(JSON.stringify(m)).not.toMatch(/objectKey|ownerId|storageObjectKey/)
  expect(assertLibraryMediaManifest(m)).toEqual(m)
  expect(()=>assertLibraryMediaConsent(m,undefined)).toThrow('CONSENT')
  expect(()=>assertLibraryMediaConsent(m,{manifestHash:'0'.repeat(64),shareWithAuthorizedUsers:true})).toThrow('CONSENT')
  expect(()=>assertLibraryMediaConsent(m,{manifestHash:m.manifestHash,shareWithAuthorizedUsers:true})).not.toThrow()
 })
 it('requires ownership, private scope and the exact hash, never administrator override',async()=>{
  for(const patch of [{ownerId:'other'},{accessScope:'PUBLIC_CHECKIN'},{deletedAt:createdAt},{sha256:'f'.repeat(64)}]){
   const tx=db();tx.storedAsset.findMany.mockResolvedValue(assets.map(a=>({...a,...patch})))
   await expect(buildLibraryMediaManifest(tx as never,'author',snapshot as never,release as never)).rejects.toThrow()
  }
 })
 it('rejects unknown indirect IDs, unsupported content, missing identity and unbounded graphs',()=>{
  for(const value of [{videoId:'legacy-video'},{assetId:'id'}, {...image,mimeType:'image/svg+xml'}, {images:[{url:'https://external.example/image.png'}]}, {content:'![private](https://external.example/p.png)'}])
   expect(()=>collectLibraryMediaIdentities([{value,path:'definition',releaseId:'r'}])).toThrow()
  expect(()=>collectLibraryMediaIdentities([{value:{license:{url:'https://license.example'}},path:'definition',releaseId:'r'}])).not.toThrow()
  let deep:unknown={};for(let i=0;i<42;i++)deep={nested:deep}
  expect(()=>collectLibraryMediaIdentities([{value:deep,path:'definition',releaseId:'r'}])).toThrow('LIMIT')
 })
 it('resolves indirect report ASSET blocks only within the same frozen release',()=>{
  const root={value:{type:'ASSET',assetId:image.assetId,alt:'Report image'},path:'template',releaseId:'report'}
  expect(collectLibraryMediaIdentities([root],[{...image,releaseId:'report'}])[0].assetId).toBe(image.assetId)
  expect(()=>collectLibraryMediaIdentities([root],[{...image,releaseId:'other'}])).toThrow()
 })
 it('detects identity conflicts and manifest tampering',async()=>{
  expect(()=>collectLibraryMediaIdentities([{value:[image,{...image,contentHash:'d'.repeat(64)}],path:'definition',releaseId:'r'}])).toThrow('CONFLICT')
  const m=await buildLibraryMediaManifest(db() as never,'author',snapshot as never,release as never)
  expect(()=>assertLibraryMediaManifest({...m,items:[]})).toThrow('MISMATCH')
  const {manifestHash:_hash,...body}=m
  const duplicate={...body,items:[m.items[0],m.items[0]]}
  expect(()=>assertLibraryMediaManifest({...duplicate,manifestHash:canonicalHash(duplicate)})).toThrow('MISMATCH')
 })
 it('approves with same logical IDs and retention, without uploading or changing PUBLIC scope',async()=>{
  const tx=db(),m=await buildLibraryMediaManifest(tx as never,'author',snapshot as never,release as never)
  await approveLibraryMedia(tx as never,'entry','submission',m)
  expect(tx.assetReference.createMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.arrayContaining([expect.objectContaining({entityType:'ScaleLibraryMedia',entityId:'entry',assetId:image.assetId})])}))
  expect(tx.$executeRaw).toHaveBeenCalledTimes(3)
  const sql=tx.$executeRaw.mock.calls.map(call=>JSON.stringify(call)).join(' ')
  expect(sql).toContain('READY');expect(sql).not.toContain('PUBLIC')
 })
 it('refuses missing submission pins, version replacement and partial media readiness',async()=>{
  const tx=db(),m=await buildLibraryMediaManifest(tx as never,'author',snapshot as never,release as never)
  tx.assetReference.count.mockResolvedValue(2)
  await expect(approveLibraryMedia(tx as never,'entry','submission',m)).rejects.toThrow('NOT_RETAINED')
  tx.storedAsset.findMany.mockResolvedValue(assets.map(a=>({...a,createdAt:new Date('2026-10-22T00:00:00Z')})))
  await expect(approveLibraryMedia(tx as never,'entry','submission',m)).rejects.toThrow('FROZEN_VERSION')
  tx.storedAsset.findMany.mockResolvedValue(assets)
  await expect(assertLibraryMediaReady(tx as never,'entry',m)).rejects.toThrow('NOT_READY')
 })
})
