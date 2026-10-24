import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const {db,entry,generate,hash}=vi.hoisted(()=>({db:{$transaction:vi.fn(),$queryRaw:vi.fn(),user:{update:vi.fn()},adminAuthorizationAudit:{create:vi.fn()}},entry:vi.fn(),generate:vi.fn(()=> 'SyntheticTemp123'),hash:vi.fn(async()=> 'synthetic-hash')}))
vi.mock('../../config/database',()=>({prisma:db}))
vi.mock('../../modules/admin-permissions/service',async()=>({...await vi.importActual<any>('../../modules/admin-permissions/service'),assertEntryAdmin:entry}))
vi.mock('../../utils/password',()=>({generateTempPassword:generate,hashPassword:hash}))
import { AdminPermissionError } from '../../modules/admin-permissions/service'
import {extendTrainingExpiry,manageTrainingTeacher,type TrainingTeacherCommand} from '../../services/trainingTeacherManagement'
import {trainingTeacherManagement} from '../../controllers/trainingTeacherManagementController'
const actor={id:'actor',username:'admin',role:'STUDENT',platformRole:'STANDARD',accountDomain:'TRAINING',isActive:true,isFrozen:false,expiresAt:null,tokenVersion:4,updatedAt:new Date('2026-10-24T00:00:00Z')}
const teacher={...actor,id:'teacher',username:'trainer',role:'TEACHER',tokenVersion:2,expiresAt:new Date('2020-01-01T00:00:00Z')}
let rows:any[],protectedTarget:boolean
const command=(action:TrainingTeacherCommand['action']='EXTEND'):TrainingTeacherCommand=>({actorUserId:'actor',targetUserId:'teacher',actorSession:{tokenVersion:4,adminSessionId:'verified',adminVerifiedAt:Date.now()/1000},expectedUpdatedAt:teacher.updatedAt.toISOString(),action,months:3})
const response=()=>{const res:any={statusCode:200};res.setHeader=vi.fn();res.status=(status:number)=>{res.statusCode=status;return res};res.json=(body:any)=>{res.body=body;return res};return res}
beforeEach(()=>{
 vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T03:00:00Z'));rows=[{...actor},{...teacher}];protectedTarget=false;entry.mockResolvedValue(undefined)
 db.$transaction.mockImplementation(async callback=>callback(db))
 db.$queryRaw.mockImplementation(async (strings:TemplateStringsArray)=>strings.join('').includes(' AS "protected"')?[{protected:protectedTarget}]:rows)
 db.user.update.mockImplementation(async ({data})=>({id:'teacher',username:'trainer',...data}));db.adminAuthorizationAudit.create.mockResolvedValue({id:'audit'})
})
afterEach(()=>vi.useRealTimers())
describe('Training teacher management account boundaries',()=>{
 it('renews an expired account from now, not its old expiry',async()=>{
  await manageTrainingTeacher(command());expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({data:{expiresAt:new Date('2027-01-24T03:00:00Z')}}))
 })
 it('extends a future expiry and clamps month-end dates',()=>{
  expect(extendTrainingExpiry(new Date('2027-01-31T03:00:00Z'),1)).toEqual(new Date('2027-02-28T03:00:00Z'))
  expect(extendTrainingExpiry(new Date('2028-01-31T03:00:00Z'),1)).toEqual(new Date('2028-02-29T03:00:00Z'))
 })
 it.each([0,-1,1.5,121,NaN])('rejects invalid extension %s',async months=>{
  await expect(manageTrainingTeacher({...command(),months})).rejects.toMatchObject({statusCode:400});expect(db.user.update).not.toHaveBeenCalled()
 })
 it('rejects a revoked Training grant before any mutation',async()=>{
  entry.mockRejectedValue(new AdminPermissionError(403,'缺少当前入口管理授权'))
  await expect(manageTrainingTeacher(command())).rejects.toMatchObject({statusCode:403});expect(db.user.update).not.toHaveBeenCalled()
 })
 it('rejects stale administrator session versions and old MFA proofs',async()=>{
  await expect(manageTrainingTeacher({...command(),actorSession:{...command().actorSession,tokenVersion:3}})).rejects.toMatchObject({statusCode:403})
  await expect(manageTrainingTeacher({...command(),actorSession:{...command().actorSession,adminVerifiedAt:Date.now()/1000-301}})).rejects.toMatchObject({statusCode:403})
  expect(db.user.update).not.toHaveBeenCalled()
 })
 it.each([{role:'STUDENT'},{role:'ADMIN'},{accountDomain:'SCHOOL'},{accountDomain:'SURVEY'},{platformRole:'SYSTEM_ADMIN'},{isActive:false}])('protects ineligible target %j',async changes=>{
  rows[1]={...teacher,...changes};await expect(manageTrainingTeacher(command('FREEZE'))).rejects.toBeInstanceOf(AdminPermissionError);expect(db.user.update).not.toHaveBeenCalled()
 })
 it('protects entry and organization administrators regardless of base teacher role',async()=>{
  protectedTarget=true;await expect(manageTrainingTeacher(command('RESET_PASSWORD'))).rejects.toMatchObject({statusCode:403});expect(db.user.update).not.toHaveBeenCalled()
 })
 it('rejects stale target versions so retries cannot extend twice',async()=>{
  await expect(manageTrainingTeacher({...command(),expectedUpdatedAt:'2020-01-01T00:00:00Z'})).rejects.toMatchObject({statusCode:409});expect(db.user.update).not.toHaveBeenCalled()
 })
 it('freezes and invalidates old sessions without changing expiry or course data',async()=>{
  await manageTrainingTeacher(command('FREEZE'));expect(db.user.update.mock.calls[0][0].data).toEqual({isFrozen:true,tokenVersion:{increment:1}})
  expect(db.adminAuthorizationAudit.create.mock.calls[0][0].data.action).toBe('TRAINING_TEACHER_FREEZE')
 })
 it('unfreezes without automatically renewing or approving the account',async()=>{
  rows[1].isFrozen=true;await manageTrainingTeacher(command('UNFREEZE'));expect(db.user.update.mock.calls[0][0].data).toEqual({isFrozen:false,tokenVersion:{increment:1}})
 })
 it('resets password, requires a change, invalidates sessions and never audits the secret',async()=>{
  await manageTrainingTeacher({...command('RESET_PASSWORD'),passwordHash:'synthetic-hash'});expect(db.user.update.mock.calls[0][0].data).toEqual({passwordHash:'synthetic-hash',mustChangePassword:true,tokenVersion:{increment:1}})
  expect(JSON.stringify(db.adminAuthorizationAudit.create.mock.calls)).not.toContain('synthetic-hash')
 })
 it('keeps a permanent account permanent',async()=>{
  rows[1].expiresAt=null;await expect(manageTrainingTeacher(command())).rejects.toMatchObject({statusCode:409});expect(db.user.update).not.toHaveBeenCalled()
 })
})
describe('Training teacher management controller',()=>{
 const request=(body:unknown)=>({params:{id:'teacher'},body,user:{userId:'actor',...command().actorSession}} as any)
 it.each([{action:'EXTEND',months:-1},{action:'FREEZE',passwordHash:'attacker'},{action:'RESET_PASSWORD',temporaryPassword:'attacker'}])('rejects invalid or client-supplied credentials %j',async body=>{
  const res=response();await trainingTeacherManagement(request({...body,expectedUpdatedAt:teacher.updatedAt.toISOString()}),res);expect(res.statusCode).toBe(400);expect(db.user.update).not.toHaveBeenCalled()
 })
 it('delivers a random temporary password once with no-store headers',async()=>{
  const res=response();await trainingTeacherManagement(request({action:'RESET_PASSWORD',expectedUpdatedAt:teacher.updatedAt.toISOString()}),res)
  expect(res.statusCode).toBe(200);expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','private, no-store, max-age=0');expect(res.body.data.temporaryPassword).toBe('SyntheticTemp123');expect(hash).toHaveBeenCalledWith('SyntheticTemp123')
 })
 it('rejects unauthorized reset before password generation or hashing',async()=>{
  entry.mockRejectedValue(new AdminPermissionError(403,'缺少当前入口管理授权'));const res=response();await trainingTeacherManagement(request({action:'RESET_PASSWORD',expectedUpdatedAt:teacher.updatedAt.toISOString()}),res)
  expect(res.statusCode).toBe(403);expect(generate).not.toHaveBeenCalled();expect(hash).not.toHaveBeenCalled()
 })
})
