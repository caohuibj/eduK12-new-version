import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks=vi.hoisted(()=>({process:vi.fn(),validate:vi.fn(),store:vi.fn(),attach:vi.fn(),discard:vi.fn(),failed:vi.fn(),update:vi.fn(),options:[] as string[][],thumbnailOptions:[] as string[][],output:'limit',thumbnailLimit:false}))
vi.mock('../../config/queue',()=>({videoQueue:{process:mocks.process,on:vi.fn(),add:vi.fn()},RESOURCE_LIMITS:{}}))
vi.mock('../../config/database',()=>({prisma:{video:{updateMany:mocks.update},$transaction:async(fn:any)=>fn({video:{updateMany:mocks.update}})}}))
vi.mock('../../utils/logger',()=>({logger:{debug:vi.fn(),info:vi.fn(),warn:vi.fn(),error:vi.fn()}}))
vi.mock('../../utils/videoDownloader',()=>({downloadVideo:vi.fn(),validateVideoFile:mocks.validate}))
vi.mock('../../utils/videoProbe',()=>({probeVideo:async()=>({streams:[{codec_type:'video',codec_name:'h264',width:640,height:360}],format:{duration:2}})}))
vi.mock('../../services/assetStorage',()=>({storeAssetFromFile:mocks.store,attachAssetReference:mocks.attach,discardUnreferencedAsset:mocks.discard,getSignedAssetUrl:async()=>'/signed',signKnownAsset:()=>'/signed'}))
vi.mock('../../services/videoProcessingState',()=>({markVideoProcessing:async()=>7,markVideoFailed:mocks.failed,releaseVideoProcessingForRetry:vi.fn(),associateVideoRetryJob:vi.fn()}))
vi.mock('../../services/videoProcessingRecovery',()=>({isFinalVideoAttempt:()=>true,registerVideoProcessingRecovery:vi.fn(),stopVideoProcessingRecovery:vi.fn(),reconcileStaleProcessingVideos:vi.fn()}))
vi.mock('../../config',()=>({config:{uploadDir:'/tmp/eduk12-video-output-bound'}}))
vi.mock('canvas',()=>({createCanvas:null}))
vi.mock('fluent-ffmpeg',()=>{
 const ff:any=()=>{
  const events:Record<string,(...args:any[])=>void>={},options:string[]=[]
  const output=(target:string,thumbnail=false)=>{
   const limit=Number(options.find(option=>option.startsWith('-fs '))?.slice(4))
   const operation=async()=>{
    if(!thumbnail&&mocks.output==='missing')return
    const io=await import('node:fs/promises')
    await io.writeFile(target,'')
    await io.truncate(target,(thumbnail?mocks.thumbnailLimit:mocks.output==='limit')?limit:1)
   }
   void operation().then(()=>events.end(),error=>events.error(error))
  }
  const cmd:any={
   ffprobe:(callback:any)=>{callback(null,{format:{duration:2}});return cmd},
   videoCodec:()=>cmd,videoBitrate:()=>cmd,audioCodec:()=>cmd,audioBitrate:()=>cmd,
   outputOptions:(values:string[])=>{options.push(...values);return cmd},
   complexFilter:()=>cmd,input:()=>cmd,kill:()=>cmd,
   on:(event:string,handler:any)=>{events[event]=handler;return cmd},
   save:(target:string)=>{mocks.options.push(options);output(target);return cmd},
   screenshots:(settings:any)=>{mocks.thumbnailOptions.push(options);output(settings.folder+'/'+settings.filename,true);return cmd},
  }
  return cmd
 }
 ff.getAvailableCodecs=(callback:any)=>callback(null,{})
 ff.ffprobe=(_input:string,callback:any)=>callback(null,{format:{duration:2}})
 return {default:ff}
})

import { stopVideoProcessorLoops } from '../../workers/videoProcessorOptimized'
import { videoOutputMaxBytes, VIDEO_THUMBNAIL_MAX_BYTES } from '../../services/remoteVideoAdmission'
import { activeWorkerSubprocessCount } from '../../workers/workerSubprocessRegistry'

describe('video derivatives obey their admitted storage bound',()=>{
 let source:string,videoId:string
 const inputBytes=512*1024
 beforeEach(async()=>{
  for(const fn of [mocks.validate,mocks.store,mocks.attach,mocks.discard,mocks.failed,mocks.update])fn.mockReset()
  mocks.options.length=0;mocks.thumbnailOptions.length=0;mocks.output='limit';mocks.thumbnailLimit=false
  mocks.validate.mockResolvedValue({valid:true,codec:'h264',width:640,height:360,duration:2,bitrate:1000,size:inputBytes})
  mocks.update.mockResolvedValue({count:1})
  mocks.store.mockImplementation(async()=>({id:'asset-'+mocks.store.mock.calls.length,objectKey:'synthetic.mp4',provider:'local'}))
  source='/tmp/eduk12-video-source-'+randomUUID()+'.mp4';videoId=randomUUID()
  await fs.writeFile(source,'');await fs.truncate(source,inputBytes)
 })
 afterEach(async()=>{await fs.rm(source,{force:true})})
 afterAll(async()=>{stopVideoProcessorLoops();await fs.rm('/tmp/eduk12-video-output-bound',{recursive:true,force:true})})
 const process=()=>mocks.process.mock.calls.find(call=>call[0]==='transcode')![2]({id:'bounded-output',data:{videoId,teacherId:'synthetic-owner',originalUrl:'file://'+source},progress:async()=>{},attemptsMade:2,opts:{attempts:3}})
 const checkFailure=async(message:string)=>{
  await expect(process()).rejects.toThrow(message)
  expect(mocks.store).not.toHaveBeenCalled();expect(mocks.attach).not.toHaveBeenCalled()
  expect(mocks.failed).toHaveBeenCalledWith(videoId,'bounded-output',7)
  expect(activeWorkerSubprocessCount()).toBe(0)
  await expect(fs.stat('/tmp/eduk12-video-output-bound/.processing/video-'+videoId+'-bounded-output-g7')).rejects.toMatchObject({code:'ENOENT'})
  expect((await fs.stat(source)).size).toBe(inputBytes)
 }
 it('rejects FFmpeg successful exit at its size limit instead of publishing a truncated video',async()=>{
  await checkFailure('视频转码输出超过存储限制')
  expect(mocks.options[0]).toContain('-fs '+(videoOutputMaxBytes(inputBytes)-1024*1024))
 })
 it('fails closed when an exited process leaves no verifiable output file',async()=>{
  mocks.output='missing';await checkFailure('无法核实视频转码输出大小')
 })
 it('bounds and rejects a thumbnail that reaches its output ceiling',async()=>{
  mocks.output='small';mocks.thumbnailLimit=true;await checkFailure('视频缩略图输出超过存储限制')
  expect(mocks.thumbnailOptions[0]).toContain('-fs '+(VIDEO_THUMBNAIL_MAX_BYTES-1024*1024))
 })
 it('publishes bounded video and thumbnail files through the existing exact-generation transaction',async()=>{
  mocks.output='small';await expect(process()).resolves.toMatchObject({videoId,fileSize:1})
  expect(mocks.store).toHaveBeenCalledTimes(2);expect(mocks.attach).toHaveBeenCalledTimes(2)
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:videoId,status:'PROCESSING',processingJobId:'bounded-output',processingGeneration:7}}))
  expect(mocks.failed).not.toHaveBeenCalled();expect(activeWorkerSubprocessCount()).toBe(0)
 })
})
