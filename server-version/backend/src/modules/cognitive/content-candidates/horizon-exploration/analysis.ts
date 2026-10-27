import {initialHorizonState,reduceHorizonEvent,same,type HorizonRaw,type HorizonPlan,type HorizonConfig,type Side} from './protocol'
export interface FirstFree {gameIndex:number;seenLeft:number;seenRight:number;observedMeanLeft:number;observedMeanRight:number;observedMeanDifference:number;choice:Side;lessSide:Side|null;chosenLess:boolean|null;observedHigherSide:Side|null;chosenHigher:boolean|null;input:string}
export function reviewHorizon(raw:HorizonRaw,p:HorizonPlan,c:HorizonConfig) {
 if(!same(raw.plan,p)||raw.endedAtPerfMs<raw.startedAtPerfMs)throw Error('Horizon frozen plan/clock differs')
 const state=initialHorizonState(raw.startedAtPerfMs);let last=raw.startedAtPerfMs
 for(const e of raw.events){if(e.atMs<last||e.atMs>raw.endedAtPerfMs)throw Error('Horizon event clock differs');last=e.atMs;reduceHorizonEvent(state,e,p,c)}
 if(!same(state,raw.state))throw Error('Horizon state differs from event replay')
 if(raw.status==='complete'&&(state.stage!=='complete'||state.completeAtMs!==raw.endedAtPerfMs||raw.stopReason!==null||raw.overflow))throw Error('Unexecuted Horizon game claimed complete')
 if(raw.status==='interrupted'&&(raw.stopReason===null||state.stage==='complete'))throw Error('Invalid Horizon interruption')
 let first:FirstFree|null=null
 if(state.choices.length>=5){const forced=state.choices.slice(0,4),left=forced.filter(x=>x.side==='left'),right=forced.filter(x=>x.side==='right'),a=left.reduce((n,x)=>n+x.reward,0)/left.length,b=right.reduce((n,x)=>n+x.reward,0)/right.length,choice=state.choices[4],higher:Side|null=a===b?null:a>b?'left':'right';first={gameIndex:p.index,seenLeft:left.length,seenRight:right.length,observedMeanLeft:a,observedMeanRight:b,observedMeanDifference:a-b,choice:choice.side,lessSide:p.lessSampledSide,chosenLess:p.lessSampledSide===null?null:choice.side===p.lessSampledSide,observedHigherSide:higher,chosenHigher:higher===null?null:choice.side===higher,input:choice.input}}
 return {first,completed:state.stage==='complete',totalChoices:state.choices.length,totalReward:state.choices.reduce((n,x)=>n+x.reward,0),laterFreeChoices:Math.max(0,state.choices.length-5)}
}
