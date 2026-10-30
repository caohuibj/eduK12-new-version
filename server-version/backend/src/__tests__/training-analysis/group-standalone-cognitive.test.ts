import {expect, it, vi} from 'vitest'
vi.hoisted(()=>{process.env.DATA_ENCRYPTION_KEY='b'.repeat(64)})
import {freezeAssignmentProfile, readFrozenReport} from '../../modules/cognitive/profile-freeze'
import {requireCognitiveRegistryEntry} from '../../modules/cognitive/cognitive.registry'
import type {CognitiveResultSnapshot} from '../../modules/cognitive/v2/types'
import {trainingStandaloneCognitiveFacts, type TrainingStandaloneCognitiveSession} from '../../modules/training-analysis/group-source'

const frozen=freezeAssignmentProfile({entry:requireCognitiveRegistryEntry('gonogo','1.0.0','1.0.0'),profile:'standard',baseConfig:{totalTrials:120,nogoRatio:.25,stimulusMs:800,isiMs:500,validRtFloorMs:100,report:{reportVersion:"1.0.0",referenceMode:"none"}}})
const report=readFrozenReport(frozen.resolvedReportSnapshotEncrypted)!
const metric=Object.values(report.v2MetricDefinitions!).find(row=>row.valueType==='number'&&row.unit==='ms'&&row.visibility!=='hidden'&&row.visibility!=='research_only')!
const result=(value:number|null):CognitiveResultSnapshot=>({schemaVersion:1,completedAt:'2026-10-30T00:00:00.000Z',testType:'gonogo',configVersion:'1.0.0',engineVersion:'1.0.0',scoringVersion:'1.0.0',protocolSignature:'a'.repeat(64),profile:'standard',metrics:{[metric.key]:value},quality:{state:'interpretable',flags:{},reasons:[]},references:[],assessmentContext:null,report:{headline:[],user:[{key:metric.key,value,unit:metric.unit}],detail:[]}})
const session=(id:string,day:number,value:number|null):TrainingStandaloneCognitiveSession=>({id,userId:id,participantKey:id,attemptNo:1,status:'COMPLETED',finishedAt:`2026-10-${day}T00:00:00.000Z`,result:result(value)})
const facts=(sessions:TrainingStandaloneCognitiveSession[])=>trainingStandaloneCognitiveFacts({assignmentId:'assignment',resolvedConfigHash:frozen.resolvedConfigHash,report,sessions})!

it('selects the completed session first, preserves zero and missing, and respects persisted report visibility',()=>{
 const old=session('same',28,350),latest={...session('latest',29,null),userId:'same'},unfinished={...session('draft',30,999),userId:'same',status:'IN_PROGRESS'}
 const hidden=session('hidden',29,123);hidden.result!.report.user=[]
 const source=facts([old,latest,unfinished,session('zero',29,0),hidden])
 expect(source.selected.map(row=>row.id)).toEqual(['latest','zero','hidden'])
 expect(source.observations.filter(row=>row.metricKey===metric.key).map(row=>[row.parentId,row.value])).toEqual([['latest',null],['zero',0],['hidden',null]])
 const missing={...latest,result:null}
 expect(facts([old,missing,session('other',29,300)]).observations.find(row=>row.parentId==='latest'&&row.metricKey===metric.key)).toMatchObject({value:null,missingReason:'MISSING_SOURCE'})
 expect(source.definitions.some(row=>['productIndex','product_index'].includes(row.key))).toBe(false)
 expect(source.definitions.every(row=>!['hidden','research_only'].includes(report.v2MetricDefinitions![row.key].visibility)&&report.v2MetricDefinitions![row.key].role!=='research_only')).toBe(true)
})

it('keeps protocol, Profile and published units separate instead of pooling incompatible values',()=>{
 const a=session('a',29,300),b=session('b',29,400)
 b.result!.protocolSignature='b'.repeat(64)
 expect(()=>facts([a,b])).toThrow(/协议/)
 b.result!.protocolSignature=a.result!.protocolSignature;b.result!.profile='experience'
 expect(()=>facts([a,b])).toThrow(/Profile/)
 b.result!.profile='standard';(b.result!.report.user as Array<{unit:string}>)[0].unit='ratio'
 expect(()=>facts([a,b])).toThrow(/单位/)
})
