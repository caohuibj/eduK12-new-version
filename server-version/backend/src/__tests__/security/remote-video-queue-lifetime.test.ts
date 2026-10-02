import { beforeEach,describe,expect,it,vi } from 'vitest'
const mocks=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),find:vi.fn(),add:vi.fn(),get:vi.fn(),capacity:vi.fn(),budget:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{video:{create:mocks.create,updateMany:mocks.update,findUnique:mocks.find},$transaction:async(fn:any)=>fn({video:{create:mocks.create}})}}))
vi.mock('../../config/queue',()=>({videoQueue:{add:mocks.add,getJob:mocks.get}}))
vi.mock('../../utils/videoDownloader',()=>({validateRemoteUrl:async(url:string)=>new URL(url)}))
vi.mock('../../services/remoteVideoAdmission',async(importOriginal)=>({...await importOriginal<any>(),assertRemoteVideoCapacity:mocks.capacity,reserveRemoteVideoBudget:mocks.budget}))
import { videoController } from '../../controllers/videoController'
import { RemoteVideoAdmissionError } from '../../services/remoteVideoAdmission'
const req:any={user:{userId:'synthetic-owner',role:'TEACHER'},body:{title:'Synthetic video',videoUrl:'https://example.com/synthetic.mp4'}}
const response=()=>{const res:any={statusCode:200,status:vi.fn(function(this:any,code:number){this.statusCode=code;return this}),json:vi.fn(),setHeader:vi.fn()};return res}
describe('URL video queue reservation lifetime',()=>{
 beforeEach(()=>{vi.resetAllMocks();mocks.create.mockResolvedValue({id:'synthetic-video',title:'Synthetic video',processingGeneration:0});mocks.update.mockResolvedValue({count:1});mocks.find.mockResolvedValue({status:'PROCESSING'})})
 it.each(['capacity','budget'])('rejects %s failure before creating or queuing a video',async kind=>{
  mocks[kind].mockRejectedValue(new RemoteVideoAdmissionError('busy',503,30))
  const res=response();await videoController.uploadFromUrl(req,res)
  expect(res.statusCode).toBe(503);expect(mocks.create).not.toHaveBeenCalled();expect(mocks.add).not.toHaveBeenCalled()
 })
 it.each(['ack-lost','accepted'])('retains a live reservation after %s',async condition=>{
  mocks.add.mockRejectedValue(new Error('synthetic acknowledgment loss'))
  if(condition==='accepted')mocks.get.mockResolvedValue({id:'accepted'})
  else mocks.get.mockRejectedValue(new Error('synthetic Redis outage'))
  const res=response();await videoController.uploadFromUrl(req,res)
  expect(mocks.update).not.toHaveBeenCalled()
  const reserved=mocks.create.mock.calls[0][0].data.processingJobId
  expect(reserved).toMatch(/^video-url-/)
  expect(mocks.add.mock.calls[0][2].jobId).toBe(reserved)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({code:0,data:expect.objectContaining({id:'synthetic-video',status:'PROCESSING'})}))
 })
 it('only releases a proven absent queue job through an unclaimed generation CAS',async()=>{
  mocks.add.mockRejectedValue(new Error('synthetic offline'));mocks.get.mockResolvedValue(null);mocks.find.mockResolvedValue({status:'FAILED'})
  await videoController.uploadFromUrl(req,response())
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:'synthetic-video',status:'PENDING',processingJobId:mocks.create.mock.calls[0][0].data.processingJobId,processingGeneration:0}}))
 })
 it('normal URL creation reserves the same identity before successful enqueue',async()=>{
  mocks.add.mockResolvedValue({id:'accepted'})
  const res=response();await videoController.uploadFromUrl(req,res)
  expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.add.mock.invocationCallOrder[0])
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({code:0,data:expect.objectContaining({status:'PENDING'})}))
 })
})
