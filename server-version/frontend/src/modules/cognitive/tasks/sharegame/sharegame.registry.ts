import { deferredCognitiveRunner } from '../../core/deferred-runner'
const SharegameTask = deferredCognitiveRunner(() => import('./SharegameTask').then(module => module.SharegameTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const sharegameRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'sharegame',
  name: '分享决策',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: SharegameTask, prepareRunner: SharegameTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'givingRate', label: '给出比例', displayType: 'percentage' },
    { key: 'equalSplitCount', label: '对半分轮数', displayType: 'number' },
    { key: 'generousRate', label: '对半及以上比例', displayType: 'percentage' },
    { key: 'givingRateSd', label: '给出比例波动', displayType: 'percentage' },
    { key: 'medianDecisionMs', label: '决策用时中位数', unit: 'ms', displayType: 'ms' },
  ],
  reportDefinition: {
    title: '分享决策表现',
    headlineMetric: 'givingRate',
    summaryMetrics: ['generousRate', 'equalSplitCount'],
    indexLabel: '分享偏好指数',
    practicalTips: ['没有对错：按你真实的分配习惯选择即可。', '不同轮次的金额不同，先看清楚本轮总额。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}

export const sharegameRegistryEntryV2:CognitiveFrontendRegistryEntry={
  ...sharegameRegistryEntry,engineVersion:'2.0.0',scoringVersion:'2.0.0',
  metricDefinitions:[...sharegameRegistryEntry.metricDefinitions,
    {key:'plannedRounds',label:'计划轮数',displayType:'number'},
    {key:'answeredRounds',label:'有效选择轮数',displayType:'number'},
    {key:'timeoutRounds',label:'超时未答轮数',displayType:'number'},
    {key:'omittedRounds',label:'未响应轮数',displayType:'number'},
    {key:'zeroChoiceCount',label:'明确选择零轮数',displayType:'number'},
    {key:'responseRate',label:'有效选择覆盖率',displayType:'percentage'},
    {key:'answeredEndowment',label:'有效轮次点数总额',displayType:'number'},
  ],
  reportDefinition:{...sharegameRegistryEntry.reportDefinition,showProductIndex:false,indexLabel:undefined,
    summaryMetrics:['answeredRounds','timeoutRounds','omittedRounds','zeroChoiceCount'],
    practicalTips:['只统计有效选择，未答不补零；明确选择零仍是真实选择。'],
    disclaimer:'描述本次有效选择，不作人格或品德判断。'},
}
