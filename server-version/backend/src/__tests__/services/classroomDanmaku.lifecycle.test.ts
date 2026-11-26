import {beforeEach,describe,expect,it,vi} from 'vitest'
const {prisma,close}=vi.hoisted(()=>({prisma:{$transaction:vi.fn(),$executeRaw:vi.fn(),classroom:{findUnique:vi.fn(),update:vi.fn()},classroomQuestion:{updateMany:vi.fn()}},close:vi.fn()}))
vi.mock('../../config/database',()=>({prisma}))
vi.mock('../../services/classroomDanmaku',()=>({classroomDanmaku:{close}}))
import {closeClassroom} from '../../services/classroomLifecycleService'
let inTransaction=false
beforeEach(()=>{
 vi.clearAllMocks();inTransaction=false
 prisma.$transaction.mockImplementation(async callback=>{inTransaction=true;try{return await callback(prisma)}finally{inTransaction=false}})
 prisma.classroom.findUnique.mockResolvedValue({status:'ACTIVE'});prisma.classroom.update.mockResolvedValue({});prisma.classroomQuestion.updateMany.mockResolvedValue({count:1});prisma.$executeRaw.mockResolvedValue(1)
 close.mockImplementation(async()=>{expect(inTransaction).toBe(false)})
})
describe('classroom close with optional danmaku cache',()=>{
 it('closes the authoritative classroom before retiring Redis state outside the DB transaction',async()=>{
  await expect(closeClassroom('synthetic-classroom')).resolves.toEqual({changed:true,classroomId:'synthetic-classroom'})
  expect(prisma.classroom.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'ENDED'})}))
  expect(close).toHaveBeenCalledWith('synthetic-classroom')
 })
 it('never fails or rolls back classroom close when optional Redis is unavailable',async()=>{
  close.mockRejectedValue(new Error('Redis offline'))
  await expect(closeClassroom('synthetic-classroom')).resolves.toMatchObject({changed:true})
 })
 it('also retires stale feature state on an idempotent repeated close',async()=>{
  prisma.classroom.findUnique.mockResolvedValue({status:'ENDED'})
  await expect(closeClassroom('synthetic-classroom')).resolves.toMatchObject({changed:false})
  expect(close).toHaveBeenCalledOnce();expect(prisma.classroom.update).not.toHaveBeenCalled()
 })
})
