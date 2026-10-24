import {createHash} from 'node:crypto'
import type {RequestHandler} from 'express'
import {cacheService} from '../../services/cacheService'
import {parseMemorableCode,normalizeShortCode,normalizeGeneratedCode} from './memorable-code.crypto'
export const memorableCodeRateLimit:RequestHandler=async(req,res,next)=>{
  const body=req.body??{},parsed=parseMemorableCode(typeof body.fullCode==='string'?body.fullCode:typeof body.resetCode==='string'?body.resetCode:'')
  const prefix=parsed?.prefix??(typeof body.fullCode==='string'&&normalizeGeneratedCode(body.fullCode)?'generated:'+normalizeGeneratedCode(body.fullCode):null)??(typeof body.prefix==='string'?normalizeShortCode(body.prefix).slice(0,20):'invalid')
  const key=createHash('sha256').update(String(req.params.publicId)+':'+prefix).digest('hex')
  try{
    const result=await cacheService.consumeRateLimit('survey-code-attempt:'+key,12,900)
    if(!result){res.status(503).json({code:-1,message:'编码验证暂不可用，请稍后再试',data:null});return}
    if(!result.allowed){res.setHeader('Retry-After',String(result.retryAfterSeconds));res.status(429).json({code:-1,message:'该编号尝试次数较多，请稍后再试',data:null});return}
    next()
  }catch{res.status(503).json({code:-1,message:'编码验证暂不可用，请稍后再试',data:null})}
}
