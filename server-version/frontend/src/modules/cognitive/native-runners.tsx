import {lazy,Suspense} from 'react'
import React from 'react'
import type {CognitiveFrontendRegistryEntry} from './registry'
import type {CognitiveTaskProps} from './core/runner.types'
const load=()=>import('./tasks/mot/NativeMotRunner')
const Mot=lazy(()=>load().then(m=>({default:m.NativeMotRunner})))
const Runner=(props:CognitiveTaskProps)=><Suspense fallback={<p role="status">正在准备测验…</p>}><Mot {...props}/></Suspense>
/** Native entries remain separate from the legacy score-based generated registry. */
export const nativeCognitiveRunnerEntries:CognitiveFrontendRegistryEntry[]=[{
 testType:'mot',name:'多目标追踪',engineVersion:'1.1.1',scoringVersion:'1.1.0',RunnerComponent:Runner,
 prepareRunner:async()=>{await load()},completionMode:'task',metricDefinitions:[],
 reportDefinition:{title:'这次的追踪记录',headlineMetric:'',summaryMetrics:[],showProductIndex:false,
 disclaimer:'这里只描述本轮任务，不代表日常最多能同时注意几件事。'},
}]
