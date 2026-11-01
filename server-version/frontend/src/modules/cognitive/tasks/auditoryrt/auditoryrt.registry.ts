import { deferredCognitiveRunner } from '../../core/deferred-runner'
const AuditoryrtTask = deferredCognitiveRunner(() => import('./AuditoryrtTask').then(module => module.AuditoryrtTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const auditoryrtRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'auditoryrt',
  name: '听觉简单反应时',
  engineVersion: '1.0.1',
  readiness: {
    category: 'timed-response',
    inputs: ['keyboard', 'pointer', 'touch'],
    orientation: 'any',
    globalKeyboardCapture: true,
    resumeDisposition: 'restart-required',
    resumeReason: '音频启动、等待/发声与当前响应计时阶段未独立持久化。',
    frozenMediaSlots: ['instruction', 'example', 'stimulus'],
  },
  scoringVersion: '1.0.0',
  RunnerComponent: AuditoryrtTask, prepareRunner: AuditoryrtTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'medianRtMs', label: '中位反应时', unit: 'ms', displayType: 'ms' },
    { key: 'meanRtMs', label: '平均反应时', unit: 'ms', displayType: 'ms' },
    { key: 'rtSdMs', label: '反应时标准差', unit: 'ms', displayType: 'ms' },
    { key: 'rtCv', label: '反应时波动系数', displayType: 'number' },
    { key: 'validCount', label: '有效试次数', displayType: 'number' },
    { key: 'anticipationCount', label: '抢拍次数', displayType: 'number' },
    { key: 'lapseCount', label: '漏失次数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '听觉反应速度表现',
    headlineMetric: 'medianRtMs',
    summaryMetrics: ['rtCv', 'anticipationCount', 'lapseCount'],
    indexLabel: '听觉反应指数',
    practicalTips: ['在安静环境施测，音量调到清晰可闻。', '手保持放松，听到声音立即按键，不要抢拍。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
