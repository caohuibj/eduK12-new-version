import {withSharedControlContext} from '../assessment-runtime/shared-control-records'
import {getAttemptState} from '../composite/composite.service'
import {attachEducationInlineWhole} from '../composite/whole-start-inline'

type AttemptState=Awaited<ReturnType<typeof getAttemptState>>
export type TeacherInlineCurrentUnitRequest={
 query?:{view?:unknown;delivery?:unknown}
 body?:unknown
}

/** Same opt-in signals already used by Teacher start-assessment. */
export function requestedTeacherInlineCurrentUnit(req:TeacherInlineCurrentUnitRequest):boolean{
 const body=req.body
 return req.query?.view==='current-unit'
  ||req.query?.delivery==='inline'
  ||(!!body&&typeof body==='object'&&((body as {delivery?:unknown}).delivery==='inline'||(body as {view?:unknown}).view==='current-unit'))
}

/** Additive currentUnit on a committed START. Authorization or projection
 * failure leaves that payload unchanged so the client can fall back to GET. */
export async function attachTeacherInlineCurrentUnit<T extends object,U>(input:{
 requested:boolean
 started:T
 attemptId?:string|null
 actorUserId:string
 freshlyCreated?:boolean
 knownTemplateHashes?:ReadonlySet<string>
 authorize?:(input:{attemptId:string;actorUserId:string})=>Promise<unknown>
 project:(state:AttemptState)=>U
}):Promise<T|(T&{currentUnit:U})>{
 const {attemptId}=input
 if(!input.requested||!attemptId)return input.started
 try{
  return await withSharedControlContext(async()=>{
   if(input.authorize)await input.authorize({attemptId,actorUserId:input.actorUserId})
   const preloaded=(input.started as {
    _educationWholePreload?:{
     parent?:Parameters<typeof getAttemptState>[4]
     preloadedState?:Parameters<typeof getAttemptState>[5]
    }
   })._educationWholePreload
   const state=preloaded?.parent
    ?await getAttemptState(attemptId,{userId:input.actorUserId},undefined,'current-unit',preloaded.parent,preloaded.preloadedState)
    :await getAttemptState(attemptId,{userId:input.actorUserId},undefined,'current-unit')
   const projected=input.project(state)
   const inlineWhole=await attachEducationInlineWhole({
    currentUnit:projected as {id?:string;executionMode?:string},
    userId:input.actorUserId,
    freshlyCreated:Boolean(input.freshlyCreated),
    preloadedParent:preloaded?.parent,
    knownTemplateHashes:input.knownTemplateHashes,
   })
   return {...input.started,currentUnit:projected,...(inlineWhole??{})}
  })
 }catch{
  return input.started
 }
}
