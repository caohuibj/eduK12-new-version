// Exact pure content projection. Backend SHA256: f5760e2743a992dbe6fd027a6ed7d796f0975bca7a7a157fa73ec661d9053732
import {same,initialHFState,reduceHFEvent,correctSide,type HFRaw,type HFPlan,type HFConfig} from './protocol'
export function reviewHF(raw:HFRaw,plan:HFPlan,config:HFConfig){if(!same(raw.plan,plan)||raw.endedAtPerfMs<raw.startedAtPerfMs)throw Error('Frozen plan or clock mismatch')
 const state=initialHFState();state.held=[...raw.initialHeld];let last=raw.startedAtPerfMs
 for(const event of raw.events){if(event.atMs<last||event.atMs>raw.endedAtPerfMs)throw Error('Nonmonotonic event clock');last=event.atMs;reduceHFEvent(state,event,plan,config,raw.startedAtPerfMs)}
 if(!same(state,raw.state))throw Error('Response state differs from replay')
 if(raw.status==='complete'&&(state.stage!=='complete'||state.completeMs!==raw.endedAtPerfMs||raw.stopReason!==null||raw.overflow))throw Error('Unexecuted trial claimed complete')
 if(raw.status==='interrupted'&&(!raw.stopReason||state.stage==='complete'))throw Error('Invalid interruption')
 const valid=state.onsetMs!==null&&state.closedMs!==null,response=state.response
 return {valid,answered:valid&&response!==null,correct:valid&&response!==null&&response.side===correctSide(plan.shape,plan.side),rtMs:valid&&response!==null?response.atMs-state.onsetMs!:null,input:valid?response?.input??null:null}
}
