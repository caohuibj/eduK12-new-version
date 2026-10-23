import { deferredCognitiveRunner } from '../../core/deferred-runner'
import type { CognitiveFrontendRegistryEntry } from '../../registry'
const SimonTask = deferredCognitiveRunner(() => import('./SimonTask').then(m => m.SimonTask))
export const simonRegistryEntry: CognitiveFrontendRegistryEntry = { testType: 'simon', name: 'Simon 空间干扰任务', engineVersion: '1.0.0', scoringVersion: '1.0.0', RunnerComponent: SimonTask, prepareRunner: SimonTask.prepare, metricDefinitions: [{ key: 'simonEffectMeanMs', label: '空间干扰用时差', unit: 'ms', displayType: 'ms' }, { key: 'accuracy', label: '正确率', displayType: 'percentage' }], reportDefinition: { title: 'Simon 描述性结果', headlineMetric: 'simonEffectMeanMs', summaryMetrics: ['accuracy'], showProductIndex: false, disclaimer: 'PILOT；无常模或诊断含义；软件时序未经物理校准。' } }
