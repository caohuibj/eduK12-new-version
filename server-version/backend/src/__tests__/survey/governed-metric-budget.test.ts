import {afterAll,expect,it} from 'vitest'
import {compileCognitiveRuntime} from '../../modules/assessment-runtime/compiler'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {createSessionConfigSnapshot} from '../../modules/cognitive/v2/session-snapshot'
import {compileResearchCognitive,initialCognitiveDefinition,surveyCognitiveTaskDefinition,SURVEY_GONOGO_CONFIG} from '../../modules/survey/cognitive.definition'
import {packageReportWorstCaseBytes,jsonBytes} from '../../modules/survey/governed-package.budget'
import {artifactReference,type GovernedArtifact} from '../../modules/survey/governed-tool.model'
import {computeGovernedTrial} from '../../modules/survey/governed-tool.trial'
import type {CatalogSourceSnapshot} from '../../modules/survey/catalog.sources'
afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await (await import('../../config/database')).prisma.$disconnect()})
it.each(['ms','汉\u0000"'.repeat(400)])('bounds actual cognitive metric metadata including escaped long units (%#. variant)',unit=>{
 const original=surveyCognitiveTaskDefinition(),definition={...original,metrics:{...original.metrics,goMedianRtMs:{...original.metrics.goMedianRtMs,unit}}}
 const runtime=compileCognitiveRuntime({definition,instrumentVersion:'1.0.0'})
 const frozen=compileResearchCognitive(initialCognitiveDefinition())
 frozen.sessionSnapshot=createSessionConfigSnapshot({definition,configVersion:'1.1.0',config:SURVEY_GONOGO_CONFIG,frozenAt:new Date('2026-10-17T00:00:00Z'),runtime:{runtimeGeneration:'UNIFIED_V1',compiledRuntime:runtime,referenceBindings:[]}})
 const {measurementDigest:_,feedback,...measurement}=frozen
 frozen.measurementDigest=canonicalHash(measurement)
 const source={ref:{kind:'COGNITIVE',sourceId:'synthetic',sourceVersion:'1'},title:'Synthetic',compiledDefinition:frozen,displayDefinition:frozen,definitionDigest:canonicalHash(frozen),scoringDigest:frozen.measurementDigest,adapterVersion:'survey-catalog-v1',provenance:{}} as CatalogSourceSnapshot
 const a:GovernedArtifact={schemaVersion:1,family:'BUNDLE',toolKey:'synthetic',version:'1',title:'Synthetic',unit:null,parameters:null,report:null,components:[{slotKey:'tool',title:'Synthetic',source:{type:'GOVERNED',id:'synthetic',hash:'a'.repeat(64)},unit:source}],packageReport:{version:'1',title:'Synthetic',introduction:'',disclaimer:'',blocks:Array.from({length:200},()=>({type:'METRIC' as const,slotKey:'tool',metricKey:'goMedianRtMs',label:'Synthetic'}))},reference:artifactReference('BUNDLE','synthetic',{})}
 const rendered=computeGovernedTrial(a,'synthetic',0).result.report!
 expect(rendered.blocks[0]).toMatchObject({unit})
 const bound=packageReportWorstCaseBytes(a.packageReport!,a.components,a.title)
 expect(bound).toBeGreaterThan(jsonBytes({schemaVersion:1,packageTitle:a.title,packageVersionHash:'a'.repeat(64),reportVersion:'1',sourceFinalHash:'b'.repeat(64),report:rendered}))
 expect(bound).toBeGreaterThan(200*jsonBytes(unit))
})
