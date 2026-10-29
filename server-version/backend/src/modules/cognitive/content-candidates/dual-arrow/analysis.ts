import {same,initialDualState,reduceDualEvent,type DualRaw,type DualPlan,type DualConfig} from './protocol'
export function reviewDual(raw:DualRaw,p:DualPlan,c:DualConfig){if(!same(raw.plan,p)||raw.endedAtPerfMs<raw.startedAtPerfMs)throw Error('Dual frozen plan/clock mismatch');const state=initialDualState(p);let last=raw.startedAtPerfMs
 for(const e of raw.events){if(e.atMs<last||e.atMs>raw.endedAtPerfMs)throw Error('Dual event clock mismatch');last=e.atMs;reduceDualEvent(state,e,p,c,raw.startedAtPerfMs)}
 if(!same(state,raw.state))throw Error('Dual state differs from events')
 if(raw.status==='complete'&&(state.stage!=='complete'||state.completeAtMs!==raw.endedAtPerfMs||state.stimulusAtMs===null||state.feedbackAtMs===null||raw.stopReason!==null||raw.overflow))throw Error('Unexecuted dual trial claimed complete')
 if(raw.status==='interrupted'&&(raw.stopReason===null||state.stage==='complete'))throw Error('Invalid dual interruption')
 const valid=state.stimulusAtMs!==null&&state.feedbackAtMs!==null,channel=(name:'blue'|'red')=>{const response=state.responses[name];return {required:response.required,answered:valid&&response.required&&response.choice!==null,correct:valid&&response.required?response.choice===p[name]:null,rtMs:valid&&response.required&&response.atMs!==null?response.atMs-state.stimulusAtMs!:null,input:response.input}}
 return {valid,blue:channel('blue'),red:channel('red')}
}
export const medianDual=(values:number[])=>{if(!values.length)return null;const x=[...values].sort((a,b)=>a-b);return(x[Math.floor((x.length-1)/2)]+x[Math.floor(x.length/2)])/2}
