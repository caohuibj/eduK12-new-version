const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'../../..')
const dir=path.join(root,'server-version/backend/src/modules/cognitive/content-candidates/ant')
const out=path.join(root,'server-version/frontend/src/modules/cognitive/tasks/ant/generated')
const protocol=fs.readFileSync(path.join(dir,'protocol.ts'),'utf8')
const scorer=fs.readFileSync(path.join(dir,'scorer.ts'),'utf8')
const hash=text=>crypto.createHash('sha256').update(text).digest('hex')
const importLine="import type { ProtocolDefinition, TrialEnvelope } from '../../v2/types'"
if(!protocol.startsWith(importLine))throw Error('ANT pure protocol import boundary changed')
const types=`type ProtocolDefinition={schemaVersion:1;key:string;version:string;clock:'performance';randomizationAlgorithmVersion:string;trialEnvelopeVersion:1;phases:{key:'test'|'learning'|'delayed';persists:boolean;required:boolean}[];measurementCriticalConfigPaths:string[]}
type TrialEnvelope<T>={schemaVersion:1;trialIndex:number;phase:'test'|'learning'|'delayed';startedAtPerfMs:number;endedAtPerfMs:number;durationMs:number;flags:{timeout:boolean;premature:boolean};qualityEvents:('visibility_lost'|'window_blur'|'runner_restart')[];payload:T}
`
const begin=scorer.indexOf('interface Tally '),end=scorer.indexOf('const tally=')
const projection=scorer.indexOf('/** Sole candidate user/report/export projection.')
if(begin<0||end<begin||projection<end)throw Error('ANT report projection boundary changed')
const scoreType=`export type AntScoreResult={metrics:Record<string,unknown>;quality:{state:'interpretable'|'limited'|'invalid';flags:Record<string,boolean>;reasons:string[]};audit:{trialCount:number;scorerVersion:string}}\ntype CognitiveScoreResult=AntScoreResult\n`
const outputs={
 'protocol.ts':`// Pure ANT protocol projection. Backend SHA256: ${hash(protocol)}\n`+protocol.replace(importLine,types),
 'report.ts':`// Exact ANT report projection, no scorer/runtime imports. Backend SHA256: ${hash(scorer)}\nimport { CUES,INPUTS,type Cue,type Flanker,type Input } from './protocol'\n`+scoreType+scorer.slice(begin,end)+scorer.slice(projection),
}
for(const [name,text] of Object.entries(outputs)){
 const target=path.join(out,name)
 if(process.argv.includes('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==text)throw Error('ANT projection drift: '+name)}
 else{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(target,text)}
}
process.stdout.write('ANT pure protocol/report projections match backend source hashes\n')
