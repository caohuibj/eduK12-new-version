import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth'
import { success,error } from '../../utils/response'
import { ParentPortalError } from './contracts'
import { parentToolPolicyService,parentToolRefSchema } from './tool-policy'
export const parentToolPolicyRouter=Router()
parentToolPolicyRouter.use(authenticate,(_q,r,n)=>{r.set('Cache-Control','no-store');n()})
const handle=(fn:(q:any)=>Promise<any>)=>(q:any,r:any,n:any)=>Promise.resolve().then(()=>fn(q)).then(data=>success(r,data)).catch(e=>{if(e instanceof z.ZodError)return error(r,'设置参数无效',-1,400);if(e instanceof ParentPortalError)return error(r,e.message,-1,e.status);n(e)})
const ref=(q:any)=>parentToolRefSchema.parse(q.params)
parentToolPolicyRouter.get('/:family/:key/:version',handle(q=>parentToolPolicyService.read(q.user.userId,ref(q))))
parentToolPolicyRouter.put('/:family/:key/:version',handle(q=>{const body=z.object({policy:z.unknown(),expectedVersion:z.number().int().min(0),commandKey:z.string().uuid()}).strict().parse(q.body);return parentToolPolicyService.update(q.user.userId,ref(q),{...body,policy:body.policy})}))
