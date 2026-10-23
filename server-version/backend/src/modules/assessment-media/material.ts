import {z} from 'zod'

export const materialLimits = {
  'image/png':2*1024*1024, 'image/jpeg':2*1024*1024, 'image/webp':2*1024*1024,
  'video/mp4':50*1024*1024, 'video/webm':50*1024*1024, 'application/pdf':20*1024*1024,
} as const
export const materialSchema = z.object({
  asset:z.object({assetId:z.string().uuid(),contentHash:z.string().regex(/^[a-f0-9]{64}$/),
    mimeType:z.enum(['image/png','image/jpeg','image/webp','video/mp4','video/webm','application/pdf'])}).strict(),
  name:z.string().trim().min(1).max(300), caption:z.string().trim().max(1000).optional(),
  rightsStatus:z.enum(['unknown','self_authored','authorized']),rightsNote:z.string().trim().max(2000),
}).strict()
export const materialListSchema=z.array(materialSchema).max(10).superRefine((items,ctx)=>{
  if(new Set(items.map(item=>item.asset.assetId)).size!==items.length)
    ctx.addIssue({code:z.ZodIssueCode.custom,message:'同一素材不可重复添加'})
})
export type AssessmentMaterial=z.infer<typeof materialSchema>
export const publicMaterial=(item:AssessmentMaterial)=>({asset:item.asset,name:item.name,...(item.caption?{caption:item.caption}:{})})
