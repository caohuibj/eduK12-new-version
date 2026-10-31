import {Router,type Request,type Response,type NextFunction} from 'express'
import multer from 'multer'
import {z} from 'zod'
import {success,error} from '../../../utils/response'
import {AdminPermissionError} from '../../admin-permissions/service'
import {componentTemplateWorkbook} from './excel'
import * as service from './service'
import {previewComponentPublication,publishComponentDraft} from './publication'
import {requireRecentAdminKey} from '../../admin-permissions/guards'

/** Inherits existing platform origin, CSRF, authentication and system-admin guards. */
export const scaleComponentImportRouter=Router()
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024,files:1,fields:3}}).single('file')
const file=(req:Request)=>{if(!req.file)throw new AdminPermissionError(400,'请选择Excel文件');return req.file.buffer}
const handle=(work:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
 try{return success(res,await work(req))}catch(e){if(e instanceof z.ZodError)return error(res,e.issues.map(i=>i.path.join('.')+'：'+i.message).join('；'),-1,400);if(e instanceof AdminPermissionError)return error(res,e.message,-1,e.statusCode);next(e)}
}
scaleComponentImportRouter.get('/component-template',async(_req,res,next)=>{try{res.setHeader('Content-Disposition','attachment; filename="scale-components-v1.xlsx"');res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(await componentTemplateWorkbook())}catch(e){next(e)}})
scaleComponentImportRouter.post('/component-import/preview',upload,handle(req=>service.previewComponentImport(req.user!.userId,file(req))))
scaleComponentImportRouter.post('/component-import/save',upload,handle(req=>{const input=z.object({requestId:z.string().uuid(),expectedDigest:z.string().regex(/^[0-9a-f]{64}$/)}).strict().parse(req.body);return service.saveComponentImport(req.user!.userId,{...input,buffer:file(req)})}))
scaleComponentImportRouter.get('/component-drafts',handle(req=>service.listComponentDrafts(req.user!.userId,z.coerce.number().int().min(1).max(10000).default(1).parse(req.query.page))))
scaleComponentImportRouter.get('/component-drafts/:id',handle(req=>service.readComponentDraft(req.user!.userId,z.string().uuid().parse(req.params.id))))
scaleComponentImportRouter.post('/component-drafts/:id',handle(req=>service.editComponentDraft(req.user!.userId,z.string().uuid().parse(req.params.id),z.object({expectedRevision:z.number().int().positive(),draft:z.unknown()}).strict().parse(req.body))))
scaleComponentImportRouter.get('/component-drafts/:id/preview',handle(req=>previewComponentPublication(req.user!.userId,z.string().uuid().parse(req.params.id))))
scaleComponentImportRouter.post('/component-drafts/:id/publish',requireRecentAdminKey,handle(req=>publishComponentDraft(req.user!.userId,z.string().uuid().parse(req.params.id),z.object({requestId:z.string().uuid(),expectedRevision:z.number().int().positive(),expectedPreviewHash:z.string().regex(/^[a-f0-9]{64}$/),expectedBase:z.object({releaseId:z.string().uuid(),combinationHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().nullable(),reason:z.string().trim().min(1).max(1000),allowedProducts:z.array(z.enum(['TRAINING','SURVEY','SCHOOL','TEACHER'])).min(1).max(4)}).strict().parse(req.body),req.user!)))
