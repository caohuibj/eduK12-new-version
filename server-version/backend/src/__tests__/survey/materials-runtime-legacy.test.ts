import { describe,it,expect } from 'vitest'
import golden from './fixtures/materials-runtime-legacy.json'
import {compileTrainingFlow,scanTrainingFlow} from '../../modules/assessment-core/flow/training'
import {compileSurveyFlow} from '../../modules/survey/flow.definition'
import {executeSurveyFlow,buildSurveyFlowPublicProjection} from '../../modules/survey/flow.runtime'

describe('c0cd982 runtime byte compatibility golden',()=>{
 it('preserves old V1 frozen config and both pending/completed path bytes',()=>{
  const config=compileTrainingFlow(golden.input,golden.units as any)
  expect(JSON.stringify(config)).toBe(JSON.stringify(golden.config))
  expect(JSON.stringify(scanTrainingFlow(config,golden.units as any,{}))).toBe(JSON.stringify(golden.paths[0]))
  expect(JSON.stringify(scanTrainingFlow(config,golden.units as any,{first:{status:'ACCEPTED',answers:{answer:'yes'},acceptedHash:'fact-hash',requirementSatisfied:true,hasValidMeasurement:true}}))).toBe(JSON.stringify(golden.paths[1]))
 })
 it('preserves Survey full execution and public projection JSON property order',()=>{
  const flow=compileSurveyFlow(golden.surveyInput,golden.units as any,'SINGLE_UNLINKED')
  const execution=executeSurveyFlow({snapshot:{flow,units:golden.units} as any,answers:{first:{answer:'yes'}},assignment:golden.assignment as any,clientObservedBlocks:['assigned_material','welcome','first_block'],evaluateUnit:()=>golden.result as any})
  expect(JSON.stringify(execution)).toBe(golden.executionString)
  expect(JSON.stringify(buildSurveyFlowPublicProjection(flow,golden.assignment as any))).toBe(golden.projectionString)
 })
})
