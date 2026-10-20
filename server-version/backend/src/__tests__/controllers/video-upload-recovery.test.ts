import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'
const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), find: vi.fn(), queue: vi.fn(), getJob: vi.fn(), store: vi.fn(), attach: vi.fn(), discard: vi.fn(), stat: vi.fn(), capacity: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { video: { create: mocks.create, updateMany: mocks.update, findUnique: mocks.find }, $transaction: async (fn: (tx: unknown) => unknown) => fn({ video: { create: mocks.create, updateMany: mocks.update } }) } }))
vi.mock('../../config/queue', () => ({ videoQueue: { add: mocks.queue, getJob: mocks.getJob } }))
vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<any>(), stat: mocks.stat }))
vi.mock('../../services/remoteVideoAdmission', async importOriginal => ({ ...await importOriginal<any>(), assertVideoCapacity: mocks.capacity }))
vi.mock('../../services/assetStorage', () => ({ storeAssetFromFile: mocks.store, attachAssetReference: mocks.attach, getLocalAssetPath: (key: string) => `/safe/${key}`, getSignedAssetUrl: async () => '/signed', signKnownAsset: () => '/signed', discardUnreferencedAsset: mocks.discard }))
vi.mock('../../services/videoRetry', () => ({ retryVideo: vi.fn(), VideoRetryError: class extends Error {} }))
import { videoController } from '../../controllers/videoController'
import { LOCAL_VIDEO_UPLOAD_SENTINEL, RemoteVideoAdmissionError } from '../../services/remoteVideoAdmission'
import { createAttachmentSchema } from '../../utils/attachmentSchema'

const request = () => ({ user: { userId: 'owner', role: 'TEACHER' }, body: { title: 'Lesson' }, file: { path: '/temp', originalname: 'lesson.mp4', size: 123, detectedMimeType: 'video/mp4' } } as unknown as Request)
const response = () => ({ json: vi.fn(), status: vi.fn().mockReturnThis(), setHeader: vi.fn() } as unknown as Response)

describe('persisted video survives an enqueue failure', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.store.mockResolvedValue({ id: 'asset', objectKey: 'original.mp4', sizeBytes: 123 })
    mocks.create.mockResolvedValue({ id: 'saved-video', title: 'Lesson', processingGeneration: 0 })
    mocks.update.mockResolvedValue({ count: 1 })
    mocks.find.mockResolvedValue({ status: 'FAILED' })
    mocks.queue.mockRejectedValue(new Error('redis offline'))
    mocks.getJob.mockResolvedValue(null)
    mocks.discard.mockResolvedValue(true)
    mocks.stat.mockResolvedValue({ size: 123, isFile: () => true })
  })
  afterEach(() => { vi.useRealTimers() })
  it.each(['queued', 'enqueue failed'])('returns a usable checkin attachment after upload: %s', async outcome => {
    if (outcome === 'queued') mocks.queue.mockResolvedValue({ id: 'job' })
    const res = response()
    await videoController.upload(request(), res)
    const body = vi.mocked(res.json).mock.calls[0][0]
    expect(body.code).toBe(0)
    expect(body.data).toEqual(expect.objectContaining({ originalAssetId: 'asset', originalUrl: '/signed' }))
    // Match MediaSelector's upload mapping and the strict checkin input schema.
    // A signed relative URL alone is not a durable attachment identity.
    expect(createAttachmentSchema(false).safeParse({
      type: 'library', id: body.data.id, title: body.data.title,
      assetId: body.data.processedAssetId || body.data.originalAssetId,
      url: body.data.url || body.data.originalUrl || '',
    }).success).toBe(true)
    expect(mocks.discard).not.toHaveBeenCalled()
  })
  it('returns the retained video ID so the browser retries transcode instead of creating a duplicate', async () => {
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response
    const req = { user: { userId: 'owner', role: 'TEACHER' }, body: { title: 'Lesson' }, file: { path: '/temp', originalname: 'lesson.mp4', size: 123, detectedMimeType: 'video/mp4' } } as unknown as Request
    await videoController.upload(req, res)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0, data: { id: 'saved-video', title: 'Lesson', status: 'FAILED', originalAssetId: 'asset', originalUrl: '/signed' } }))
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'saved-video', status: 'PENDING', processingJobId: expect.stringMatching(/^video-upload-/), processingGeneration: 0 } }))
    expect(mocks.discard).not.toHaveBeenCalled()
  })
  it('does not report a failed upload when a worker already owns or completed the saved video', async () => {
    mocks.update.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    mocks.find.mockResolvedValue({ status: 'COMPLETED' })
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response
    await videoController.upload({ user: { userId: 'owner', role: 'TEACHER' }, body: { title: 'Lesson' }, file: { path: '/temp', originalname: 'lesson.mp4', size: 123, detectedMimeType: 'video/mp4' } } as unknown as Request, res)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0, data: { id: 'saved-video', title: 'Lesson', status: 'COMPLETED', originalAssetId: 'asset', originalUrl: '/signed' } }))
  })
  it('reserves durable actual-size capacity before copying, linking and enqueueing the original', async () => {
    mocks.queue.mockResolvedValue({ id: 'job' })
    await videoController.upload(request(), response())
    expect(mocks.capacity).toHaveBeenCalledWith(expect.anything(), 'owner', { inputBytes: 123 })
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ filePath: LOCAL_VIDEO_UPLOAD_SENTINEL, fileSize: 123, status: 'PENDING', processingStartedAt: expect.any(Date) }) })
    expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.store.mock.invocationCallOrder[0])
    expect(mocks.store.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0])
    expect(mocks.attach.mock.invocationCallOrder[0]).toBeLessThan(mocks.queue.mock.invocationCallOrder[0])
    const jobId=mocks.create.mock.calls[0][0].data.processingJobId
    expect(mocks.queue.mock.calls[0][2].jobId).toBe(jobId)
  })
  it('rejects capacity or invalid source size before any persistent original or video', async () => {
    mocks.capacity.mockRejectedValue(new RemoteVideoAdmissionError('full',429,90))
    const res=response();await videoController.upload(request(),res)
    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After','90')
    expect(mocks.create).not.toHaveBeenCalled();expect(mocks.store).not.toHaveBeenCalled();expect(mocks.queue).not.toHaveBeenCalled()
    mocks.capacity.mockClear();mocks.stat.mockResolvedValue({size:0,isFile:()=>true})
    await videoController.upload(request(),response())
    expect(mocks.capacity).not.toHaveBeenCalled()
  })
  it('keeps the reservation when queue acknowledgement is unknown or accepted', async () => {
    mocks.getJob.mockRejectedValue(new Error('unknown'))
    mocks.find.mockResolvedValue({status:'PENDING'})
    const res=response();await videoController.upload(request(),res)
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update.mock.calls[0][0].data.status).toBeUndefined()
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({code:0,data:expect.objectContaining({status:'PENDING'})}))
  })
  it('compensates an unlinked original and releases only the upload sentinel when its CAS loses', async () => {
    mocks.update.mockResolvedValueOnce({count:0})
    await videoController.upload(request(),response())
    expect(mocks.discard).toHaveBeenCalledWith(expect.objectContaining({id:'asset'}))
    expect(mocks.queue).not.toHaveBeenCalled()
    expect(mocks.update.mock.calls[1][0]).toEqual(expect.objectContaining({where:expect.objectContaining({filePath:LOCAL_VIDEO_UPLOAD_SENTINEL,originalAssetId:null,processingGeneration:0}),data:expect.objectContaining({status:'FAILED'})}))
  })
  it('renews the lease until a long-running filesystem operation has actually finished', async () => {
    vi.useFakeTimers()
    let stored!: (asset: unknown) => void
    mocks.store.mockReturnValue(new Promise(resolve=>{stored=resolve}))
    mocks.queue.mockResolvedValue({id:'job'})
    const work=videoController.upload(request(),response())
    await vi.advanceTimersByTimeAsync(6*60*1000)
    expect(mocks.queue).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledWith({where:expect.objectContaining({filePath:LOCAL_VIDEO_UPLOAD_SENTINEL,processingGeneration:0}),data:{processingStartedAt:expect.any(Date)}})
    expect(mocks.update.mock.calls.every(call=>call[0].data.status!=='FAILED')).toBe(true)
    stored({id:'asset',objectKey:'original.mp4',sizeBytes:123})
    await work
    const writes=mocks.update.mock.calls.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(mocks.update).toHaveBeenCalledTimes(writes)
  })
})
