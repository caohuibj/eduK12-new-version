import {describe,expect,it} from 'vitest'
import {createHFSnapshot} from '../../modules/cognitive/content-candidates/hearts-flowers/package'
import {hfPlan,correctSide,type HFPlan,type HFRaw} from '../../modules/cognitive/content-candidates/hearts-flowers/protocol'
import {scoreHF,hfEnvelope} from '../../modules/cognitive/content-candidates/hearts-flowers/scorer'
import {projectHFReport} from '../../modules/cognitive/content-candidates/hearts-flowers/report'

const session=createHFSnapshot('experience'),randomSeed='hf-keyboard-identity-review',plan=hfPlan(session.config,randomSeed)[0]
/** A recorded first answer after a press/release; state is literal so malformed source events reach authoritative replay. */
function record(p:HFPlan,key:string,token:string,held:string[]=[],releaseHeld=false):HFRaw {
 const side=correctSide(p.shape,p.side),atMs=releaseHeld?112:110
 return {plan:p,startedAtPerfMs:100,endedAtPerfMs:atMs+1000,status:'complete',stopReason:null,initialHeld:held,ignoredRepeatCount:0,overflow:false,
  events:[{kind:'onset',atMs:110},...(releaseHeld?[{kind:'up' as const,atMs:111,side,input:'keyboard' as const,token:'key:'+key,key,repeat:false}]:[]),{kind:'down',atMs,side,input:'keyboard',token,key,repeat:false},{kind:'up',atMs:atMs+1,side,input:'keyboard',token,key,repeat:false},{kind:'finish',atMs:atMs+1000}],
  state:{stage:'complete',onsetMs:110,closedMs:atMs,completeMs:atMs+1000,endReason:'response',response:{side,atMs,input:'keyboard',token,key},held:releaseHeld?[]:held,ignored:{early:0,held:0,late:0}}}
}
const score=(raw:HFRaw)=>scoreHF({session,config:session.config,randomSeed,trials:[hfEnvelope(raw)]})
describe('Hearts and flowers keyboard identity at first response',()=>{
 it.each(['arrow','focused'] as const)('rejects a %s key that evades its held baseline under a different token',kind=>{
  const side=correctSide(plan.shape,plan.side),key=kind==='arrow'?(side==='left'?'ArrowLeft':'ArrowRight'):`focus:${side}:Space`
  expect(()=>score(record(plan,key,'another-token',['key:'+key]))).toThrow('Keyboard token mismatch')
 })
 it('retains real zero RT and fresh release/press for both arrow and focused Space/Enter paths',()=>{
  const side=correctSide(plan.shape,plan.side)
  for(const key of [side==='left'?'ArrowLeft':'ArrowRight',`focus:${side}:Space`,`focus:${side}:Enter`,`focus:${side}:NumpadEnter`]){
   const zero=projectHFReport(score(record(plan,key,'key:'+key)))
   expect(zero.groups!.heartOnly.inputs.keyboard).toMatchObject({answered:1,correct:1,correctRTCount:1,meanCorrectMs:0})
   expect(projectHFReport(score(record(plan,key,'key:'+key,['key:'+key],true))).groups!.heartOnly.inputs.keyboard.meanCorrectMs).toBe(2)
  }
 })
})
