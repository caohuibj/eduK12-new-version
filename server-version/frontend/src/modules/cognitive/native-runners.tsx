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

const loadBlink=()=>import('./tasks/attentional-blink/NativeBlinkRunner')
const Blink=lazy(()=>loadBlink().then(m=>({default:m.NativeBlinkRunner})))
const BlinkReport=lazy(()=>loadBlink().then(m=>({default:m.NativeContentReport})))
nativeCognitiveRunnerEntries.push({testType:'attentional-blink',name:'注意瞬脱',engineVersion:'0.1.0',scoringVersion:'0.1.0',completionMode:'task',
 RunnerComponent:props=><Suspense fallback={<p role="status">正在准备测验…</p>}><Blink {...props}/></Suspense>,
 NativeReportComponent:props=><Suspense fallback={<p role="status">正在读取已保存报告…</p>}><BlinkReport {...props}/></Suspense>,
 prepareRunner:async()=>{await loadBlink()},metricDefinitions:[],reportDefinition:{title:'本次记录',headlineMetric:'',summaryMetrics:[],showProductIndex:false},
})

const loadEffort=()=>import('./tasks/balloon-effort/NativeEffortRunner')
const Effort=lazy(()=>loadEffort().then(m=>({default:m.NativeEffortRunner})))
const EffortReport=lazy(()=>loadEffort().then(m=>({default:m.NativeContentReport})))
nativeCognitiveRunnerEntries.push({testType:'balloon-effort',name:'气球努力',engineVersion:'0.1.0',scoringVersion:'0.1.0',completionMode:'task',
 RunnerComponent:props=><Suspense fallback={<p role="status">正在准备测验…</p>}><Effort {...props}/></Suspense>,
 NativeReportComponent:props=><Suspense fallback={<p role="status">正在读取已保存报告…</p>}><EffortReport {...props}/></Suspense>,
 prepareRunner:async()=>{await loadEffort()},metricDefinitions:[],reportDefinition:{title:'本次记录',headlineMetric:'',summaryMetrics:[],showProductIndex:false},
})

const loadDual=()=>import('./tasks/dual-arrow/NativeDualRunner')
const Dual=lazy(()=>loadDual().then(m=>({default:m.NativeDualRunner})))
const DualReport=lazy(()=>loadDual().then(m=>({default:m.NativeContentReport})))
nativeCognitiveRunnerEntries.push({testType:'dual-arrow',name:'双箭头',engineVersion:'0.1.0',scoringVersion:'0.1.0',completionMode:'task',
 RunnerComponent:props=><Suspense fallback={<p role="status">正在准备测验…</p>}><Dual {...props}/></Suspense>,
 NativeReportComponent:props=><Suspense fallback={<p role="status">正在读取已保存报告…</p>}><DualReport {...props}/></Suspense>,
 prepareRunner:async()=>{await loadDual()},metricDefinitions:[],reportDefinition:{title:'本次记录',headlineMetric:'',summaryMetrics:[],showProductIndex:false},
})

const loadGrad=()=>import('./tasks/gradcpt/NativeGradRunner')
const Grad=lazy(()=>loadGrad().then(m=>({default:m.NativeGradRunner})))
const GradReport=lazy(()=>loadGrad().then(m=>({default:m.NativeContentReport})))
nativeCognitiveRunnerEntries.push({testType:'gradcpt',name:'渐变持续注意',engineVersion:'0.1.0',scoringVersion:'0.1.0',completionMode:'task',
 RunnerComponent:props=><Suspense fallback={<p role="status">正在准备测验…</p>}><Grad {...props}/></Suspense>,
 NativeReportComponent:props=><Suspense fallback={<p role="status">正在读取已保存报告…</p>}><GradReport {...props}/></Suspense>,
 prepareRunner:async()=>{await loadGrad()},metricDefinitions:[],reportDefinition:{title:'本次记录',headlineMetric:'',summaryMetrics:[],showProductIndex:false},
})

const loadHF=()=>import('./tasks/hearts-flowers/NativeHFRunner')
const HF=lazy(()=>loadHF().then(m=>({default:m.NativeHFRunner})))
const HFReport=lazy(()=>loadHF().then(m=>({default:m.NativeContentReport})))
nativeCognitiveRunnerEntries.push({testType:'hearts-flowers',name:'心与花',engineVersion:'0.1.0',scoringVersion:'0.1.0',completionMode:'task',
 RunnerComponent:props=><Suspense fallback={<p role="status">正在准备测验…</p>}><HF {...props}/></Suspense>,
 NativeReportComponent:props=><Suspense fallback={<p role="status">正在读取已保存报告…</p>}><HFReport {...props}/></Suspense>,
 prepareRunner:async()=>{await loadHF()},metricDefinitions:[],reportDefinition:{title:'本次记录',headlineMetric:'',summaryMetrics:[],showProductIndex:false},
})

const loadHorizon=()=>import('./tasks/horizon-exploration/NativeHorizonRunner')
const Horizon=lazy(()=>loadHorizon().then(m=>({default:m.NativeHorizonRunner})))
const HorizonReport=lazy(()=>loadHorizon().then(m=>({default:m.NativeContentReport})))
nativeCognitiveRunnerEntries.push({testType:'horizon-exploration',name:'Horizon探索',engineVersion:'0.1.0',scoringVersion:'0.1.0',completionMode:'task',
 RunnerComponent:props=><Suspense fallback={<p role="status">正在准备测验…</p>}><Horizon {...props}/></Suspense>,
 NativeReportComponent:props=><Suspense fallback={<p role="status">正在读取已保存报告…</p>}><HorizonReport {...props}/></Suspense>,
 prepareRunner:async()=>{await loadHorizon()},metricDefinitions:[],reportDefinition:{title:'本次记录',headlineMetric:'',summaryMetrics:[],showProductIndex:false},
})

const loadSpatial=()=>import('./tasks/precision-working-memory/NativeSpatialRunner')
const Spatial=lazy(()=>loadSpatial().then(m=>({default:m.NativeSpatialRunner})))
const SpatialReport=lazy(()=>loadSpatial().then(m=>({default:m.NativeContentReport})))
nativeCognitiveRunnerEntries.push({testType:'precision-working-memory',name:'空间位置精度',engineVersion:'0.1.0',scoringVersion:'0.1.0',completionMode:'task',
 RunnerComponent:props=><Suspense fallback={<p role="status">正在准备测验…</p>}><Spatial {...props}/></Suspense>,
 NativeReportComponent:props=><Suspense fallback={<p role="status">正在读取已保存报告…</p>}><SpatialReport {...props}/></Suspense>,
 prepareRunner:async()=>{await loadSpatial()},metricDefinitions:[],reportDefinition:{title:'本次记录',headlineMetric:'',summaryMetrics:[],showProductIndex:false},
})

const loadSearch=()=>import('./tasks/visual-search/NativeSearchRunner')
const Search=lazy(()=>loadSearch().then(m=>({default:m.NativeSearchRunner})))
const SearchReport=lazy(()=>loadSearch().then(m=>({default:m.NativeContentReport})))
nativeCognitiveRunnerEntries.push({testType:'visual-search-two-stage',name:'视觉搜索',engineVersion:'0.1.0',scoringVersion:'0.1.0',completionMode:'task',
 RunnerComponent:props=><Suspense fallback={<p role="status">正在准备测验…</p>}><Search {...props}/></Suspense>,
 NativeReportComponent:props=><Suspense fallback={<p role="status">正在读取已保存报告…</p>}><SearchReport {...props}/></Suspense>,
 prepareRunner:async()=>{await loadSearch()},metricDefinitions:[],reportDefinition:{title:'本次记录',headlineMetric:'',summaryMetrics:[],showProductIndex:false},
})
