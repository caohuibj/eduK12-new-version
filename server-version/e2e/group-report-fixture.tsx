import React from 'react'
import { createRoot } from 'react-dom/client'
import { SurveyGroupReports } from '../frontend/src/survey/SurveyGroupReports'
import type { TaskGroupArtifact } from '../frontend/src/modules/reporting/TaskGroupReport'

declare global { interface Window { groupReportRequests: Array<{ method: string; path: string }> } }
window.groupReportRequests = []
const artifact: TaskGroupArtifact = { artifactId: '00000000-0000-4000-8000-000000000001', generatedAt: '2026-10-30T00:00:00Z', projection: {
  title: '学习体验 · 群体报告', sourceLabel: '秋季学习活动', cutoff: '2026-10-29T00:00:00Z', populationLabel: '本波次全部合格已完成答卷',
  completedN: 120, countUnit: 'RESPONSE', assignedN: null, tool: { key: 'learning', title: '学习体验', kind: 'FORM' },
  metrics: [{ key: 'hours', label: '本周自习小时', type: 'NUMBER', unit: '小时', validN: 114, missingN: 6, mean: 3.2, sdSample: 1.8,
    range: null, observedRange: { min: 0, max: 8 }, qualityCounts: {}, measurement: { source: 'synthetic' }, frequencies: [] },
  { key: 'activities', label: '参加的学习活动', type: 'MULTIPLE', unit: null, validN: 110, missingN: 10, mean: null, sdSample: null,
    range: null, observedRange: null, qualityCounts: {}, measurement: { source: 'synthetic' }, frequencies: [
      { value: 'read', label: '自主阅读', count: 88, proportion: .8 }, { value: 'talk', label: '小组讨论', count: 77, proportion: .7 },
    ] }], limitations: ['完成答卷数不代表去重人数；各指标使用各自有效样本。', '多选比例以该题有效作答数为分母，合计可能超过 100%。', '描述统计不代表诊断、常模或干预效果。'] } }
let current = artifact
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  window.groupReportRequests.push({ method, path })
  const base = '/projects/project/analytics/waves/wave/group-reports'
  if (path === base && method === 'GET') return { tools: [{ instrumentKey: 'learning', title: '学习体验', kind: 'FORM' }], artifacts: [current, artifact].filter((row, i, all) => all.findIndex(value => value.artifactId === row.artifactId) === i).map(({ artifactId, generatedAt }) => ({ artifactId, generatedAt })) } as T
  if (path === base && method === 'POST' && (body as { instrumentKey?: string })?.instrumentKey === 'learning') {
    current = { ...artifact, artifactId: '00000000-0000-4000-8000-000000000002' }; return current as T
  }
  if (method === 'GET' && [artifact.artifactId, current.artifactId].some(id => path === `${base}/${id}`)) return (path.endsWith(artifact.artifactId) ? artifact : current) as T
  throw new Error('Unknown fixture request: ' + method + ' ' + path)
}
createRoot(document.getElementById('root')!).render(<><header>合成 UI 合同预览；不代表后端授权验收</header><main>
  <SurveyGroupReports projectId="project" waveId="wave" request={request} /></main></>)
