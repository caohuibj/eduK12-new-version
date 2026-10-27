import {same,PVT_LIMITS,type PvtConfig,type PvtPlan,type PvtRaw} from './protocol'
export interface PvtReview {targetOnsetMs:number|null;rtMs:number|null;heldAfter:string[];appeared:boolean;closedTarget:boolean;censored:boolean;interruptedTarget:boolean;early:boolean;completedBudget:boolean}
export function reviewPvt(raw:PvtRaw,plan:PvtPlan,c:PvtConfig,expectedHeld?:string[]):PvtReview{
  if(!same(raw.plan,plan))throw Error('PVT plan mismatch')
  if(![raw.phaseStartedAtMs,raw.waitStartedAtMs,raw.endedAtMs].every(t=>Number.isFinite(t)&&t>=0)||raw.waitStartedAtMs<raw.phaseStartedAtMs||raw.endedAtMs<raw.waitStartedAtMs)throw Error('PVT clock mismatch')
  if(!Number.isInteger(raw.ignoredRepeats)||raw.ignoredRepeats<0||typeof raw.overflow!=='boolean'||raw.events.length>PVT_LIMITS.eventsPerCycle||new Set(raw.heldBefore).size!==raw.heldBefore.length||raw.heldBefore.length>PVT_LIMITS.heldTokens||expectedHeld&&!same(raw.heldBefore,expectedHeld))throw Error('PVT raw/held budget mismatch')
  const deadline=plan.phase==='test'?raw.phaseStartedAtMs+c.durationMs:Infinity
  if(raw.waitStartedAtMs>=deadline)throw Error('PVT cycle started after budget')
  const held=new Set(raw.heldBefore);let previous=raw.waitStartedAtMs,target:number|null=null,rt:number|null=null,early=false,terminalEvent=-1
  for(const [i,event] of raw.events.entries()){
    if(!Number.isFinite(event.atMs)||event.atMs<previous||event.atMs>raw.endedAtMs)throw Error('PVT event clock mismatch');previous=event.atMs
    if(terminalEvent>=0)throw Error('PVT events after first response')
    if(event.kind==='target'){
      if(target!==null||event.atMs<raw.waitStartedAtMs+plan.waitMs||event.atMs>=deadline)throw Error('PVT target exposure mismatch')
      target=event.atMs;continue
    }
    if(typeof event.token!=='string'||!event.token||event.token.length>80||!['keyboard','mouse','touch','pen'].includes(event.input)||typeof event.repeat!=='boolean')throw Error('PVT input mismatch')
    if(event.kind==='up'){held.delete(event.token);continue}
    if(event.kind!=='down')throw Error('Unknown PVT event')
    const fresh=!held.has(event.token);held.add(event.token)
    if(held.size>PVT_LIMITS.heldTokens)throw Error('PVT held budget exceeded')
    if(!fresh||event.repeat||event.atMs>=deadline)continue
    if(target!==null){if(event.atMs<target+c.responseWindowMs){rt=event.atMs-target;terminalEvent=i}}
    else if(event.atMs>=raw.waitStartedAtMs+plan.feedbackMs){early=true;terminalEvent=i}
  }
  const timeoutAt=target===null?Infinity:target+c.responseWindowMs
  if(raw.outcome==='responded'&&(rt===null||raw.endedAtMs!==previous)||raw.outcome==='early'&&(!early||raw.endedAtMs!==previous))throw Error('PVT false first response')
  if(!['responded','early','timeout','budget-end','interrupted'].includes(raw.outcome)||raw.outcome!=='responded'&&rt!==null||raw.outcome!=='early'&&early)throw Error('PVT outcome mismatch')
  if(raw.outcome==='timeout'&&(target===null||raw.endedAtMs<timeoutAt||timeoutAt>deadline))throw Error('PVT incomplete timeout')
  if(raw.outcome==='budget-end'&&(plan.phase!=='test'||raw.endedAtMs<deadline||timeoutAt<=deadline))throw Error('PVT false duration completion')
  if(raw.outcome==='interrupted'&&(!raw.stopReason||raw.endedAtMs>=deadline||raw.endedAtMs>=timeoutAt))throw Error('PVT invalid interruption')
  if(raw.outcome!=='interrupted'&&(raw.stopReason!==null||raw.overflow)||raw.overflow&&raw.outcome!=='interrupted')throw Error('PVT stop metadata mismatch')
  const appeared=target!==null,closedTarget=raw.outcome==='responded'||raw.outcome==='timeout'
  return {targetOnsetMs:target,rtMs:rt,heldAfter:[...held].sort(),appeared,closedTarget,censored:appeared&&raw.outcome==='budget-end',interruptedTarget:appeared&&raw.outcome==='interrupted',early,completedBudget:plan.phase==='test'&&raw.endedAtMs>=deadline&&['timeout','budget-end'].includes(raw.outcome)}
}
export interface PvtStats {appeared:number;responded:number;timeouts:number;completeTargets:number;censored:number;interruptedTargets:number;earlyPresses:number;medianMs:number|null;responseSpeed:number|null;timeoutRate:number|null}
export function pvtStats(rows:{raw:PvtRaw;review:PvtReview}[]):PvtStats{
  const times=rows.flatMap(r=>r.review.rtMs===null?[]:[r.review.rtMs]),sorted=[...times].sort((a,b)=>a-b),mid=Math.floor(times.length/2)
  const responded=times.length,timeouts=rows.filter(r=>r.raw.outcome==='timeout').length,completeTargets=responded+timeouts
  return {appeared:rows.filter(r=>r.review.appeared).length,responded,timeouts,completeTargets,censored:rows.filter(r=>r.review.censored).length,interruptedTargets:rows.filter(r=>r.review.interruptedTarget).length,earlyPresses:rows.filter(r=>r.review.early).length,
    medianMs:times.length?(times.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2):null,
    responseSpeed:times.length&&times.every(t=>t>0)?times.reduce((n,t)=>n+1000/t,0)/times.length:null,timeoutRate:completeTargets?timeouts/completeTargets:null}
}
