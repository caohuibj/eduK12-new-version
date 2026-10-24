import {Prisma} from '@prisma/client'
import {z} from 'zod'

export const projectDirectoryQuery=z.object({
  page:z.coerce.number().int().min(1).max(1000).default(1),
  pageSize:z.coerce.number().refine(n=>[10,25,50,100].includes(n)).default(25),
  sort:z.enum(['created_desc','created_asc']).default('created_desc'),
  status:z.enum(['DRAFT','ACTIVE','PAUSED','CLOSED','ARCHIVED']).optional(),
  q:z.string().trim().max(200).default(''),
})

export async function readProjectDirectory(tx:Prisma.TransactionClient,ownerUserId:string,input:z.infer<typeof projectDirectoryQuery>){
  const where:Prisma.SurveyProjectWhereInput={ownerUserId,
    ...(input.status?{status:input.status}:{}),
    ...(input.q?{OR:[{title:{contains:input.q,mode:'insensitive'}},{description:{contains:input.q,mode:'insensitive'}}]}:{}),
  }
  const total=await tx.surveyProject.count({where})
  const page=Math.min(input.page,Math.max(1,Math.ceil(total/input.pageSize)))
  const direction=input.sort==='created_asc'?'asc':'desc'
  const list=await tx.surveyProject.findMany({where,take:input.pageSize,skip:(page-1)*input.pageSize,
    orderBy:[{createdAt:direction},{id:direction}],
  })
  return {page,pageSize:input.pageSize,total,hasNext:page*input.pageSize<total,list}
}
