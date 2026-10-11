import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { authenticateSurvey } from '../../middleware/auth'
import { transitionResearchProject } from './project-lifecycle'
import { SurveyWaveError } from './waves.service'
import { success, error } from '../../utils/response'

export const surveyProjectsRouter=Router()
const title=z.string().trim().min(1).max(160)
const mode=z.enum(['SINGLE_UNLINKED','LINKED_WAVES'])
const projectId=z.string().uuid()
const create=z.object({
  requestId:projectId,title,description:z.string().max(5000).default(''),collectionMode:mode,
}).strict()
const patch=z.object({
  revision:z.number().int().min(0),title:title.optional(),
  description:z.string().max(5000).optional(),collectionMode:mode.optional(),
}).strict().refine(x=>x.title!==undefined||x.description!==undefined||x.collectionMode!==undefined)
const rev=z.object({revision:z.number().int().min(0)}).strict()
type Tx=Prisma.TransactionClient
class ProjectError extends Error {
  constructor(public statusCode:number,message:string){super(message)}
}
const handler=(fn:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try {return success(res,await fn(req))}
  catch(e) {
    if(e instanceof z.ZodError)return error(res,'项目字段不合法',-1,400)
    if(e instanceof ProjectError)return error(res,e.message,-1,e.statusCode)
    if(e instanceof SurveyWaveError)return error(res,e.message,-1,e.statusCode)
    next(e)
  }
}
async function usable(tx:Tx,uid:string){
  const rows=await tx.$queryRaw<Array<{yes:boolean}>>`
    SELECT TRUE AS "yes" FROM users u JOIN survey_researcher_grants g ON g.user_id=u.id
      JOIN survey_mfa_credentials m ON m.user_id=u.id
    WHERE u.id=${uid} AND u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen
      AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
      AND g.status='ACTIVE' AND m.enabled
  `
  if(!rows.length)throw new ProjectError(403,'研究者资格不可用')
}
async function own(tx:Tx,uid:string,id:string){
  const p=await tx.surveyProject.findFirst({where:{id,ownerUserId:uid}})
  if(!p)throw new ProjectError(404,'研究项目不存在')
  return p
}
const audit=async(tx:Tx,uid:string,id:string,action:string)=>tx.surveyEvent.create({
  data:{id:randomUUID(),actorUserId:uid,projectId:id,action,metadata:{}},
})
surveyProjectsRouter.use(authenticateSurvey)
surveyProjectsRouter.get('/',handler(async(req)=>{
  const page=Math.min(1000,Math.max(1,Number(req.query.page)||1))
  return prisma.$transaction(async tx=>{
    await usable(tx,req.user!.userId)
    const list=await tx.surveyProject.findMany({
      where:{ownerUserId:req.user!.userId},take:25,skip:(page-1)*25,
      orderBy:[{updatedAt:'desc'},{id:'desc'}],
    })
    return {page,pageSize:25,list}
  })
}))
surveyProjectsRouter.post('/',handler(async(req)=>{
  const input=create.parse(req.body),uid=req.user!.userId
  return prisma.$transaction(async tx=>{
    await usable(tx,uid)
    const existing=await tx.surveyProject.findUnique({where:{id:input.requestId}})
    if(existing){
      if(existing.ownerUserId!==uid || existing.title!==input.title ||
         existing.description!==input.description || existing.collectionMode!==input.collectionMode)
        throw new ProjectError(409,'项目请求冲突')
      return existing
    }
    const row=await tx.surveyProject.create({data:{
      id:input.requestId,ownerUserId:uid,title:input.title,
      description:input.description,collectionMode:input.collectionMode,status:'DRAFT',
    }})
    await audit(tx,uid,row.id,'PROJECT_CREATED')
    return row
  })
}))
surveyProjectsRouter.get('/:id',handler(async(req)=>{
  const uid=req.user!.userId,id=projectId.parse(req.params.id)
  return prisma.$transaction(async tx=>{await usable(tx,uid);return own(tx,uid,id)})
}))
surveyProjectsRouter.patch('/:id',handler(async(req)=>{
  const uid=req.user!.userId,id=projectId.parse(req.params.id),input=patch.parse(req.body)
  return prisma.$transaction(async tx=>{
    await usable(tx,uid)
    const previous=await own(tx,uid,id)
    if(previous.status!=='DRAFT'||previous.revision!==input.revision)
      throw new ProjectError(409,'草稿已变化，请刷新后重新编辑')
    const result=await tx.surveyProject.updateMany({
      where:{id,ownerUserId:uid,revision:input.revision,status:'DRAFT'},
      data:{...input,revision:{increment:1},updatedAt:new Date()},
    })
    if(result.count!==1)throw new ProjectError(409,'项目更新冲突')
    await audit(tx,uid,id,'PROJECT_UPDATED')
    return own(tx,uid,id)
  })
}))
surveyProjectsRouter.post('/:id/archive',handler(async(req)=>{
  const uid=req.user!.userId,id=projectId.parse(req.params.id),input=rev.parse(req.body)
  return prisma.$transaction(async tx=>{
    await usable(tx,uid)
    const project=await own(tx,uid,id)
    // Unpublished drafts can be archived/reopened. A completed research
    // project is terminal, but remains accessible to its authorized owner.
    if(!['DRAFT','CLOSED'].includes(project.status)||project.revision!==input.revision
      ||(project.status==='DRAFT'&&project.firstPublishedAt!==null)
      ||(project.status==='CLOSED'&&project.firstPublishedAt===null))
      throw new ProjectError(409,'只能归档尚未冻结发布的草稿或正式结束的研究')
    const result=await tx.surveyProject.updateMany({
      where:{id,ownerUserId:uid,status:project.status,revision:input.revision},
      data:{status:'ARCHIVED',revision:{increment:1},updatedAt:new Date()},
    })
    if(result.count!==1)throw new ProjectError(409,'项目状态发生并发变化')
    await audit(tx,uid,id,'PROJECT_ARCHIVED')
    return own(tx,uid,id)
  })
}))
surveyProjectsRouter.post('/:id/restore',handler(async(req)=>{
  const uid=req.user!.userId,id=projectId.parse(req.params.id),input=rev.parse(req.body)
  return prisma.$transaction(async tx=>{
    await usable(tx,uid)
    const project=await own(tx,uid,id)
    if(project.status!=='ARCHIVED'||project.revision!==input.revision
      ||project.firstPublishedAt!==null)
      throw new ProjectError(409,'已发布或已结束的研究归档后不能重新开启')
    const changed=await tx.surveyProject.updateMany({
      where:{id,ownerUserId:uid,status:'ARCHIVED',revision:input.revision,firstPublishedAt:null},
      data:{status:'DRAFT',revision:{increment:1},updatedAt:new Date()},
    })
    if(changed.count!==1)throw new ProjectError(409,'项目状态发生并发变化')
    await audit(tx,uid,id,'PROJECT_DRAFT_RESTORED')
    return own(tx,uid,id)
  })
}))

for(const [endpoint,action] of [['pause','PAUSE'],['resume','RESUME'],['close','CLOSE']] as const){
  surveyProjectsRouter.post('/:id/'+endpoint,handler(req=>
    transitionResearchProject({
      actorUserId:req.user!.userId,projectId:projectId.parse(req.params.id),
      revision:rev.parse(req.body).revision,action,
    })))
}
