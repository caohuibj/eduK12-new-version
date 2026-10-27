import {normalizeAngle,position,signedError,targetAngle,type Input,type SpatialConfig,type SpatialPlan,type SpatialRaw} from './generated/protocol'
export type SpatialStage='iti'|'encoding'|'retention'|'response'|'complete'
/** Captures actual transitions only. A delayed callback never fabricates unshown stages. */
export class SpatialCapture {
  stage:SpatialStage='iti';readonly raw:SpatialRaw;selection:{angleDeg:number;input:Input;rawX:number|null;rawY:number|null;firstSelectedAtMs:number;lastAdjustedAtMs:number}|null=null
  private lastTime:number;dragging=false
  constructor(readonly config:SpatialConfig,plan:SpatialPlan,now:number){this.lastTime=now;this.raw={plan:structuredClone(plan),status:'interrupted',stopReason:null,startedAtPerfMs:now,
    encodingOnsetMs:null,retentionOnsetMs:null,responseOnsetMs:null,endedAtPerfMs:now,warningAtMs:null,signedErrorDeg:null,response:null,events:[],eventOverflow:false}}
  private clock(now:number){if(!Number.isFinite(now)||now<this.lastTime)throw Error('Nonmonotonic spatial clock');this.lastTime=now}
  tick(now:number){if(this.stage==='complete')return;this.clock(now);const r=this.raw,p=r.plan.phase==='practice'?this.config.practice:this.config
    if(this.stage==='iti'&&now-r.startedAtPerfMs>=r.plan.itiMs){r.encodingOnsetMs=now;this.stage='encoding'}
    else if(this.stage==='encoding'&&now-r.encodingOnsetMs!>=p.encodingMs){r.retentionOnsetMs=now;this.stage='retention'}
    else if(this.stage==='retention'&&now-r.retentionOnsetMs!>=p.retentionMs){r.responseOnsetMs=now;this.stage='response'}
    else if(this.stage==='response'&&r.warningAtMs===null&&now-r.responseOnsetMs!>=this.config.warningMs)r.warningAtMs=now
  }
  private event(kind:SpatialRaw['events'][number]['kind'],now:number){if(this.raw.events.length>=256){this.raw.eventOverflow=true;this.interrupt('input-overflow',now);return}
    this.raw.events.push({kind,atMs:now,angleDeg:this.selection!.angleDeg,input:this.selection!.input})}
  pointer(now:number,x:number,y:number,input:Exclude<Input,'keyboard'>,kind:'down'|'move'|'up',primary=true){
    if(this.stage!=='response')return;this.clock(now)
    if(!primary){this.interrupt('multiple-pointer',now);return}
    const radius=Math.hypot(x-150,y-150)
    if(!Number.isFinite(radius)||radius<90||radius>130){if(kind==='up')this.dragging=false;return}
    if((kind==='move'||kind==='up')&&!this.dragging)return
    this.selection={angleDeg:normalizeAngle(Math.atan2(y-150,x-150)*180/Math.PI),input,rawX:x,rawY:y,
      firstSelectedAtMs:this.selection?.firstSelectedAtMs??now,lastAdjustedAtMs:now}
    if(kind==='down'){this.dragging=true;this.event('select',now)}else if(kind==='up'){this.dragging=false;this.event('release',now)}
  }
  keyboard(now:number,delta:number|null){if(this.stage!=='response'||this.dragging)return;this.clock(now)
    if(delta!==null&&!this.selection)return
    this.selection={angleDeg:normalizeAngle(delta===null?this.raw.plan.keyboardStartAngle:this.selection!.angleDeg+delta),input:'keyboard',rawX:null,rawY:null,
      firstSelectedAtMs:this.selection?.firstSelectedAtMs??now,lastAdjustedAtMs:now};this.event('keyboard',now)
  }
  confirm(now:number){if(this.stage!=='response'||!this.selection||this.dragging)return false;this.clock(now);this.event('confirm',now)
    if(this.raw.eventOverflow)return false
    this.raw.response={...this.selection,...position(this.selection.angleDeg),confirmedAtMs:now};this.raw.signedErrorDeg=signedError(this.selection.angleDeg,targetAngle(this.raw.plan));this.raw.status='complete';this.raw.endedAtPerfMs=now;this.stage='complete';return true
  }
  interrupt(reason:string,now:number){if(this.stage==='complete')return;this.clock(now);this.raw.status='interrupted';this.raw.stopReason=reason;this.raw.endedAtPerfMs=now;this.stage='complete'}
}
