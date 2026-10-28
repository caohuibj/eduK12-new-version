import {Router,raw,type Request,type Response,type NextFunction} from 'express'
import {TextDecoder} from 'node:util'
import {z} from 'zod'
import {authenticate,requireRole} from '../../middleware/auth'
import {UserRole} from '../../types'
import {success,instrumentError,unauthorized} from '../../utils/response'
import {archiveCognitiveRawSubmission,getCognitiveRawArchiveStatus,CognitiveRawArchiveError,
  type CognitiveRawArchiveDependencies,type CognitiveRawArchiveUpload} from './raw-archive.service'
export const COGNITIVE_RAW_ARCHIVE_HTTP_MAX_BYTES=12*1024*1024
const hash=z.string().regex(/^[a-f0-9]{64}$/)
const identity=z.object({sessionId:z.string().min(1).max(512),attemptEpoch:z.number().int().positive(),
 submissionId:z.string().min(16).max(200),definitionHash:hash}).strict()
const upload=z.object({attemptEpoch:z.number().int().positive(),submissionId:z.string().min(16).max(200),definitionHash:hash,
 rawPayload:z.unknown(),rawSha256:hash,expectedCoreHash:hash.optional()}).strict()
const reportError=(res:Response,reason:unknown)=>{
 if(reason instanceof CognitiveRawArchiveError)return instrumentError(res,reason.code,reason.message,reason.statusCode)
 if((reason as {type?:string})?.type==='entity.too.large')return instrumentError(res,'INVALID_ARCHIVE_PAYLOAD','归档请求超出限制',413)
 return instrumentError(res,'ARCHIVE_STORAGE_UNCONFIRMED','原件归档尚未确认，请保留记录后重试',503)
}
/** Defaults are the real production services. Test dependency overrides cannot arrive in an HTTP request. */
export function createCognitiveRawArchiveRouter(deps:Partial<CognitiveRawArchiveDependencies>={}){
 const router=Router({mergeParams:true})
 router.use(authenticate,requireRole(UserRole.STUDENT))
 router.get('/',async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  try{
   if(!req.user)return unauthorized(res)
   const epoch=typeof req.query.attemptEpoch==='string'&&/^\d+$/.test(req.query.attemptEpoch)?Number(req.query.attemptEpoch):NaN
   const binding=identity.safeParse({sessionId:req.params.id,attemptEpoch:epoch,submissionId:req.query.submissionId,definitionHash:req.query.definitionHash})
   if(!binding.success)return instrumentError(res,'INVALID_ARCHIVE_PAYLOAD','归档请求格式无效',400)
   return success(res,await getCognitiveRawArchiveStatus(binding.data,{userId:req.user.userId},deps))
  }catch(reason){return reportError(res,reason)}
 })
 // The global application/json parser remains2MiB. Only this authenticated upload accepts bounded JSON bytes.
 router.post('/',raw({type:'application/octet-stream',limit:COGNITIVE_RAW_ARCHIVE_HTTP_MAX_BYTES}),async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  try{
   if(!req.user)return unauthorized(res)
   if(!Buffer.isBuffer(req.body))return instrumentError(res,'INVALID_ARCHIVE_PAYLOAD','请使用指定原件上传格式',415)
   let parsed:z.infer<typeof upload>
   try{parsed=upload.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(req.body)))}
   catch{return instrumentError(res,'INVALID_ARCHIVE_PAYLOAD','归档请求格式无效',400)}
   const binding=identity.safeParse({sessionId:req.params.id,attemptEpoch:parsed.attemptEpoch,submissionId:parsed.submissionId,definitionHash:parsed.definitionHash})
   if(!binding.success)return instrumentError(res,'INVALID_ARCHIVE_PAYLOAD','归档请求格式无效',400)
   return success(res,await archiveCognitiveRawSubmission(binding.data,{userId:req.user.userId},{rawPayload:parsed.rawPayload as CognitiveRawArchiveUpload['rawPayload'],
    rawSha256:parsed.rawSha256,...(parsed.expectedCoreHash?{expectedCoreHash:parsed.expectedCoreHash}:{})},deps))
  }catch(reason){return reportError(res,reason)}
 })
 router.use((reason:unknown,_req:Request,res:Response,_next:NextFunction)=>reportError(res,reason))
 return router
}
