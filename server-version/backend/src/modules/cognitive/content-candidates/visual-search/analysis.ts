import {same,initialSearchState,reduceSearchEvent,type SearchRaw,type SearchPlan,type SearchConfig} from './protocol'
export function reviewSearch(raw:SearchRaw,p:SearchPlan,c:SearchConfig){if(!same(raw.plan,p)||raw.endedAtPerfMs<raw.startedAtPerfMs)throw Error('Search frozen plan/clock mismatch');const s=initialSearchState();let last=raw.startedAtPerfMs
 for(const e of raw.events){if(e.atMs<last||e.atMs>raw.endedAtPerfMs)throw Error('Search event clock mismatch');last=e.atMs;reduceSearchEvent(s,e,p,c,raw.startedAtPerfMs)}
 if(!same(s,raw.state))throw Error('Search state differs from actual events')
 if(raw.status==='complete'&&(s.stage!=='complete'||s.searchAtMs===null||s.locateAtMs===null||s.selection===null||s.selectionAtMs!==raw.endedAtPerfMs||raw.stopReason!==null||raw.overflow))throw Error('Unexecuted search trial claimed complete')
 if(raw.status==='interrupted'&&(raw.stopReason===null||s.stage==='complete'))throw Error('Invalid search interruption')
 const valid=raw.status==='complete';let correct:boolean|null=null
 if(valid){const selection=s.selection!;correct=selection.kind==='none'?p.targetCount===0:p.items.some(i=>i.id===selection.id&&i.target)}
 return {valid,correct,searchMs:valid?s.locateAtMs!-s.searchAtMs!:null,locateMs:valid?s.selectionAtMs!-s.locateAtMs!:null,searchInput:s.searchInput,locateInput:s.locateInput}
}
export const medianSearch=(v:number[])=>{if(!v.length)return null;const x=[...v].sort((a,b)=>a-b);return(x[Math.floor((x.length-1)/2)]+x[Math.floor(x.length/2)])/2}
