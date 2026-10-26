// Cloud review fixture only: source the authoritative projection in Node, never bundle its scorer in the browser.
const fs=require('node:fs'),path=require('node:path')
const root=path.resolve(__dirname,'../../../../../..')
const base=path.join(root,'server-version/backend/src/modules/cognitive/content-candidates/ant')
const {createAntSnapshot}=require(path.join(base,'package.ts'))
const {antPlan,antTrialEnvelope}=require(path.join(base,'protocol.ts'))
const {scoreAnt,projectAntReport}=require(path.join(base,'scorer.ts'))
const session=createAntSnapshot('experience'),seed='ant-cloud-preview-v1'
const records=antPlan(session.config,seed).map(plan=>{
 const start=plan.trialIndex*4000,cue=start+plan.plannedPreCueMs,target=cue+500
 const latency={none:420,central:390,double:360,spatial_valid:370}[plan.cue]+{congruent:20,incongruent:70,neutral:40}[plan.flanker]
 return {...plan,phase:'test',recordOrigin:'live',clock:{source:'performance',timeOriginUnixMs:1700000000000},
  startedAtPerfMs:start,cueOnsetPerfMs:cue,cueOffsetPerfMs:cue+100,targetOnsetPerfMs:target,targetOffsetPerfMs:target+latency,
  endedAtPerfMs:start+4000,events:[{direction:plan.direction,input:'touch',atPerfMs:target+latency,repeat:false,held:false}],
  responseIndex:0,timedOut:false,eventOverflow:false,interruptions:[]}
})
const limited=structuredClone(records)
limited[0].interruptions.push({kind:'visibility_lost',atPerfMs:limited[0].targetOnsetPerfMs})
const reports={}
for(const [key,trials] of [['interpretable',records],['limited',limited],['invalid',[]]]){
 const result=scoreAnt({session,config:session.config,randomSeed:seed,trials:trials.map(antTrialEnvelope)})
 reports[key]={contextId:'ant-synthetic-report',configHash:session.configHash,protocolSignature:session.protocolSignature,
  projection:projectAntReport(result),qualityFlags:result.quality.flags}
}
fs.writeFileSync(path.join(__dirname,'preview-data.json'),JSON.stringify({config:session.config,seed,configHash:session.configHash,
 protocolSignature:session.protocolSignature,reports,fixture:true},null,2)+'\n')
console.log('Synthetic review data projected in cloud Node; not participant data')
