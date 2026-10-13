import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  getJob: vi.fn(),
  markVideoFailed: vi.fn(),
  associateVideoRetryJob: vi.fn(),
  update: vi.fn(), add: vi.fn(), capacity: vi.fn(), stat: vi.fn(),
}))

vi.mock('../../config/database', () => ({
  prisma: {
    video: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      updateMany: mocks.update,
    },
    $transaction: async(fn:any)=>fn({video:{updateMany:mocks.update}}),
  },
}))

vi.mock('../../config/queue', () => ({
  videoQueue: {
    getJob: mocks.getJob,
    add: mocks.add,
    on: vi.fn(),
  },
}))
vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<any>(), stat:mocks.stat }))
vi.mock('../../services/remoteVideoAdmission', async importOriginal => ({ ...await importOriginal<any>(), assertVideoCapacity:mocks.capacity }))

vi.mock('../../services/videoProcessingState', () => ({
  VIDEO_PROCESSING_FAILURE_MESSAGE: 'failed',
  markVideoFailed: mocks.markVideoFailed,
  associateVideoRetryJob: mocks.associateVideoRetryJob,
}))

vi.mock('../../services/assetStorage', () => ({
  getLocalAssetPath: (value: string) => value,
}))

import { reconcileStaleProcessingVideos } from '../../services/videoProcessingRecovery'
import { LOCAL_VIDEO_UPLOAD_SENTINEL, RemoteVideoAdmissionError } from '../../services/remoteVideoAdmission'

const pending = (overrides:Record<string,unknown>={}) => ({
  id:'pending-video',teacherId:'owner',filePath:'assets/original.mp4',originalUrl:null,
  originalAssetId:'original',originalAsset:{objectKey:'assets/original.mp4',sizeBytes:123,provider:'local',deletedAt:null},
  processingJobId:'upload-job',processingGeneration:4,processingStartedAt:null,updatedAt:new Date(Date.now()-60_000),...overrides,
})
const sweep = (row:unknown) => {mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([row]);return reconcileStaleProcessingVideos()}

describe('video processing recovery generation fencing', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getJob.mockResolvedValue(null)
    mocks.markVideoFailed.mockResolvedValue(true)
    mocks.update.mockResolvedValue({count:1})
    mocks.add.mockResolvedValue({id:'video-recovery-pending-video'})
    mocks.stat.mockResolvedValue({size:123,isFile:()=>true})
    mocks.findUnique
      .mockResolvedValueOnce({ status: 'PROCESSING' })
      .mockResolvedValueOnce({ status: 'FAILED' })
  })

  it('passes the persisted generation into stale PROCESSING failure recovery', async () => {
    mocks.findMany
      .mockResolvedValueOnce([{
        id: 'video-1',
        processingJobId: 'job-1',
        processingGeneration: 7,
      }])
      .mockResolvedValueOnce([])

    await expect(reconcileStaleProcessingVideos()).resolves.toBe(1)
    expect(mocks.markVideoFailed).toHaveBeenCalledWith('video-1', 'job-1', 7)
  })
  it('does not enqueue or expire a long upload whose lease is still being renewed',async()=>{
    await expect(sweep(pending({filePath:LOCAL_VIDEO_UPLOAD_SENTINEL,originalAssetId:null,originalAsset:null,
      updatedAt:new Date(Date.now()-10*60_000),processingStartedAt:new Date(Date.now()-30_000)}))).resolves.toBe(0)
    expect(mocks.getJob).not.toHaveBeenCalled();expect(mocks.capacity).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled();expect(mocks.add).not.toHaveBeenCalled()
  })
  it('reclaims a dead upload only through its exact persisted lease and generation',async()=>{
    const lease=new Date(Date.now()-6*60_000)
    await expect(sweep(pending({filePath:LOCAL_VIDEO_UPLOAD_SENTINEL,originalAssetId:null,originalAsset:null,processingStartedAt:lease}))).resolves.toBe(1)
    expect(mocks.update).toHaveBeenCalledWith({where:expect.objectContaining({filePath:LOCAL_VIDEO_UPLOAD_SENTINEL,processingStartedAt:lease,processingJobId:'upload-job',processingGeneration:4}),data:expect.objectContaining({status:'FAILED'})})
    expect(mocks.add).not.toHaveBeenCalled()
    mocks.update.mockResolvedValue({count:0})
    await expect(sweep(pending({filePath:LOCAL_VIDEO_UPLOAD_SENTINEL,originalAssetId:null,originalAsset:null,processingStartedAt:lease}))).resolves.toBe(0)
  })
  it('checks actual local size and replaces its existing reservation under the shared capacity lock',async()=>{
    await expect(sweep(pending())).resolves.toBe(1)
    expect(mocks.stat).toHaveBeenCalledWith('assets/original.mp4')
    expect(mocks.capacity).toHaveBeenCalledWith(expect.anything(),'owner',{inputBytes:123,originalRetained:true},'pending-video')
    expect(mocks.update).toHaveBeenCalledWith({where:expect.objectContaining({processingGeneration:4,processingJobId:'upload-job'}),data:{processingJobId:expect.stringMatching(/^video-recovery-pending-video-/),fileSize:123,processingStartedAt:null}})
    expect(mocks.add.mock.calls[0][2].jobId).toBe(mocks.update.mock.calls[0][0].data.processingJobId)
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.add.mock.invocationCallOrder[0])
  })
  it('does not enqueue after capacity or generation CAS rejection',async()=>{
    mocks.capacity.mockRejectedValue(new RemoteVideoAdmissionError('busy'))
    await expect(sweep(pending())).resolves.toBe(0)
    expect(mocks.update).not.toHaveBeenCalled();expect(mocks.add).not.toHaveBeenCalled()
    mocks.capacity.mockResolvedValue(undefined);mocks.update.mockResolvedValue({count:0})
    await expect(sweep(pending())).resolves.toBe(0)
    expect(mocks.add).not.toHaveBeenCalled()
  })
  it('keeps a live job and retains an unknown queue result without releasing its reservation',async()=>{
    mocks.getJob.mockResolvedValue({getState:async()=> 'active'})
    await expect(sweep(pending())).resolves.toBe(0)
    expect(mocks.capacity).not.toHaveBeenCalled()
    mocks.getJob.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('unknown'))
    mocks.add.mockRejectedValue(new Error('ack lost'))
    await expect(sweep(pending())).resolves.toBe(0)
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update.mock.calls[0][0].data.status).toBeUndefined()
  })
  it('fails an unavailable local source with an exact CAS before any admission or enqueue',async()=>{
    mocks.stat.mockRejectedValue(new Error('ENOENT'))
    await expect(sweep(pending())).resolves.toBe(1)
    expect(mocks.update).toHaveBeenCalledWith({where:expect.objectContaining({processingGeneration:4,processingJobId:'upload-job'}),data:expect.objectContaining({status:'FAILED'})})
    expect(mocks.capacity).not.toHaveBeenCalled();expect(mocks.add).not.toHaveBeenCalled()
  })
  it('gives concurrent sweeps different identities and only enqueues the exact CAS winner',async()=>{
    mocks.findMany.mockImplementation(query=>Promise.resolve(query.where.status==='PENDING'?[pending()]:[]))
    mocks.update.mockResolvedValueOnce({count:1}).mockResolvedValueOnce({count:0})
    const results=await Promise.all([reconcileStaleProcessingVideos(),reconcileStaleProcessingVideos()])
    expect(results.sort()).toEqual([0,1]);expect(mocks.add).toHaveBeenCalledTimes(1)
    expect(new Set(mocks.update.mock.calls.map(call=>call[0].data.processingJobId)).size).toBe(2)
  })
})
