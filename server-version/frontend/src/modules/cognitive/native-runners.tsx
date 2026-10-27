import {lazy,Suspense} from 'react'
import React from 'react'
import type {CognitiveFrontendRegistryEntry} from './registry'
import type {CognitiveTaskProps} from './core/runner.types'
const loadEnumeration=()=>import('./tasks/enumeration/NativeEnumerationRunner')
const Enumeration=lazy(()=>loadEnumeration().then(m=>({default:m.NativeEnumerationRunner})))
const EnumerationRunner=(props:CognitiveTaskProps)=><Suspense fallback={<p role="status">正在准备测验…</p>}><Enumeration {...props}/></Suspense>
const load=()=>import('./tasks/mot/NativeMotRunner')
const Mot=lazy(()=>load().then(m=>({default:m.NativeMotRunner})))
const Runner=(props:CognitiveTaskProps)=><Suspense fallback={<p role="status">正在准备测验…</p>}><Mot {...props}/></Suspense>
/** Native entries remain separate from the legacy score-based generated registry. */
export const nativeCognitiveRunnerEntries:CognitiveFrontendRegistryEntry[]=[{
 testType:'enumeration',name:'点数判断',engineVersion:'0.2.0',scoringVersion:'0.2.0',RunnerComponent:EnumerationRunner,
 prepareRunner:async()=>{await loadEnumeration()},completionMode:'task',metricDefinitions:[],
 reportDefinition:{title:'这次的点数判断记录',headlineMetric:'',summaryMetrics:[],showProductIndex:false,disclaimer:'这里只描述本轮作答，不代表稳定能力。'},
},{
 testType:'mot',name:'多目标追踪',engineVersion:'1.1.1',scoringVersion:'1.1.0',RunnerComponent:Runner,
 prepareRunner:async()=>{await load()},completionMode:'task',metricDefinitions:[],
 reportDefinition:{title:'这次的追踪记录',headlineMetric:'',summaryMetrics:[],showProductIndex:false,
 disclaimer:'这里只描述本轮任务，不代表日常最多能同时注意几件事。'},
}]
