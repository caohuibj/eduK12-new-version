import React, {useState} from 'react'
import type {CognitiveTaskProps} from '../../core/runner.types'
export function UnknownTask({trialIndex,onTrialComplete}:CognitiveTaskProps){
 const [phase,setPhase]=useState('instruction')
 if(phase==='instruction')return React.createElement('button',{onClick:()=>setPhase('practice')},'Unknown instructions: start practice')
 if(phase==='practice')return React.createElement('button',{onClick:()=>setPhase('formal')},'Practice response: start formal')
 return React.createElement('button',{onClick:()=>void onTrialComplete({correct:true})},`Unknown formal ${trialIndex}`)
}
export const unknownRunner = {testType:'TEST_ONBOARDING_UNKNOWN_V1',engineVersion:'1.0.0',RunnerComponent:UnknownTask}
