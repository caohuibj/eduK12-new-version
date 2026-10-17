import { randomUUID, createHash } from 'node:crypto'
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { shareAssetStorage } from '../../services/sharedAssetStorage'
import { assetStorageKey } from '../../services/assetStorageKey'
import { discardUnreferencedAsset, canReadPrivateAsset, signKnownAsset, serveStoredAssetContent } from '../../services/assetStorage'
import * as cosModule from '../../utils/cos'
const dbUrl=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite=dbUrl?describe:describe.skip
suite('shared COS bytes retain independent authorization and deletion protection',()=>{
 const ids=Array.from({length:5},()=>randomUUID())
 const sha=createHash('sha256').update('test').digest('hex')
 const data=(i:number)=>({id:ids[i],objectKey:`assets/${ids[i]}.pdf`,provider:'cos',mimeType:'application/pdf',sizeBytes:4,sha256:sha,ownerId:`owner-${i}`,accessScope:'PRIVATE',scopeId:`scope-${i}`})
 const plan=(target=1,canonical=0)=>({assetId:ids[target],canonicalId:ids[canonical],canonicalKey:data(canonical).objectKey,sha256:sha,sizeBytes:4,mimeType:'application/pdf'})
 const remoteDelete=vi.spyOn(cosModule.cos,'deleteObject').mockImplementation(((_p:any,cb:any)=>{cb(null,{});return {} }) as any)
 beforeAll(async()=>{requireIsolatedReleaseDatabase(dbUrl!);for(let i=0;i<ids.length;i++)await prisma.storedAsset.create({data:data(i)})})
 afterAll(async()=>{vi.restoreAllMocks();await prisma.assetReference.deleteMany({where:{assetId:{in:ids}}});await prisma.storedAsset.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect()})
 it('old format works; sharing is idempotent and keeps each identity, owner, scope and URL',async()=>{
  expect(assetStorageKey(data(0))).toBe(data(0).objectKey)
  await shareAssetStorage(plan());await shareAssetStorage(plan())
  for(const i of [0,1]){
   const row=await prisma.storedAsset.findUniqueOrThrow({where:{id:ids[i]}})
   expect(row.ownerId).toBe(data(i).ownerId);expect(row.scopeId).toBe(data(i).scopeId)
   expect(row.objectKey).toBe(data(i).objectKey);expect(assetStorageKey(row)).toBe(data(0).objectKey)
   expect(await canReadPrivateAsset(row,{userId:data(i).ownerId})).toBe(true)
   expect(await canReadPrivateAsset(row,{userId:'foreign-owner'})).toBe(false)
   expect(signKnownAsset(row)).toContain(`/api/assets/${ids[i]}/content?`)
  }
  await expect(shareAssetStorage({...plan(),sha256:'f'.repeat(64)})).rejects.toThrow('no longer matches')
 })
 it('deleting canonical logical row retains shared bytes; frozen reference protects the remaining logical asset',async()=>{
  const a=await prisma.storedAsset.findUniqueOrThrow({where:{id:ids[0]}})
  expect(await discardUnreferencedAsset(a)).toBe(true);expect(remoteDelete).not.toHaveBeenCalled()
  const b=await prisma.storedAsset.findUniqueOrThrow({where:{id:ids[1]}})
  const signer=vi.spyOn(cosModule,'getCOSSignedUrl').mockResolvedValue('https://synthetic.invalid/content')
  const res={redirect:vi.fn()} as any;await serveStoredAssetContent(b,res)
  expect(signer.mock.calls[0][0]).toBe(data(0).objectKey);signer.mockRestore()
  await prisma.assetReference.create({data:{assetId:b.id,entityType:'AssessmentFrozenRuntime',entityId:'synthetic-mixed-scale-cognitive',field:'media'}})
  expect(await discardUnreferencedAsset(b)).toBe(false)
  await expect(cosModule.deleteFromCOS(data(0).objectKey)).rejects.toThrow('retained')
  expect(remoteDelete).not.toHaveBeenCalled()
 })
 it('concurrent canonical compensation and binding cannot leave an accepted pointer to deleted bytes',async()=>{
  const c=await prisma.storedAsset.findUniqueOrThrow({where:{id:ids[3]}})
  const outcome=await Promise.allSettled([shareAssetStorage(plan(4,3)),discardUnreferencedAsset(c)])
  const target=await prisma.storedAsset.findUniqueOrThrow({where:{id:ids[4]}})
  if(outcome[0].status==='fulfilled'){
   expect(assetStorageKey(target)).toBe(c.objectKey)
   expect(remoteDelete.mock.calls.some(call=>call[0].Key===c.objectKey)).toBe(false)
  }else expect(target.storageObjectKey).toBeNull()
 })
 it('database rejects shared local storage and traversal; source identities remain intact',async()=>{
  await expect(prisma.storedAsset.update({where:{id:ids[2]},data:{provider:'local',storageObjectKey:data(0).objectKey}})).rejects.toThrow()
  await expect(prisma.storedAsset.update({where:{id:ids[2]},data:{storageObjectKey:'assets/../private'}})).rejects.toThrow()
  const row=await prisma.storedAsset.findUniqueOrThrow({where:{id:ids[2]}});expect(row.storageObjectKey).toBeNull()
 })
})
