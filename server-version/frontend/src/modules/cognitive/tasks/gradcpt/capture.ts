import type {GradConfig,GradRaw,GradSlot,GradInput} from './generated/protocol'
/** Local rAF paint log, no probes/uploads. A late callback advances one actual transition, never invents skipped images. */
export class GradCapture {
 readonly raw:GradRaw;private last:number;index=0;opacity=0;done=false
 constructor(readonly config:GradConfig,plan:GradSlot[],now:number){this.last=now;this.raw={plan:structuredClone(plan),startedAtPerfMs:now,endedAtPerfMs:now,status:'interrupted',stopReason:null,slots:[{index:0,startMs:now,endMs:null}],frames:[{atMs:now,slotIndex:0,opacity:0}],events:[],overflow:false}}
 private clock(now:number){if(!Number.isFinite(now)||now<this.last)throw Error('Nonmonotonic gradCPT clock');this.last=now}
 tick(now:number){if(this.done)return;this.clock(now);if(this.raw.frames.length>=120000){this.raw.overflow=true;this.interrupt('frame-log-bound',now);return}
  const slot=this.raw.slots[this.index],plan=this.raw.plan[this.index],elapsed=now-slot.startMs
  if(elapsed>=plan.durationMs){slot.endMs=now;if(this.index+1===this.raw.plan.length){this.opacity=1;this.raw.frames.push({atMs:now,slotIndex:this.index,opacity:1});this.raw.status='complete';this.raw.stopReason=null;this.raw.endedAtPerfMs=now;this.done=true;return}
   this.index++;this.opacity=0;this.raw.slots.push({index:this.index,startMs:now,endMs:null})
  }else this.opacity=Math.round(Math.min(1,elapsed/plan.durationMs)*1e6)/1e6
  this.raw.frames.push({atMs:now,slotIndex:this.index,opacity:this.opacity})
 }
 event(now:number,type:'down'|'up',token:string,input:GradInput,repeat=false,primary=true){if(this.done)return;this.clock(now);if(this.raw.events.length>=8192){this.raw.overflow=true;this.interrupt('input-log-bound',now);return}
  this.raw.events.push({atMs:now,slotIndex:this.index,opacity:this.opacity,type,token,input,repeat,primary})}
 interrupt(reason:string,now:number){if(this.done)return;this.clock(now);this.raw.endedAtPerfMs=now;this.raw.stopReason=reason;this.raw.status='interrupted';this.done=true}
}
