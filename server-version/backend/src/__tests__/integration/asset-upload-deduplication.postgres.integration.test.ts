import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect, vi } from 'vitest'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { storeAsset, storeAssetFromFile, discardUnreferencedAsset, canReadPrivateAsset, signKnownAsset, getLocalAssetPath } from '../../services/assetStorage'
import { cleanupPendingAssetUploads } from '../../services/assetUploadDeduplication'
import { assetStorageKey } from '../../services/assetStorageKey'
import { cos } from '../../utils/cos'
const dbUrl=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=dbUrl?describe:describe.skip
suite('new upload sharing and durable cleanup',()=>{
 const prefix='upload-dedup-'+crypto.randomUUID(),bodies=new Map<string,{bytes:Buffer,type:string,sha?:string}>()
 let payload:Buffer,deleted:string[],headFailure:number,deleteFailures:number,temp:string,uploadBarrier:boolean,uploadCallbacks:Array<()=>void>,mutateOnPut:(()=>void)|null
 const input=(owner='a',mimeType='application/pdf')=>({buffer:payload,provider:'cos' as const,mimeType,ownerId:prefix+'-'+owner,scopeId:'scope-'+owner,accessScope:'PRIVATE',originalName:owner+'.pdf'})
 beforeAll(()=>{requireIsolatedReleaseDatabase(dbUrl!);temp=fs.mkdtempSync(path.join(os.tmpdir(),'asset-dedup-'))})
 beforeEach(()=>{
  payload=Buffer.from('immutable upload '+crypto.randomUUID());deleted=[];headFailure=0;deleteFailures=0;uploadBarrier=false;uploadCallbacks=[];mutateOnPut=null;bodies.clear()
  vi.spyOn(cos,'putObject').mockImplementation(((params:any,cb:any)=>{
   const mutation=mutateOnPut;mutateOnPut=null;mutation?.()
   void(async()=>{const chunks:Buffer[]=[];if(Buffer.isBuffer(params.Body))chunks.push(Buffer.from(params.Body));else for await(const chunk of params.Body)chunks.push(Buffer.from(chunk));bodies.set(params.Key,{bytes:Buffer.concat(chunks),type:params.ContentType||'application/pdf',sha:params['x-cos-meta-sha256']});if(uploadBarrier){uploadCallbacks.push(()=>cb(null,{}));if(uploadCallbacks.length===2)uploadCallbacks.splice(0).forEach(done=>done())}else cb(null,{})})().catch(cb);return {} as any
  })as any)
  vi.spyOn(cos,'headObject').mockImplementation(((params:any,cb:any)=>{
   const item=bodies.get(params.Key);if(headFailure)return cb({statusCode:headFailure},null)
   if(!item)return cb({statusCode:404},null)
   cb(null,{headers:{'content-length':String(item.bytes.length),'content-type':item.type,...(item.sha?{'x-cos-meta-sha256':item.sha}:{})}});return {} as any
  })as any)
  vi.spyOn(cos,'deleteObject').mockImplementation(((params:any,cb:any)=>{
   if(deleteFailures-->0)return cb({statusCode:503},null)
   bodies.delete(params.Key);deleted.push(params.Key);cb(null,{});return {} as any
  })as any)
 })
 afterEach(async()=>{
  vi.restoreAllMocks()
  const rows=await prisma.storedAsset.findMany({where:{ownerId:{startsWith:prefix}},select:{id:true}})
  await prisma.assetReference.deleteMany({where:{assetId:{in:rows.map(a=>a.id)}}})
  await prisma.storedAsset.deleteMany({where:{id:{in:rows.map(a=>a.id)}}})
 })
 afterAll(async()=>{fs.rmSync(temp,{recursive:true,force:true});await prisma.$disconnect()})
 it('retains independent IDs, ownership, scope, initial references and application links while storing one body',async()=>{
  const a=await storeAsset({...input('owner'),initialReference:{entityType:'Assignment',entityId:prefix,field:'document'}}),b=await storeAsset(input('other'))
  expect(a.id).not.toBe(b.id);expect(a.objectKey).not.toBe(b.objectKey);expect(assetStorageKey(a)).toBe(assetStorageKey(b));expect(bodies.size).toBe(1);expect(cos.putObject).toHaveBeenCalledTimes(1)
  expect(await canReadPrivateAsset(b,{userId:b.ownerId!})).toBe(true);expect(await canReadPrivateAsset(b,{userId:a.ownerId!})).toBe(false)
  expect(b.ownerId).toBe(input('other').ownerId);expect(b.scopeId).toBe('scope-other');expect(signKnownAsset(b)).toContain('/api/assets/'+b.id+'/content?')
  expect(await prisma.assetReference.count({where:{assetId:a.id}})).toBe(1);expect(await prisma.storedAsset.count({where:{duplicateCleanupPending:true,ownerId:{startsWith:prefix}}})).toBe(0)
 })
 it('hashes exactly one streamed file pass and shares it with a prior buffer upload',async()=>{
  const a=await storeAsset(input());const file=path.join(temp,'output.pdf');fs.writeFileSync(file,payload);const reads=vi.spyOn(fs,'createReadStream')
  const b=await storeAssetFromFile({filePath:file,provider:'cos',mimeType:'application/pdf',ownerId:prefix+'-file',originalName:'output.pdf'})
  expect(reads).toHaveBeenCalledTimes(1);reads.mockRestore();expect(b.sha256).toBe(crypto.createHash('sha256').update(payload).digest('hex'));expect(assetStorageKey(a)).toBe(assetStorageKey(b));expect(bodies.size).toBe(1)
 })
 it('reuses retained deleted bytes without reviving the old logical asset or its permissions',async()=>{
  const a=await storeAsset(input('retired'));await prisma.storedAsset.update({where:{id:a.id},data:{deletedAt:new Date()}})
  const b=await storeAsset(input('new-owner'));const retired=await prisma.storedAsset.findUniqueOrThrow({where:{id:a.id}})
  expect(retired.deletedAt).not.toBeNull();expect(signKnownAsset(retired)).toBeNull();expect(b.id).not.toBe(a.id);expect(assetStorageKey(b)).toBe(a.objectKey)
  expect(b.ownerId).toBe(input('new-owner').ownerId);expect(bodies.size).toBe(1);expect(cos.putObject).toHaveBeenCalledTimes(1)
 })
 it('validates first-upload file bytes against the preflight digest without buffering the file',async()=>{
  const file=path.join(temp,'first-file.pdf');fs.writeFileSync(file,payload)
  const a=await storeAssetFromFile({filePath:file,provider:'cos',mimeType:'application/pdf',ownerId:prefix+'-new-file'})
  expect(a.sha256).toBe(crypto.createHash('sha256').update(payload).digest('hex'));expect(bodies.get(assetStorageKey(a))!.bytes).toEqual(payload);expect(bodies.size).toBe(1)
 })
 it('rejects mutation between file digest and streaming and removes only the new failed upload',async()=>{
  const file=path.join(temp,'mutation.pdf');fs.writeFileSync(file,payload);mutateOnPut=()=>fs.writeFileSync(file,Buffer.alloc(payload.length,88))
  await expect(storeAssetFromFile({filePath:file,provider:'cos',mimeType:'application/pdf',ownerId:prefix+'-mutated'})).rejects.toThrow('changed during upload')
  expect(bodies.size).toBe(0);expect(await prisma.storedAsset.count({where:{ownerId:prefix+'-mutated'}})).toBe(0)
 })
 it('keeps local video staging paths independent and readable for the existing retry pipeline',async()=>{
  const file=path.join(temp,'local-source.mp4');fs.writeFileSync(file,payload)
  const a=await storeAssetFromFile({filePath:file,provider:'local',mimeType:'video/mp4',ownerId:prefix+'-local-a'})
  const b=await storeAssetFromFile({filePath:file,provider:'local',mimeType:'video/mp4',ownerId:prefix+'-local-b'})
  expect(a.storageObjectKey).toBeNull();expect(b.storageObjectKey).toBeNull();expect(a.objectKey).not.toBe(b.objectKey)
  expect(fs.readFileSync(getLocalAssetPath(a.objectKey))).toEqual(payload);expect(fs.readFileSync(getLocalAssetPath(b.objectKey))).toEqual(payload)
  expect(cos.putObject).not.toHaveBeenCalled();await discardUnreferencedAsset(a);await discardUnreferencedAsset(b)
 })
 it('serializes same-content registration across independent callers without conflating identities',async()=>{
  const rows=await Promise.all(Array.from({length:6},(_,i)=>storeAsset(input('parallel-'+i))))
  expect(new Set(rows.map(a=>a.id)).size).toBe(6);expect(new Set(rows.map(assetStorageKey)).size).toBe(1);expect(bodies.size).toBe(1)
 })
 it('never shares differing bytes or media types',async()=>{
  const a=await storeAsset(input());const b=await storeAsset(input('video','video/mp4'));payload=Buffer.from('different payload');const c=await storeAsset(input('different'))
  expect(new Set([a,b,c].map(assetStorageKey)).size).toBe(3);expect(bodies.size).toBe(3)
 })
 it('keeps a committed raced upload and durable retry marker after transient duplicate deletion failure',async()=>{
  uploadBarrier=true;deleteFailures=1;const rows=await Promise.all([storeAsset(input('first-race')),storeAsset(input('pending-race'))]);const pending=rows.find(a=>a.duplicateCleanupPending)!
  expect(pending).toBeDefined();expect(bodies.size).toBe(2)
  expect((await prisma.storedAsset.findUniqueOrThrow({where:{id:pending.id}})).duplicateCleanupPending).toBe(true)
  expect(await cleanupPendingAssetUploads()).toMatchObject({selected:1,cleaned:1,pending:0});expect(bodies.size).toBe(1)
  expect((await prisma.storedAsset.findUniqueOrThrow({where:{id:pending.id}})).duplicateCleanupPending).toBe(false)
 })
 it('refuses uncertain reuse, but recovers a missing old body by accepting the new verified upload',async()=>{
  const a=await storeAsset(input());headFailure=503;await expect(storeAsset(input('unconfirmed'))).rejects.toThrow('validation unavailable');expect(bodies.size).toBe(1)
  headFailure=0;bodies.delete(a.objectKey);const b=await storeAsset(input('recovered'));expect(b.storageObjectKey).toBeNull();expect(bodies.has(b.objectKey)).toBe(true)
 })
 it('database failure compensates only the owned new object and preserves other owner bytes',async()=>{
  const a=await storeAsset(input());payload=Buffer.from('new file '+crypto.randomUUID());const real=prisma.$transaction.bind(prisma);vi.spyOn(prisma,'$transaction').mockImplementationOnce(real as any).mockRejectedValueOnce(new Error('synthetic register failure'))
  await expect(storeAsset(input('failed'))).rejects.toThrow('synthetic register failure');expect(bodies.size).toBe(1);expect(bodies.has(assetStorageKey(a))).toBe(true);expect(deleted).not.toContain(assetStorageKey(a))
 })
 it('protects remaining shared readers during compensation and releases the actual physical key for the final logical owner',async()=>{
  const a=await storeAsset(input()),b=await storeAsset(input('last'));const key=assetStorageKey(a)
  expect(await discardUnreferencedAsset(a)).toBe(true);expect(bodies.has(key)).toBe(true)
  await prisma.assetReference.create({data:{assetId:b.id,entityType:'AssessmentFrozenRuntime',entityId:prefix,field:'evidence'}})
  expect(await discardUnreferencedAsset(b)).toBe(false);expect(bodies.has(key)).toBe(true)
  await prisma.assetReference.deleteMany({where:{assetId:b.id}});expect(await discardUnreferencedAsset(b)).toBe(true);expect(bodies.has(key)).toBe(false)
 })
 it('concurrent new registration and original compensation cannot accept a missing shared body',async()=>{
  const a=await storeAsset(input());const outcome=await Promise.allSettled([storeAsset(input('racing')),discardUnreferencedAsset(a)])
  if(outcome[0].status==='fulfilled')expect(bodies.has(assetStorageKey(outcome[0].value))).toBe(true)
 })
})
