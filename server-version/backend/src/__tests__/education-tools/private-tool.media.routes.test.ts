import express from 'express'
import type {Server} from 'node:http'
import {promises as fs} from 'node:fs'
import sharp from 'sharp'
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'

const m=vi.hoisted(()=>({admission:vi.fn(),upload:vi.fn(),list:vi.fn(),read:vi.fn(),serve:vi.fn(),
 tempRoot:`/tmp/education-private-media-route-${process.pid}-${Date.now()}`}))
// Only infrastructure/business effects are mocked. Multipart parsing, magic,
// full bounded image decode, static-image policy and both product routers are real.
vi.mock('../../config',()=>({config:{uploadDir:m.tempRoot}}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:vi.fn()}}))
vi.mock('../../services/cacheService',()=>({cacheService:{}}))
vi.mock('../../middleware/redisRateLimit',()=>({createRedisRateLimiter:()=> (_req:unknown,_res:unknown,next:()=>void)=>next()}))
vi.mock('../../utils/uploadTemp',async importOriginal=>({
 ...await importOriginal<typeof import('../../utils/uploadTemp')>(),
 // The test staging directory is tiny and private; do not require the production
 // 6 GiB reserve on the isolated test volume. Actual multer staging/cleanup stay real.
 assertUploadStagingCapacity:async()=>undefined,
}))
vi.mock('../../modules/education-tools/private-tool.service',()=>({}))
vi.mock('../../modules/education-tools/private-tool.media',()=>({
 assertPrivateToolMediaAdmission:m.admission,uploadPrivateToolImage:m.upload,
 listPrivateToolImages:m.list,readPrivateToolImage:m.read,
}))
vi.mock('../../modules/assessment-media/assessment-image-delivery',()=>({serveAssessmentImageContent:m.serve}))
vi.mock('../../middleware/auth', () => ({
  authenticateSchool: (req: any, res: any, next: any) => {
    if (req.headers['x-session-entry'] !== 'SCHOOL') return res.status(401).json({ data: null })
    req.user = { userId: 'actor', accountDomain: 'SCHOOL' }; next()
  },
  authenticateHuiteacher: (req: any, res: any, next: any) => {
    if (req.headers['x-session-entry'] !== 'TEACHER') return res.status(401).json({ data: null })
    req.user = { userId: 'actor', accountDomain: 'SCHOOL' }; next()
  },
}))
vi.mock('../../modules/organization/organization.controller', () => ({ organizationController: {
  listAccessible: vi.fn(), readContext: vi.fn(), grantCapability: vi.fn(), revokeCapability: vi.fn(),
} }))
vi.mock('../../modules/organization/organization.admin.controller', () => ({ organizationAdminController: {
  listUnits: vi.fn(), createUnit: vi.fn(), deleteUnit: vi.fn(), listStaffClassAssignments: vi.fn(),
  assignStaff: vi.fn(), endStaffAssignment: vi.fn(), listStudentClassAssignments: vi.fn(),
  assignStudent: vi.fn(), endStudentAssignment: vi.fn(),
} }))
vi.mock('../../modules/organization/access', () => ({ requireOrganizationGovernance: vi.fn() }))
vi.mock('../../modules/campus/mfa.middleware', () => ({ requireRecentSchoolMfa: vi.fn() }))
vi.mock('../../modules/campus/capabilityGuard', () => ({ guardCampusCapabilityGrant: vi.fn() }))
vi.mock('../../modules/campus/classRead.middleware', () => ({ requireCampusClassRead: vi.fn() }))
vi.mock('../../modules/campus/admission.service', () => ({ CampusAdmissionError: class extends Error {} }))
vi.mock('../../modules/campus/relationships.service', () => ({
  readCampusRelationshipDirectory: vi.fn(), appointCampusCounselorClient: vi.fn(),
  endCampusCounselorClient: vi.fn(), assignCampusStaffClass: vi.fn(), endCampusStaffClass: vi.fn(),
}))
vi.mock('../../modules/huiteacher/authority', () => ({
  requireTeacherProductAdmin: vi.fn(), requireRecentTeacherMfa: vi.fn(), requireTeacherProductMember: vi.fn(),
}))

import schoolRoutes from '../../modules/campus/organization.routes'
import teacherRoutes from '../../modules/huiteacher/organization.routes'
import {uploadAdmission} from '../../middleware/uploadAdmission'
import {EducationPrivateToolError} from '../../modules/education-tools/private-tool.contracts'

const org='00000000-0000-4000-8000-000000000001',tool='00000000-0000-4000-8000-000000000002',asset='00000000-0000-4000-8000-000000000003'
const identity={assetId:asset,contentHash:'a'.repeat(64),mimeType:'image/png'}
let server:Server,origin:string,png:Buffer
const path=(prefix='campus',organizationId=org,toolId=tool)=>`/${prefix}/organizations/${organizationId}/private-tools/${toolId}/assets`
async function send(bytes:Buffer,declared='image/png',url=path()+'/images',entry='SCHOOL'){
 const form=new FormData()
 form.append('image',new Blob([new Uint8Array(bytes)],{type:declared}),'synthetic.png')
 return fetch(origin+url,{method:'POST',headers:entry?{'x-session-entry':entry}:{},body:form})
}
describe('Education private images / real multipart boundary, mocked persistence',()=>{
 beforeAll(async()=>{
  const app=express()
  app.use('/campus',schoolRoutes);app.use('/huiteacher',teacherRoutes)
  app.use((_error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(500).json({code:'INTERNAL_ERROR'})})
  server=app.listen(0,'127.0.0.1')
  await new Promise<void>(resolve=>server.once('listening',resolve))
  const address=server.address()
  if(!address||typeof address==='string')throw new Error('missing test port')
  origin='http://127.0.0.1:'+address.port
  png=await sharp({create:{width:2,height:2,channels:3,background:'red'}}).png().toBuffer()
 })
 beforeEach(()=>{
  vi.clearAllMocks()
  m.admission.mockResolvedValue(undefined)
  m.upload.mockResolvedValue(identity)
  m.list.mockResolvedValue({assets:[identity]})
  m.read.mockResolvedValue(identity)
  m.serve.mockImplementation(async({res}:{res:express.Response})=>res.type('image/png').send('synthetic proxy body'))
 })
 afterEach(async()=>{await expect.poll(()=>uploadAdmission.getStats().active).toBe(0)})
 afterAll(async()=>{
  server?.closeAllConnections()
  if(server)await new Promise<void>(resolve=>server.close(()=>resolve()))
  // Only this suite's generated staging fixture directory, never business media.
  await fs.rm(m.tempRoot,{recursive:true,force:true})
 })
 it('accepts genuine PNG/JPEG/WebP and passes detected rather than declared MIME',async()=>{
  for(const format of ['png','jpeg','webp'] as const){
   const bytes=await sharp({create:{width:2,height:2,channels:3,background:'red'}}).toFormat(format).toBuffer()
   const response=await send(bytes,'application/octet-stream')
   expect(response.status).toBe(200)
   expect(m.upload.mock.lastCall?.[0]).toEqual({principal:{userId:'actor',accountDomain:'SCHOOL'},entry:'SCHOOL',organizationId:org})
   expect(m.upload.mock.lastCall?.[1]).toBe(tool)
   expect(m.upload.mock.lastCall?.[2].detectedMimeType).toBe('image/'+format)
  }
  expect(m.upload).toHaveBeenCalledTimes(3)
 })
 it('rejects fake MIME and truncated image payloads before persistence',async()=>{
  for(const bytes of [Buffer.from('not an image'),png.subarray(0,Math.floor(png.length/2))])expect((await send(bytes)).status).toBe(400)
  expect(m.upload).not.toHaveBeenCalled()
 })
 it('rejects multipart payload over 2 MiB before persistence',async()=>{
  expect((await send(Buffer.alloc(2*1024*1024+1))).status).toBe(400)
  expect(m.upload).not.toHaveBeenCalled()
 })
 it('rejects a genuinely animated WebP, not merely a MIME label',async()=>{
  const bytes=await sharp(Buffer.from([255,0,0,255,0,0,255,255]),{raw:{width:1,height:2,channels:4,pageHeight:1}}).webp({lossless:true,delay:[100,100],loop:0}).toBuffer()
  expect((await sharp(bytes,{animated:true}).metadata()).pages).toBe(2)
  const response=await send(bytes,'image/webp')
  expect(response.status).toBe(400)
  expect((await response.json()).code).toBe('PRIVATE_TOOL_STATIC_IMAGE_REQUIRED')
  expect(m.upload).not.toHaveBeenCalled()
 })
 it('rejects missing/wrong product sessions, invalid path IDs and denied admission',async()=>{
  expect((await send(png,'image/png',path()+'/images','')).status).toBe(401)
  expect((await send(png,'image/png',path()+'/images','TEACHER')).status).toBe(401)
  expect((await send(png,'image/png',path('campus','bad-org')+'/images')).status).toBe(400)
  expect((await send(png,'image/png',path('campus',org,'bad-tool')+'/images')).status).toBe(400)
  expect(m.admission).not.toHaveBeenCalled()
  m.admission.mockRejectedValueOnce(new EducationPrivateToolError('PRIVATE_TOOL_AUTHOR_REQUIRED',403))
  expect((await send(png)).status).toBe(403)
  expect(m.upload).not.toHaveBeenCalled()
 })
 it('selects Teacher context from the real parent router, ignoring forged entry/owner query',async()=>{
  const response=await send(png,'image/png',path('huiteacher')+'/images?entry=SCHOOL&ownerUserId=other&organizationId=other','TEACHER')
  expect(response.status).toBe(200)
  expect(m.upload.mock.lastCall?.[0]).toEqual({principal:{userId:'actor',accountDomain:'SCHOOL'},entry:'TEACHER',organizationId:org})
  expect(m.upload.mock.lastCall?.[1]).toBe(tool)
 })
 it('keeps content/list private and does not proxy a denied or mismatched identity',async()=>{
  const headers={'x-session-entry':'SCHOOL'}
  const listing=await fetch(origin+path(),{headers})
  expect(listing.status).toBe(200)
  expect(listing.headers.get('cache-control')).toContain('private, no-store')
  const url=origin+path()+'/'+asset+'/content'
  const content=await fetch(url,{headers})
  expect(content.status).toBe(200)
  expect(content.headers.get('cache-control')).toBe('private, no-store, max-age=0')
  expect(content.headers.get('referrer-policy')).toBe('no-referrer')
  expect(m.serve).toHaveBeenCalledTimes(1)
  expect(m.serve.mock.lastCall?.[0].reference).toEqual(identity)
  m.read.mockRejectedValueOnce(new EducationPrivateToolError('PRIVATE_TOOL_MEDIA_SCOPE_OR_IDENTITY_INVALID',403))
  expect((await fetch(url,{headers})).status).toBe(403)
  expect(m.serve).toHaveBeenCalledTimes(1)
 })
})
