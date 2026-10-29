// Exact pure content projection. Backend SHA256: 0d6261afbe42d9fb0c111a5d719cb604ed10ac66366f90af708eeccecd2789df
/* Copyright 2024 The Many Brains Project, Inc. and McLean Hospital.
 * Adapted data/rules from TestMyBrain GradCPT Apr24, ec09ea0d35779bb39997131313dfd1380ee34922.
 * LGPL-3.0; see COPYING.LESSER and LICENSE. Changes: typed immutable resources and event-derived attribution.
 * This file retains LGPL-3.0. https://www.gnu.org/licenses/lgpl-3.0.en.html
 */
import type {GradRaw,GradSlot} from './protocol'
export interface AssignedResponse {eventIndex:number;atMs:number;rtMs:number;opacity:number;code:number}
/** Adapted from TMB assignTrial/report; real event times are never rewritten. Code4 swaps event ownership explicitly. */
export function resolveGrad(raw:GradRaw,plan:GradSlot[]){
 const assigned:Record<number,AssignedResponse>={},held=new Set<string>();let lastAccepted=-Infinity;const ignored:Record<string,number>={held:0,repeat:0,multiple:0,debounce:0,unassigned:0,wrongKey:0}
 for(const [eventIndex,e] of raw.events.entries()){
  if(e.type==='up'){held.delete(e.token);continue}
  if(!e.primary){ignored.multiple++;continue}if(e.repeat){ignored.repeat++;continue}if(held.size){ignored.held++;continue}held.add(e.token)
  if(e.input==='keyboard'&&!['key:Space','focus:Space','focus:Enter','focus:NumpadEnter'].includes(e.token)){ignored.wrongKey++;continue}
  if(e.atMs-lastAccepted<50){ignored.debounce++;continue}lastAccepted=e.atMs
  const n=e.slotIndex,p=n-1,op=e.opacity,prev=assigned[p],curr=assigned[n],go=(i:number)=>plan[i]?.kind==='city'?1:plan[i]?.kind==='mountain'?0:2
  let target:number|null=null,code=0
  if(n===0){ignored.unassigned++;continue}
  if(prev&&curr){}else if(prev&&op<0.4){}else if(curr&&op>0.8){}
  else if(!prev&&op<0.4){target=p;code=1}
  else if(!curr&&op>0.8){target=n;code=2}
  else if(op>=0.4&&op<=0.8&&prev&&!curr){target=n;code=3}
  else if(op>=0.4&&op<=0.8&&curr&&!prev&&go(p)===1){target=p;code=4}
  else if(op>=0.4&&op<=0.8&&!prev&&!curr&&go(n)!==1&&go(p)===1){target=p;code=5}
  else if(op>=0.4&&op<=0.8&&!prev&&!curr&&go(n)!==0&&go(p)!==1){target=n;code=6}
  else if(op>=0.4&&op<=0.8&&!prev&&!curr&&go(n)===0&&go(p)===2){target=n;code=10}
  else if(op>0.6&&op<=0.8&&!prev&&!curr&&go(n)===go(p)){target=n;code=7}
  else if(op>=0.4&&op<=0.6&&!prev&&!curr&&go(n)===go(p)){target=p;code=8}
  if(target===null){ignored.unassigned++;continue}
  const response=(i:number,which:number,at:number,opacity:number,c:number):AssignedResponse=>({eventIndex:which,atMs:at,rtMs:at-raw.slots[i].startMs,opacity,code:c})
  if(code===4){assigned[p]=response(p,curr.eventIndex,curr.atMs,1-curr.opacity,4);assigned[n]=response(n,eventIndex,e.atMs,op,4)}
  else assigned[target]=response(target,eventIndex,e.atMs,target===n?op:1-op,code)
 }
 return {assigned,ignored}
}
