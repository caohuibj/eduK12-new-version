import {describe,it,expect} from 'vitest'
import {createSpatialMemorySnapshot} from '../../modules/cognitive/content-candidates/precision-working-memory/package'
import {spatialPlan,targetAngle,position,type SpatialRaw} from '../../modules/cognitive/content-candidates/precision-working-memory/protocol'
import {scoreSpatialMemory,spatialEnvelope} from '../../modules/cognitive/content-candidates/precision-working-memory/scorer'

function record(){
  const session=createSpatialMemorySnapshot('experience'),randomSeed='spatial-first-selection-review',plan=spatialPlan(session.config,randomSeed)[0]
  const encoding=100+plan.itiMs,retention=encoding+500,prompt=retention+1000,selected=prompt+100,confirmed=prompt+300,angle=targetAngle(plan),xy=position(angle)
  const raw:SpatialRaw={plan,status:'complete',stopReason:null,startedAtPerfMs:100,encodingOnsetMs:encoding,retentionOnsetMs:retention,responseOnsetMs:prompt,endedAtPerfMs:confirmed,
    warningAtMs:null,signedErrorDeg:0,eventOverflow:false,response:{angleDeg:angle,...xy,rawX:xy.x,rawY:xy.y,input:'touch',firstSelectedAtMs:selected,lastAdjustedAtMs:selected+100,confirmedAtMs:confirmed},
    events:[{kind:'select',atMs:selected,angleDeg:angle,input:'touch'},{kind:'release',atMs:selected+100,angleDeg:angle,input:'touch'},{kind:'confirm',atMs:confirmed,angleDeg:angle,input:'touch'}]}
  const score=(value:SpatialRaw)=>scoreSpatialMemory({session,config:session.config,randomSeed,trials:[spatialEnvelope(value)]})
  return {raw,score}
}
describe('spatial first selection record integrity',()=>{
  it('excludes a first selection timestamp that has no matching first input event',()=>{
    const {raw,score}=record();expect(score(raw).metrics.validTrialCount).toBe(1)
    raw.response!.firstSelectedAtMs-=50
    expect(score(raw).metrics.validTrialCount).toBe(0)
  })
  it('excludes a release-only trace without an actual initial selection',()=>{
    const {raw,score}=record();raw.events.shift();raw.response!.firstSelectedAtMs=raw.events[0].atMs
    expect(score(raw).metrics.validTrialCount).toBe(0)
  })
})
