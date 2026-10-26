/** Bounded synthetic probe: JSON/canonicalization and native scorer only. No HTTP, DB, load test or rendering. */
import { performance } from 'node:perf_hooks'
import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { motConfig,motTrialPlan,motPosition,summarizeMotFrames,type MotProfile,type MotTrial } from '../../backend/src/modules/cognitive/content-candidates/mot/protocol'
import { motDefinition,createMotSnapshot } from '../../backend/src/modules/cognitive/content-candidates/mot/package'
import { runAuthoritativeScorer } from '../../backend/src/modules/cognitive/v2/authoritative-scorer'
import { FINAL_SUBMISSION_MAX_BYTES,prepareCanonicalSubmission } from '../../backend/src/services/instrumentFinalSubmit'
import { createUnifiedCognitiveRawSubmissionPayload,parseUnifiedCognitiveRawSubmissionPayload } from '../../backend/src/modules/cognitive/unified-raw-submission'
import type { TrialEnvelope } from '../../backend/src/modules/cognitive/v2/types'

const seed='mot-resource-probe-synthetic-v1'
const provenance={schemaVersion:1 as const,deviceClass:'TABLET' as const,administrationMode:'MIXED' as const}
function trialsFor(profile:MotProfile,frames:number):TrialEnvelope<MotTrial>[]{
 const config=motConfig(profile)
 return Array.from({length:config.totalTrials},(_,index)=>{
  const plan=motTrialPlan(config,seed,index),start=index*12000
  const payload:MotTrial={recordOrigin:'live',phase:'test',trialIndex:index,blockIndex:plan.blockIndex,speed:plan.speed,
   targetIds:plan.targetIds,initialObjects:plan.objects,startedAtPerfMs:start,cueStartedAtPerfMs:start+500,
   motionStartedAtPerfMs:start+1500,motionEndedAtPerfMs:start+9500,responseStartedAtPerfMs:start+10000,
   endedAtPerfMs:start+10500,completionTimeMs:10500,
   frameTiming:summarizeMotFrames(Array.from({length:frames},(_,f)=>f*8000/(frames-1))),
   calibration:{version:1,method:'ruler_and_distance_self_reported',referenceMm:50,referenceCssPx:200,viewingDistanceMm:350,viewportWidthCssPx:800,viewportHeightCssPx:900,devicePixelRatio:2,visualViewportScale:1,language:'zh'},
   responses:plan.targetIds.map((id,i)=>({objectId:id,...motPosition(plan.objects[id],8000,config),
    atPerfMs:start+10100+i*100,input:'keyboard' as const})),
   prematureInputs:0,missedInputs:0,ambiguousInputs:0,interactionEvents:[],interactionOverflow:false,interruptions:[],timedOut:false}
  return{schemaVersion:1,trialIndex:index,phase:'test',startedAtPerfMs:start,endedAtPerfMs:start+10500,
   durationMs:10500,flags:{timeout:false,premature:false},qualityEvents:[],payload}
 })
}
function percentile(values:number[],p:number){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)]}
const cases=[]
for(const profile of ['experience','research'] as const){
 for(const nominalHz of [60,90,120,240]){
  const frames=nominalHz*8+1,trials=trialsFor(profile,frames),session=createMotSnapshot(profile)
  const packet={trials,administrationProvenance:provenance},json=JSON.stringify(packet)
  const noProvenanceBytes=Buffer.byteLength(JSON.stringify({trials}))
  const firstStart=performance.now()
  runAuthoritativeScorer({definition:motDefinition,session,trials,randomSeed:seed})
  const firstScorerMs=performance.now()-firstStart
  const scoreSamples:number[]=[],canonicalSamples:number[]=[],parseSamples:number[]=[]
  for(let n=0;n<20;n++){
   let start=performance.now()
   JSON.parse(json);parseSamples.push(performance.now()-start)
   start=performance.now();prepareCanonicalSubmission(packet);canonicalSamples.push(performance.now()-start)
   start=performance.now();runAuthoritativeScorer({definition:motDefinition,session,trials,randomSeed:seed})
   scoreSamples.push(performance.now()-start)
  }
  const storedShape=createUnifiedCognitiveRawSubmissionPayload({attemptEpoch:1,trials,administrationProvenance:provenance})
  const readback=parseUnifiedCognitiveRawSubmissionPayload(JSON.parse(JSON.stringify(storedShape)))
  if(JSON.stringify(readback.administrationProvenance)!==JSON.stringify(provenance))throw Error('Provenance shape roundtrip failed')
  cases.push({profile,nominalHz,trialCount:trials.length,framesInSeparateArchivePerTrial:frames,jsonBytes:Buffer.byteLength(json),
   provenanceAdditionalBytes:Buffer.byteLength(json)-noProvenanceBytes,
   withinCurrentCanonicalBudget:Buffer.byteLength(json)<=FINAL_SUBMISSION_MAX_BYTES.cognitive,
   firstScorerMs,warmScorerMedianMs:percentile(scoreSamples,.5),warmScorerP95Ms:percentile(scoreSamples,.95),
   jsonParseP95Ms:percentile(parseSamples,.95),canonicalizeAndHashP95Ms:percentile(canonicalSamples,.95)})
 }
}
const maxFrames=trialsFor('research',3000),boundaryBytes=Buffer.byteLength(JSON.stringify({trials:maxFrames,administrationProvenance:provenance}))
const sourceFiles=['server-version/scripts/cognitive/mot-resource-probe.ts','server-version/backend/src/modules/cognitive/content-candidates/mot/protocol.ts','server-version/backend/src/modules/cognitive/content-candidates/mot/scorer.ts','server-version/backend/src/modules/cognitive/content-candidates/mot/schema.ts','server-version/backend/src/modules/cognitive/unified-raw-submission.ts','server-version/backend/src/services/instrumentFinalSubmit.ts']
const result={kind:'SYNTHETIC_CPU_AND_PAYLOAD_PROBE_NOT_SERVER_CAPACITY',node:process.version,
 hardwareContext:'task cloud container; CPU quota equivalent to 4 cores; 16 GiB memory limit',
 baseline:'ff8471e529e7b3c56e1e20f17d1e2581040fc896',bodyParserBytes:2*1024*1024,
 cognitiveCanonicalBudgetBytes:FINAL_SUBMISSION_MAX_BYTES.cognitive,cases,
 schemaFrameBoundary:{profile:'research',framesInSeparateArchivePerTrial:3000,jsonBytes:boundaryBytes,withinCurrentCanonicalBudget:boundaryBytes<=FINAL_SUBMISSION_MAX_BYTES.cognitive},
 sourceBindings:sourceFiles.map(file=>({file,sha256:createHash('sha256').update(readFileSync(resolve(file))).digest('hex')})),
 limitations:['Synthetic exact frame times are not physical-device traces or a payload maximum guarantee.',
 'The first invocation per case is recorded separately; process module initialization is not measured.',
 'No actual browser rendering, HTTP/auth/encryption/compression, database, report worker or concurrency capacity was measured.',
 'Provenance roundtrip checks the current strict raw payload shape in memory, not a new database persistence proof.',
 'This revised FINAL contains frame summaries only. Separate archive bytes and COS upload/assembly are not measured; global limits were not raised.']}
const output=process.argv[2]
if(output)writeFileSync(output,JSON.stringify(result,null,2)+'\n')
process.stdout.write(JSON.stringify(result,null,2)+'\n')
