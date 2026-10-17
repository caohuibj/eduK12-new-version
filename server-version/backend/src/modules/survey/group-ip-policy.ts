import { z } from 'zod'

/** An opt-in wave exception, never a project/account-wide rate-limit bypass. */
export const GROUP_IP_MAX_WINDOW_MS=48*60*60*1000
export type GroupIpDraftPolicy={schemaVersion:1;timeZone:string}
export type FrozenGroupIpPolicy=GroupIpDraftPolicy&{activationDate:string}
export type GroupIpWindowState={
  groupIpPolicy?:unknown
  groupIpActivatedAt?:Date|null
  opensAt?:Date|null
  closesAt?:Date|null
  finishUntil?:Date|null
  hardStopAt?:Date|null
}
export class GroupIpPolicyError extends Error {
  constructor(message:string,readonly statusCode=409){super(message)}
}
const fail=(message:string):never=>{throw new GroupIpPolicyError(message)}
const validDate=(value:unknown):value is Date=>value instanceof Date&&Number.isFinite(value.getTime())
export function isValidGroupIpTimeZone(value:string):boolean {
  // ECMA-402 also supports numeric offsets in newer runtimes; those are not IANA names.
  if(!value||value.length>100||value!==value.trim()||/^[+-]/.test(value))return false
  try{new Intl.DateTimeFormat('en',{timeZone:value}).format(new Date(0));return true}
  catch{return false}
}
const timeZoneSchema=z.string().min(1).max(100).refine(isValidGroupIpTimeZone,'需指定有效的 IANA 时区')
export const groupIpDraftPolicySchema=z.object({schemaVersion:z.literal(1),timeZone:timeZoneSchema}).strict()
const localDateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
  const date=new Date(value+'T00:00:00.000Z')
  return validDate(date)&&date.toISOString().slice(0,10)===value
},'启用日期必须是有效日期')
export const groupIpFrozenPolicySchema=groupIpDraftPolicySchema.extend({activationDate:localDateSchema}).strict()

export function groupIpLocalDate(now:Date,timeZone:string):string {
  if(!validDate(now)||!isValidGroupIpTimeZone(timeZone))fail('集中采集的时间或时区无效')
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now)
  const value=(type:string)=>parts.find(part=>part.type===type)!.value
  return `${value('year')}-${value('month')}-${value('day')}`
}
export function freezeGroupIpPolicy(value:unknown,now:Date):FrozenGroupIpPolicy|null {
  if(value===null||value===undefined)return null
  const parsed=groupIpDraftPolicySchema.safeParse(value)
  if(!parsed.success)fail('集中采集设置无效，日期只能由服务器在发布时确定')
  return {...parsed.data!,activationDate:groupIpLocalDate(now,parsed.data!.timeZone)}
}
export function resolveGroupIpOpenWindow(policy:unknown,input:{
  opensAt?:Date|null;closesAt?:Date|null;finishUntil?:Date|null
},now:Date):{opensAt:Date;closesAt:Date;finishUntil:Date;groupIpActivatedAt:Date}|null {
  if(policy===null||policy===undefined)return null
  const parsed=groupIpFrozenPolicySchema.safeParse(policy)
  if(!parsed.success||!validDate(now))fail('集中采集冻结设置无效')
  const frozen=parsed.data!
  if(groupIpLocalDate(now,frozen.timeZone)!==frozen.activationDate)
    fail('集中采集必须在发布当天启用，请创建并发布新的波次')
  for(const date of [input.opensAt,input.closesAt,input.finishUntil])
    if(date!==undefined&&date!==null&&!validDate(date))fail('集中采集时间必须是有效日期')
  if(input.opensAt&&(input.opensAt>now||groupIpLocalDate(input.opensAt,frozen.timeZone)!==frozen.activationDate))
    fail('集中采集须在发布当天立即开始，不支持预约未来时间')
  const close=input.closesAt??new Date(now.getTime()+GROUP_IP_MAX_WINDOW_MS)
  if(close<=now||close.getTime()-now.getTime()>GROUP_IP_MAX_WINDOW_MS)
    fail('集中采集结束时间须晚于当前时间，且不得超过启用后 48 小时')
  if(input.finishUntil&&input.finishUntil.getTime()!==close.getTime())
    fail('集中采集的作答截止时间必须等于采集结束时间，不设延长宽限')
  return {opensAt:new Date(now.getTime()),closesAt:new Date(close.getTime()),finishUntil:new Date(close.getTime()),groupIpActivatedAt:new Date(now.getTime())}
}
/** Fail closed even when persisted dates are malformed or later manipulated.
 * Callers must additionally check authorization, status, and frozen-publication binding.
 */
export function isGroupIpWindowActive(wave:GroupIpWindowState,now:Date):boolean {
  const policy=groupIpFrozenPolicySchema.safeParse(wave.groupIpPolicy)
  const activation=wave.groupIpActivatedAt,open=wave.opensAt,close=wave.closesAt,finish=wave.finishUntil
  if(!policy.success||!validDate(now)||!validDate(activation)||!validDate(open)||
    !validDate(close)||!validDate(finish)||wave.hardStopAt)return false
  const limit=activation.getTime()+GROUP_IP_MAX_WINDOW_MS
  return groupIpLocalDate(activation,policy.data.timeZone)===policy.data.activationDate&&
    open.getTime()===activation.getTime()&&close>activation&&close.getTime()<=limit&&
    finish>activation&&finish<=close&&finish.getTime()<=limit&&
    now>=activation&&now<close&&now<finish&&now.getTime()<limit
}
export function assertGroupIpWindowActive(wave:GroupIpWindowState,now:Date):void {
  if((wave.groupIpPolicy===null||wave.groupIpPolicy===undefined)&&!wave.groupIpActivatedAt)return
  if(!isGroupIpWindowActive(wave,now))fail('集中采集时间已经结束或设置无效，不能恢复或延长本轮采集')
}
