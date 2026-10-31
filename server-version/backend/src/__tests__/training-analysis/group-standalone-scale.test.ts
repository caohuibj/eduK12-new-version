import {expect,it} from 'vitest'
import {MIXED_SCALE_DEFINITION} from '../questionnaire/product-fixtures'
import {createFrozenScaleRuntimeSnapshot} from '../../modules/assessment-runtime/runtime-snapshot'
import {buildScaleResult} from '../../modules/scale/scale-result'
import {trainingStandaloneScaleFacts,trainingStandaloneScaleMeasurement} from '../../modules/training-analysis/group-source'
const definition={...structuredClone(MIXED_SCALE_DEFINITION),versionAxes:{schemaVersion:1 as const,subjectKey:'synthetic_scale',locale:'zh-CN',localizationVersion:'1'}}
const freeze=(value=definition)=>createFrozenScaleRuntimeSnapshot({instrumentKey:'synthetic_scale',instrumentVersion:'1.0.0',definition:value})
const result=(runtime:ReturnType<typeof freeze>)=>buildScaleResult({scaleId:'scale',instrumentKey:runtime.instrumentKey,name:'Synthetic',instrumentVersion:runtime.instrumentVersion,definition:runtime.definition,answers:[{itemCode:'mixed-scale-item-1',responseValue:'no'}]})

it('adapts official Scale zero, missing and signed values with their true ranges; changes to R do not change C',()=>{
 const runtime=freeze(),saved=result(runtime)
 const projection=trainingStandaloneScaleFacts(runtime,[{id:'zero',scaleId:'scale',runtime,result:saved},{id:'missing',scaleId:'scale',runtime,result:null}])
 expect(projection.observations.map(row=>[row.parentId,row.value,row.missingReason])).toEqual([['zero',0,null],['missing',null,'MISSING_SOURCE']])
 expect(projection.definitions[0]).toMatchObject({key:'total',unit:'score',range:{min:0,max:1}})
 const revised=structuredClone(definition);revised.report.reportVersion='2.0.1';revised.report.interpretations[0].summary='Revised report wording'
 const r=freeze(revised)
 expect(r.compiledRuntime.compiledRuntimeHash).not.toBe(runtime.compiledRuntime.compiledRuntimeHash)
 expect(trainingStandaloneScaleMeasurement(r)).toEqual(trainingStandaloneScaleMeasurement(runtime))
 expect(()=>trainingStandaloneScaleFacts(runtime,[{id:'same-c',scaleId:'scale',runtime:r,result:result(r)}])).not.toThrow()
 const changed=structuredClone(definition);changed.responseSets[0].options[0].score=-1
 const c=freeze(changed)
 expect(()=>trainingStandaloneScaleFacts(runtime,[{id:'new-c',scaleId:'scale',runtime:c,result:result(c)}])).toThrow(/测量版本/)
 expect(trainingStandaloneScaleFacts(c,[{id:'signed',scaleId:'scale',runtime:c,result:result(c)}]).observations[0].value).toBe(-1)
})
