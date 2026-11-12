import {getAttemptState} from '../composite/composite.service'

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

/** Additive currentUnit on a committed START. A projection failure leaves that
 * payload unchanged so the client can fall back to its existing GET. */
export async function attachTeacherInlineCurrentUnit<T extends object,U>(input:{
 requested:boolean
 started:T
 attemptId?:string|null
 actorUserId:string
 project:(state:AttemptState)=>U
}):Promise<T|(T&{currentUnit:U})>{
 if(!input.requested||!input.attemptId)return input.started
 try{
  const state=await getAttemptState(input.attemptId,{userId:input.actorUserId},undefined,'current-unit')
  return {...input.started,currentUnit:input.project(state)}
 }catch{
  return input.started
 }
}
