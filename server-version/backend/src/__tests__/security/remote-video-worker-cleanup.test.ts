import { promises as fs } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({process:vi.fn(),validate:vi.fn(),download:vi.fn(),store:vi.fn(),attach:vi.fn(),discard:vi.fn(),failed:vi.fn(),release:vi.fn(),update:vi.fn()}))
vi.mock('../../config/queue',()=>({videoQueue:{process:mocks.process,on:vi.fn(),add:vi.fn()},RESOURCE_LIMITS:{}}))
vi.mock('../../config/database',()=>({prisma:{video:{updateMany:mocks.update},$transaction:vi.fn()}}))
vi.mock('../../utils/logger',()=>({logger:{debug:vi.fn(),info:vi.fn(),warn:vi.fn(),error:vi.fn()}}))
vi.mock('../../utils/videoDownloader',()=>({downloadVideo:mocks.download,validateVideoFile:mocks.validate}))
vi.mock('../../services/assetStorage',()=>({storeAssetFromFile:mocks.store,attachAssetReference:mocks.attach,discardUnreferencedAsset:mocks.discard,getSignedAssetUrl:vi.fn()}))
vi.mock('../../services/videoProcessingState',()=>({markVideoProcessing:async()=>1,markVideoFailed:mocks.failed,releaseVideoProcessingForRetry:mocks.release,associateVideoRetryJob:vi.fn()}))
vi.mock('../../services/videoProcessingRecovery',()=>({isFinalVideoAttempt:(job:any)=>job.attemptsMade===2,registerVideoProcessingRecovery:vi.fn(),stopVideoProcessingRecovery:vi.fn(),reconcileStaleProcessingVideos:vi.fn()}))
vi.mock('fluent-ffmpeg',()=>{const ff:any=()=>{throw new Error('synthetic-transcode-failure')};ff.getAvailableCodecs=(cb:any)=>cb(null,{});return{default:ff}})
vi.mock('canvas',()=>({createCanvas:null}))
vi.mock('../../config',()=>({config:{uploadDir:'/tmp/eduk12-security-staging'}}))
import '../../workers/videoProcessorOptimized'
describe('remote originals are never pinned by invalid or failed processing',()=>{
 beforeEach(()=>{
  for(const fn of [mocks.validate,mocks.download,mocks.store,mocks.attach,mocks.discard,mocks.failed,mocks.release,mocks.update]) fn.mockReset()
  mocks.update.mockResolvedValue({count:1})
  mocks.download.mockImplementation(async(_url:string,options:any)=>{const localPath=path.join(options.tempDir,'download.mp4');await fs.writeFile(localPath,'synthetic bytes');return{success:true,localPath,fileSize:15}})
 })
 it.each(['invalid-media','validated-transform-failure'])('three %s attempts leave no original assets or references',async failure=>{
  mocks.validate.mockResolvedValue(failure==='invalid-media'?{valid:false,error:'invalid media'}:{valid:true,codec:'h264',width:640,height:360,bitrate:100000,duration:2,size:15})
  const processor=mocks.process.mock.calls.find(call=>call[0]==='transcode')![2]
  const videoId='synthetic-security-'+failure
  for(let attempt=0;attempt<3;attempt++){
   await expect(processor({id:'cleanup',data:{videoId,teacherId:'synthetic-owner',videoUrl:'https://example.com/video'},progress:async()=>{},attemptsMade:attempt,opts:{attempts:3}} )).rejects.toThrow(failure==='invalid-media'?'视频验证失败: invalid media':'synthetic-transcode-failure')
   await expect(fs.stat('/tmp/eduk12-security-staging/.processing/video-'+videoId+'-cleanup-g1')).rejects.toMatchObject({code:'ENOENT'})
  }
  expect(mocks.validate).toHaveBeenCalledTimes(3)
  expect(mocks.store).not.toHaveBeenCalled()
  expect(mocks.attach).not.toHaveBeenCalled()
  expect(mocks.failed).toHaveBeenCalledTimes(1)
 })
})
