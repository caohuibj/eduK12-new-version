import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {beforeEach, expect, it, vi} from 'vitest'
const m = vi.hoisted(() => ({get: vi.fn(), post: vi.fn(), sources: vi.fn()}))
vi.mock('../api/client', () => ({default: {get: m.get, post: m.post}, sessionFetch: vi.fn()}))
vi.mock('../api/trainingAnalysis', () => ({trainingAnalysisApi: {sources: m.sources}}))
import {TrainingGroupReports} from './TrainingGroupReports'
import TrainingCourseAnalysis from './TrainingCourseAnalysis'
import type {TaskGroupArtifact} from '../modules/reporting/TaskGroupReport'

const old: TaskGroupArtifact = {artifactId: 'old', generatedAt: '2026-10-30T00:00:00Z', projection: {
  title: '学习体验 · 群体报告', sourceLabel: '课程任务', cutoff: '2026-10-30T00:00:00Z', populationLabel: '全部合格完成作答', completedN: null, countUnit: 'PERSON', assignedN: null, tool: {key: 'FORM:section', title: '学习体验', kind: 'FORM'}, limitations: ['现有最小样本要求'], metrics: [
    {key: 'total', label: '原始分数', type: 'NUMBER', unit: null, range: null, observedRange: null, validN: null, missingN: null, mean: null, sdSample: null, state: 'suppressed', qualityCounts: {}, measurement: {}, frequencies: []},
  ]}}
const base = '/courses/course/training-group-reports'
const tool = {key: 'FORM:section', title: '学习体验', kind: 'FORM', source: {taskId: 'task', publication: '2026-10-30T00:00:00Z', configDigest: null, variantKey: null}}
beforeEach(() => {
  vi.clearAllMocks()
  m.get.mockImplementation(async (path: string) => ({code: 0, data: path === base ? {tasks: [{id: 'task', name: '课程任务'}], artifacts: [{taskId: 'task', artifactId: 'old', generatedAt: old.generatedAt}]} : path.includes('/sources/') ? {tools: [tool]} : old}))
  m.post.mockResolvedValue({code: 0, data: {...old, artifactId: 'new'}})
})
it('opens stored artifacts without discovery or generation and hides suppressed values in reading and print markup', async () => {
  render(<TrainingCourseAnalysis courseId="course" actorId="teacher" />)
  expect(m.sources).not.toHaveBeenCalled(); expect(m.get).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', {name: '打开群体报告'}))
  await screen.findByRole('article', {name: '群体报告阅读'})
  expect(m.get.mock.calls.map(([path]) => path)).toEqual([base, `${base}/task/old`])
  expect(m.post).not.toHaveBeenCalled(); expect(m.sources).not.toHaveBeenCalled()
  expect(screen.getByText(/有效样本未达到/)).toBeVisible()
  expect(screen.queryByText('均值')).not.toBeInTheDocument()
})
it('explicitly loads the selected tool, generates one new version and reopens the old one', async () => {
  render(<TrainingGroupReports courseId="course" />)
  fireEvent.click(screen.getByRole('button', {name: '打开群体报告'})); await screen.findByRole('article', {name: '群体报告阅读'})
  fireEvent.click(screen.getByRole('button', {name: '选择工具与版本'})); await screen.findByLabelText('群体报告工具')
  fireEvent.click(screen.getByRole('button', {name: '生成更新版报告'}))
  await waitFor(() => expect(screen.getByLabelText('群体报告版本')).toHaveValue('new'))
  expect(m.post).toHaveBeenCalledTimes(1); expect(m.post).toHaveBeenCalledWith(base, {taskId: 'task', toolKey: 'FORM:section', publication: tool.source.publication, configDigest: null, variantKey: null})
  fireEvent.change(screen.getByLabelText('群体报告版本'), {target: {value: 'old'}})
  await waitFor(() => expect(screen.getByLabelText('群体报告版本')).toHaveValue('old'))
  expect(m.post).toHaveBeenCalledTimes(1)
})
it('continues a typed standalone cursor and appends sources without resetting the selection',async()=>{
 const cursor='cognitive-assignment:10000000-0000-4000-8000-000000000001'
 const original=m.get.getMockImplementation()!
 m.get.mockImplementation(async(path:string)=>path===base?{code:0,data:{tasks:[{id:'task',name:'当前任务'}],taskId:'task',artifacts:[],nextTaskId:cursor}}
  :path.startsWith(base+'?')?{code:0,data:{tasks:[{id:'task',name:'当前任务'},{id:'scale-course:older',name:'更早独立量表'}],artifacts:[],nextTaskId:null}}:original(path))
 render(<TrainingGroupReports courseId="course"/>);fireEvent.click(screen.getByRole('button',{name:'打开群体报告'}))
 fireEvent.click(await screen.findByRole('button',{name:'加载更早的任务'}))
 await screen.findByRole('option',{name:'更早独立量表'})
 expect(screen.getByLabelText('群体报告任务')).toHaveValue('task')
 expect(screen.getAllByRole('option',{name:'当前任务'})).toHaveLength(1)
 expect(m.get).toHaveBeenCalledWith(base+'?'+new URLSearchParams({beforeTaskId:cursor}))
 expect(m.post).not.toHaveBeenCalled()
})
