import {randomUUID} from 'node:crypto'
import express from 'express'
import type {Server} from 'node:http'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationLibraryRuntimeFixture} from './educationLibraryRuntimeFixture'
import {grantEducationLibraryUseInTransaction} from '../../modules/scale-library-governance/education-distribution'
import {revokeUse} from '../../modules/scale-library-governance/distribution'
import * as authority from '../../modules/scale-library-governance/authority'
import {educationPrivateToolRouter} from '../../modules/education-tools/private-tool.routes'
import {authenticateHuiteacher} from '../../middleware/auth'
import {generateToken} from '../../utils/jwt'
import {HUITEACHER_AUTH_COOKIE_NAME} from '../../utils/authCookies'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
suite('Original Scale library U / ordinary author directory',()=>{
 let server:Server,base:string
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  const app=express();app.use(express.json());app.use('/api/huiteacher/organizations/:organizationId/private-tools',authenticateHuiteacher,educationPrivateToolRouter('TEACHER'))
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 })
 afterAll(async()=>{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}vi.restoreAllMocks();await db.$disconnect()})
 async function read(organizationId:string,userId:string,query=''){
  const user=await db.user.findUniqueOrThrow({where:{id:userId}}),token=generateToken({userId,username:user.username,role:user.role,accountDomain:'SCHOOL',sessionProduct:'HUITEACHER',tokenVersion:user.tokenVersion,mfaVerifiedAt:Math.floor(Date.now()/1000)})
  const response=await fetch(`${base}/api/huiteacher/organizations/${organizationId}/private-tools/library-sources${query}`,{headers:{cookie:`${HUITEACHER_AUTH_COOKIE_NAME}=${token}`}})
  const value=await response.json();return {status:response.status,data:value.data,value}
 }
 it('batches the real issuer basis across exact entries, deduplicates USER/ORGANIZATION U, and preserves independent fallback/revocation without runtime creation',async()=>{
  const first=await setupEducationLibraryRuntimeFixture({db,product:'TEACHER',trackCount:0,publish:false})
  const second=await setupEducationLibraryRuntimeFixture({db,product:'TEACHER',trackCount:0,publish:false})
  await db.$transaction(tx=>grantEducationLibraryUseInTransaction(tx,first.libraryAdminUserId,second.entryId,{
   requestId:randomUUID(),product:'TEACHER',organizationId:first.organizationId,scopeKind:'ORGANIZATION',userId:null}))
  const userGrant=await db.$transaction(tx=>grantEducationLibraryUseInTransaction(tx,first.libraryAdminUserId,first.entryId,{
   requestId:randomUUID(),product:'TEACHER',organizationId:first.organizationId,scopeKind:'USER',userId:first.managerUserId}))
  const before={scales:await db.scale.count(),composites:await db.compositeAssessment.count()}
  const check=vi.spyOn(authority,'assertLibraryResourcesAuthority')
  const directory=await read(first.organizationId,first.managerUserId)
  expect(directory.status,JSON.stringify(directory.value)).toBe(200)
  expect(new Set(directory.data.list.map((row:any)=>row.sourceId))).toEqual(new Set([first.entryId,second.entryId]))
  expect(check).toHaveBeenCalledOnce()
  expect(new Set(check.mock.calls[0][2])).toEqual(new Set([first.release.releaseId,second.release.releaseId]))
  for(const row of directory.data.list)expect(row).toMatchObject({kind:'SCALE',sourceProvider:'LIBRARY_SCALE',canEditOriginal:false,canDistribute:false,allowedActions:['REFERENCE_FIXED_VERSION'],runtimeStatus:'COMPOSITION_READY'})
  expect(JSON.stringify(directory.data)).not.toMatch(/Q1|本次支持体验|rawScoreFeedback|scoringDescription|issuerId|authorityGrantId|capabilities|educationBinding/)
  expect(await db.scale.count()).toBe(before.scales);expect(await db.compositeAssessment.count()).toBe(before.composites)
  expect((await read(first.organizationId,first.participantUserId)).status).toBe(403)
  expect((await read(second.organizationId,first.managerUserId)).status).toBe(403)
  expect((await read(first.organizationId,first.managerUserId,'?q='+encodeURIComponent('没有此标题'))).data.list).toEqual([])
  await revokeUse(first.libraryAdminUserId,first.grantId,{expectedVersion:1,reason:'Synthetic ORG U withdrawal'})
  expect((await read(first.organizationId,first.managerUserId)).data.list).toHaveLength(2)
  // A separately issued current U survives failure of another issuer basis.
  const independent=await db.$transaction(tx=>grantEducationLibraryUseInTransaction(tx,second.libraryAdminUserId,first.entryId,{
   requestId:randomUUID(),product:'TEACHER',organizationId:first.organizationId,scopeKind:'ORGANIZATION',userId:null}))
  await db.user.update({where:{id:first.libraryAdminUserId},data:{expiresAt:new Date(Date.now()-60000)}})
  const fallback=await read(first.organizationId,first.managerUserId)
  expect(fallback.status).toBe(200);expect(fallback.data.list.map((row:any)=>row.sourceId)).toEqual([first.entryId])
  await revokeUse(second.libraryAdminUserId,independent.grant.id,{expectedVersion:1,reason:'Synthetic independent U withdrawal'})
  expect((await read(first.organizationId,first.managerUserId)).data.list).toEqual([])
  expect(userGrant.grant.scopeKind).toBe('USER')
 },60000)
 it('keeps Training system-distribution denial and local Teacher author identity separate from content D',async()=>{
  const f=await setupEducationLibraryRuntimeFixture({db,product:'TEACHER',trackCount:0,publish:false})
  await expect(db.$transaction(tx=>authority.assertLibraryAuthority(tx,f.libraryAdminUserId,f.release.releaseId,'material.distribute','TRAINING'))).rejects.toMatchObject({statusCode:403})
  await expect(db.$transaction(tx=>authority.assertLibraryResourcesAuthority(tx,f.managerUserId,[f.release.releaseId],'material.distribute','TEACHER'))).rejects.toMatchObject({statusCode:403})
 },60000)

})
