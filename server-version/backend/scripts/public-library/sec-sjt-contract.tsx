/** SEC-SJT only. Bounded pure validators, scorer, trajectory and report SSR; no DB/CI. */
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import content from '../../src/modules/situational/instruments/sec-sjt-zh-hans/1.0.0/instrument.json'
import publication from '../../src/modules/situational/instruments/sec-sjt-zh-hans/1.0.0/publication.json'
import scientific from '../../src/modules/situational/instruments/sec-sjt-zh-hans/1.0.0/scientific.json'
import selected from '../../../../docs/public-library/sjt/sec-sjt/sec-sjt.zh-Hans-working.json'
import instructions from '../../../../docs/public-library/sjt/sec-sjt/instructions.de-zh-Hans.json'
import { instrumentSourceSchema, projectSituationPackage } from '../../src/modules/situational/onboarding/schema'
import { validateSituationPackage } from '../../src/modules/situational/situation-package'
import { scoreSituationalModel } from '../../src/modules/situational/situation-model-resolver'
import { asLinearSituationDefinition, runnerSituationRuntimeDefinition } from '../../src/modules/situational/situation-runtime-definition'
import { deriveAuthoritativeSituationalTrajectory, projectReachableSituationDefinitionForScoring, requiredReachableSituationalResponseKeys } from '../../src/modules/situational/situation-trajectory'
import { validateSituationalResponse, type SituationalResponse } from '../../src/modules/situational/situation-scoring'
import { selectPublishedSituationPackage } from '../../src/modules/situational/situation-package.registry'
import SituationalReportCard from '../../../frontend/src/modules/reporting/SituationalReportCard'
const source=instrumentSourceSchema.parse({content,publication,scientific}), pkg=projectSituationPackage(source), d=source.content.definition
assert.equal(d.schemaVersion,2)
if(d.schemaVersion!==2)throw new Error('V2 required')
const packageCheck=validateSituationPackage(pkg)
assert.equal(packageCheck.valid,true,JSON.stringify(packageCheck.issues))
assert.equal(d.scenes.length,11)
assert.equal(d.scoring.model?.expertKey?.length,50)
assert.equal(d.scoring.publishedMetrics.length,1)
assert.equal(d.scoring.publishedMetrics[0]?.direction,'descriptive')
assert.equal(d.report.narrative,undefined)
assert.equal(source.scientific.review,undefined)
assert.equal(source.publication.review,undefined)
assert.equal(source.publication.releaseStatus,'DRAFT')
assert.equal(selectPublishedSituationPackage([pkg],pkg.key),undefined)
assert.equal(selectPublishedSituationPackage([pkg],pkg.key,pkg.instrumentVersion),undefined)
const practice=instructions.practice.id
assert.ok(!d.scoring.model?.expertKey?.some(k=>k.sceneKey===practice))
const first=d.flow.nodes[0]!
assert.ok(first.nodeType==='SCENE'&&first.channelPolicies?.[0]?.measurementRole==='RAW_ONLY'&&first.channelPolicies[0].required===true)
assert.ok(d.flow.nodes.slice(1,-1).every(n=>n.nodeType==='SCENE'&&n.channelPolicies?.[0]?.measurementRole==='SCORED'&&n.channelPolicies[0].required===false))
assert.ok(d.flow.nodes.every(n=>n.nodeType==='TERMINAL'||n.transition.type==='NEXT'))
for(const [i,item] of selected.items.entries()){
 const scene=d.scenes[i+1]!,channel=scene.channels[0]!
 assert.ok(scene.stimulus.text?.endsWith(item.stem_zh_Hans))
 if(channel.responseType!=='SINGLE_CHOICE')throw new Error('single required')
 assert.deepEqual(channel.options.map(o=>o.label),item.options.map(o=>o.text_zh_Hans))
 for(const option of item.options) assert.equal(d.scoring.model?.expertKey?.find(k=>k.sceneKey===item.id&&k.optionKey===String(option.option_number))?.contribution,Number(option.option_number===item.keyed_option_1based))
}
const pc=d.scenes[0]!.channels[0]!
if(pc.responseType!=='SINGLE_CHOICE')throw new Error('practice single required')
assert.deepEqual(pc.options.map(o=>o.label),instructions.practice.options.map(o=>o.text_zh_Hans))
assert.ok(d.scenes[0]!.stimulus.text?.includes(instructions.practice.stem_zh_Hans))
for(const p of instructions.source_instruction.paragraphs)assert.ok(d.scenes[0]!.stimulus.text?.includes(p.zh_Hans))
for(const p of instructions.post_practice_instruction.paragraphs)assert.ok(d.scenes[1]!.stimulus.text?.includes(p.zh_Hans))
const linear=asLinearSituationDefinition(d)
function resultFor(responses:SituationalResponse[]){
 responses.forEach(r=>validateSituationalResponse(linear,r))
 const trajectory=deriveAuthoritativeSituationalTrajectory(d,responses)
 assert.equal(trajectory.reachedTerminal,true)
 assert.equal(trajectory.sceneKeys.length,11)
 assert.deepEqual(requiredReachableSituationalResponseKeys(d,trajectory),[practice+':choice'])
 const scoring=projectReachableSituationDefinitionForScoring(d,trajectory)
 assert.equal(scoring.scenes.length,10)
 assert.ok(!scoring.scenes.some(s=>s.sceneKey===practice))
 const result=scoreSituationalModel(scoring,responses.filter(r=>r.sceneKey!==practice))
 assert.deepEqual(result.metrics[0]?.range,{min:0,max:10})
 assert.equal(result.metrics[0]?.expectedResponses.length,10)
 assert.ok(!result.metrics[0]?.contributions?.some(c=>c.responseKey.startsWith(practice+':')))
 return result
}
for(const c of source.content.goldenCases)assert.equal(resultFor(c.responses).metrics[0]?.value,c.expected.metrics['sec-sjt-raw-total'])
const all=source.content.goldenCases[0]!.responses
for(const option of ['1','2','3','4','5'])assert.equal(resultFor(all.map(r=>r.sceneKey===practice?{...r,responseValue:option}:r)).metrics[0]?.value,10)
for(const item of selected.items){const result=resultFor(all.filter(r=>r.sceneKey!==item.id));assert.equal(result.metrics[0]?.value,null);assert.equal(result.quality.status,'invalid')}
const finalProjection=projectReachableSituationDefinitionForScoring(d,deriveAuthoritativeSituationalTrajectory(d,all))
const finalWithRawPractice=scoreSituationalModel(finalProjection,all,{responsesValidated:true})
assert.equal(finalWithRawPractice.metrics[0]?.value,10)
assert.ok(!finalWithRawPractice.metrics[0]?.contributions?.some(c=>c.responseKey.startsWith(practice+':')))
const none=resultFor(all.slice(0,1));assert.equal(none.metrics[0]?.value,null)
assert.equal(deriveAuthoritativeSituationalTrajectory(d,all.slice(1)).reachedTerminal,false)
for(const value of ['0','6','1,2','not-an-option',0,6])assert.throws(()=>validateSituationalResponse(linear,{sceneKey:selected.items[0]!.id,channelKey:'choice',responseValue:value}))
assert.throws(()=>validateSituationalResponse(linear,{sceneKey:'unknown',channelKey:'choice',responseValue:'1'}))
const scoring=projectReachableSituationDefinitionForScoring(d,deriveAuthoritativeSituationalTrajectory(d,all))
assert.throws(()=>scoreSituationalModel(scoring,[...all.slice(1),all[1]!]))
const runner=JSON.stringify(runnerSituationRuntimeDefinition(d));assert.ok(!runner.includes('expertKey')&&!runner.includes('contribution'))
assert.ok(runner.includes('可以留空或退出；任一正式题缺答，本次不计算总分'))
const html=(result:ReturnType<typeof resultFor>)=>renderToStaticMarkup(<SituationalReportCard report={{itemId:'sec-contract',type:'SITUATIONAL',kind:'situational',label:d.source.title??null,metrics:result.metrics,metricOrder:d.report.metricOrder,interpretations:d.report.interpretations,disclaimer:d.report.disclaimer}} />)
for(const result of [resultFor(all),none]){const h=html(result);assert.equal((h.match(/原始范围 0–10/g)??[]).length,1);assert.ok(h.includes('不计算总分'));assert.ok(h.includes('15岁0个月至24岁11个月'));assert.ok(h.includes('CC BY-SA'));assert.ok(!h.includes('原始范围 0–100'))}
assert.ok(html(none).includes('—'))
console.log(JSON.stringify({status:'PASS',sourceSchemaAndV2Validator:true,practiceResponsesExcluded:5,formalItems:10,formalKeys:50,goldenCases:4,individualMissingCases:10,allMissingNull:true,optionalTrajectoryTerminal:true,invalidInputsRejected:8,rawPracticeExcluded:true,reportNumericAndNullSSR:true,draftPublishedSelectorRejected:true}))
