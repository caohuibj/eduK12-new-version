import {z} from 'zod'
import type {AuthoritativeScorerInput,CognitiveScoreResult,TrialEnvelope} from '../../v2/types'
import {parseSessionConfigSnapshot} from '../../v2/session-snapshot'
import {parseTrialEnvelope} from '../../v2/trial-envelope'
import {SEARCH_IDENTITY,SEARCH_PROTOCOL,searchPlan,same,type SearchConfig,type SearchRaw} from './protocol'
import {searchConfigSchema,searchRawSchema} from './schema'
import {reviewSearch,medianSearch} from './analysis'
import type {SearchGroup} from './report'
export const searchEnvelope=(raw:SearchRaw):TrialEnvelope<SearchRaw>=>({schemaVersion:1,trialIndex:raw.plan.index,phase:'test',condition:raw.plan.condition,startedAtPerfMs:raw.startedAtPerfMs,endedAtPerfMs:raw.endedAtPerfMs,durationMs:raw.endedAtPerfMs-raw.startedAtPerfMs,flags:{timeout:false,premature:false},qualityEvents:raw.status==='interrupted'?['resume']:[],payload:raw})
export function scoreSearch(input:AuthoritativeScorerInput<SearchConfig,SearchRaw>):CognitiveScoreResult{const call=z.object({session:z.unknown(),config:z.unknown(),randomSeed:z.string().min(1).max(256),trials:z.array(z.unknown()).max(180)}).strict().parse(input),s=parseSessionConfigSnapshot<SearchConfig>(call.session)
 if(s.testType!==SEARCH_IDENTITY.testType||s.engineVersion!==SEARCH_IDENTITY.engineVersion||s.scoringVersion!==SEARCH_IDENTITY.scoringVersion||s.configVersion!==SEARCH_IDENTITY.configVersion||!same(s.protocol,SEARCH_PROTOCOL)||(s.referenceBindings?.length??0)>0)throw Error('Unsupported exact search identity')
 const c=searchConfigSchema.parse(s.config);if(!same(c,searchConfigSchema.parse(call.config)))throw Error('Search config differs from snapshot');const plan=searchPlan(c,call.randomSeed);if(call.trials.length>plan.length)throw Error('Search profile budget exceeded')
 type Acc=SearchGroup&{search:number[];locate:number[]};const fresh=():Acc=>({planned:0,received:0,valid:0,correct:0,correctRTCount:0,medianSearchMs:null,medianLocateMs:null,search:[],locate:[]}),sizes:Record<string,Acc>={},colours:Record<string,Acc>={},targets:Record<string,Acc>={},cells:Record<string,Acc>={}
 for(const p of plan)for(const [object,key] of [[sizes,String(p.setSize)],[colours,p.targetColour],[targets,String(p.targetCount)],[cells,p.condition]] as const){object[key]??=fresh();object[key].planned++}
 const phaseInputs:{search:Record<string,number>;locate:Record<string,number>}={search:{},locate:{}};let valid=0,correct=0,technical=0,previousEnd:number|null=null
 for(const [index,value] of call.trials.entries()){const e=parseTrialEnvelope<SearchRaw>(value),raw=searchRawSchema.parse(e.payload)
  if(e.phase!=='test'||e.trialIndex!==index||e.condition!==plan[index].condition||e.startedAtPerfMs!==raw.startedAtPerfMs||e.endedAtPerfMs!==raw.endedAtPerfMs||e.durationMs!==raw.endedAtPerfMs-raw.startedAtPerfMs||(previousEnd!==null&&raw.startedAtPerfMs<previousEnd))throw Error('Search envelope/clock ownership mismatch');previousEnd=raw.endedAtPerfMs
  const row=reviewSearch(raw,plan[index],c),groups=[sizes[plan[index].setSize],colours[plan[index].targetColour],targets[plan[index].targetCount],cells[plan[index].condition]];for(const g of groups)g.received++
  const usable=row.valid&&!e.flags.timeout&&!e.flags.premature&&e.qualityEvents.length===0
  if(!usable)technical++
  if(usable){valid++;for(const g of groups)g.valid++;phaseInputs.search[row.searchInput!]=(phaseInputs.search[row.searchInput!]??0)+1;phaseInputs.locate[row.locateInput!]=(phaseInputs.locate[row.locateInput!]??0)+1
   if(row.correct){correct++;for(const g of groups){g.correct++;g.search.push(row.searchMs!);g.locate.push(row.locateMs!)}}}
 }
 const project=(object:Record<string,Acc>):Record<string,SearchGroup>=>Object.fromEntries(Object.entries(object).map(([key,g])=>[key,{planned:g.planned,received:g.received,valid:g.valid,correct:g.correct,correctRTCount:g.correct,medianSearchMs:medianSearch(g.search),medianLocateMs:medianSearch(g.locate)}]))
 const flags={noValidTrials:valid===0,incompleteRecords:valid!==c.totalTrials,technicalLoss:technical>0}
 return {metrics:{validTrialCount:valid,receivedTrialCount:call.trials.length,expectedTrialCount:c.totalTrials,correctTrialCount:correct,accuracy:valid?correct/valid:null,bySetSize:project(sizes),byColour:project(colours),byTargetCount:project(targets),conditions:project(cells),phaseInputs,reportBinding:{...SEARCH_IDENTITY,profile:c.profile,configHash:s.configHash,protocolSignature:s.protocolSignature,reportDefinitionVersion:c.reportDefinitionVersion}},quality:{state:flags.noValidTrials?'invalid':Object.values(flags).some(Boolean)?'limited':'interpretable',flags,reasons:Object.entries(flags).filter(([,v])=>v).map(([k])=>k)},audit:{trialCount:call.trials.length,scorerVersion:SEARCH_IDENTITY.scoringVersion}}
}
