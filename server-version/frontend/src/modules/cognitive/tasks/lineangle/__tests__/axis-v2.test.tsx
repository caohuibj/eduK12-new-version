import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe,it,expect } from 'vitest'
import { AxisFigure } from '../AxisFigure'
import { buildLineangleTrialsV2,axisAngle,axisDistance } from '../prng'
import { scoreLineangleV2 } from '../../../../../../../backend/src/modules/cognitive/scoring/lineangle.v2'
import { scoreLineangleV1 } from '../../../../../../../backend/src/modules/cognitive/scoring/lineangle.v1'
import { lineangleV2ConfigSchema } from '../../../../../../../backend/src/modules/cognitive/schemas/lineangle.v2.config'
import fixture from '../../../../../../../backend/src/modules/cognitive/tasks/lineangle/fixtures/2.0.0-2.0.0.json'
const config={totalTrials:4,angleStepDeg:15,optionCount:4,minAngleSepSteps:2,fixationMs:500,timeoutMs:8000,validRtFloorMs:300,report:{reportVersion:'2.0.0',referenceMode:'none' as const}}
const row=(targetAngle:number,optionAngles:number[],responseAngle:number|null,rtMs:number|null)=>({trialIndex:0,payload:{targetAngle,optionAngles,responseAngle,rtMs,interrupted:false}})
describe('unoriented v2 stimulus and score',()=>{
 it('matches committed v2 natural report and rejection fixtures',()=>{for(const c of fixture.cases){if('expectedError' in c)expect(()=>scoreLineangleV2(c.input as any)).toThrow(c.expectedError);else expect(scoreLineangleV2(c.input as any)).toEqual(c.expected)}})
 it('identical 0/180 renders share correctness; old scorer remains frozen',()=>{expect(renderToStaticMarkup(<AxisFigure angle={0}/>)).toBe(renderToStaticMarkup(<AxisFigure angle={180}/>));const input={config:{...config,totalTrials:1},trials:[row(0,[180,45,90,135],180,400)]};expect(scoreLineangleV2(input).metrics.accuracy).toBe(1);expect(()=>scoreLineangleV1(input)).toThrow()})
 it('rejects visually duplicate alternatives instead of distinguishing right/wrong',()=>{expect(()=>scoreLineangleV2({config:{...config,totalTrials:1},trials:[row(0,[0,180,45,90],180,400)]})).toThrow(/distinct/)})
 it('both profiles generate deterministic unique axes with circular distractor distance, all selectable targets score correctly',()=>{for(const count of [12,60])for(const seed of ['a','b','horizontal','boundary']){const trials=buildLineangleTrialsV2(seed,count,15,4,2);expect(trials).toEqual(buildLineangleTrialsV2(seed,count,15,4,2));for(const t of trials){expect(t.optionAngles).toHaveLength(4);expect(new Set(t.optionAngles.map(axisAngle)).size).toBe(4);expect(t.optionAngles.filter(a=>a===t.targetAngle)).toHaveLength(1);for(const a of t.optionAngles)if(a!==t.targetAngle)expect(axisDistance(a,t.targetAngle)).toBeGreaterThanOrEqual(30)}const r=scoreLineangleV2({config:{...config,totalTrials:count},trials:trials.map((t,trialIndex)=>({trialIndex,payload:{...t,responseAngle:t.targetAngle,rtMs:400,interrupted:false}}))});expect(r.metrics).toMatchObject({accuracy:1,medianRtMs:400})}})
 it('preserves valid zero vs timeout, errors, interruption and natural report values',()=>{const trials=[row(0,[0,30,60,90],0,400),row(0,[0,30,60,90],null,null),row(0,[0,30,60,90],30,500),row(90,[0,30,60,90],90,600)].map((t,trialIndex)=>({...t,trialIndex}));trials[3].payload.interrupted=true;const r=scoreLineangleV2({config,trials});expect(r.metrics).toMatchObject({accuracy:.5,errorCount:1,timeoutCount:1,validRtCount:2,medianRtMs:500});expect(r.qualityFlags.interrupted).toBe(true)})
 it('rejects impossible option settings',()=>{expect(lineangleV2ConfigSchema.safeParse(config).success).toBe(true);expect(lineangleV2ConfigSchema.safeParse({...config,angleStepDeg:45}).success).toBe(false)})
})
