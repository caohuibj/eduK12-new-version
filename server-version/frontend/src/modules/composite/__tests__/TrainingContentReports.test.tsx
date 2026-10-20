import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({user:{role:'TEACHER'} as {role:string}|null,report:vi.fn(),status:vi.fn()}))
vi.mock('../api',()=>({compositeApi:{report:state.report,teacherReport:state.report,reportStatus:state.status,teacherReportStatus:state.status},publicCompositeApi:()=>({report:state.report,reportStatus:state.status})}))
vi.mock('../../../contexts/AuthContext',()=>({useAuth:()=>({user:state.user})}))
import CompositeReportPage from '../CompositeReportPage'
import { TrainingContentReports } from '../TrainingContentReports'
import type { TrainingContentReport } from '../types'
const content=():TrainingContentReport[]=>[{itemId:'unit-1',status:'READY',reportRelease:{releaseId:'exact-report-release',contentHash:'a'.repeat(64)},lifecycleNotices:[{layer:'REPORT',releaseId:'exact-report-release',status:'RETIRED'}],rendered:{generatorVersion:'DECLARATIVE_REPORT_V1',title:'冻结私有反馈',blocks:[
 {type:'TEXT',text:'<script>private()</script>'},{type:'METRIC',metricKey:'speed',value:12.5,unit:'ms',status:'INTERPRETABLE'},
 {type:'METRIC',metricKey:'invalid',value:99,unit:'points',status:'INVALID'},
 {type:'ASSET',alt:'冻结图片说明',url:'https://untrusted.example/leak',assetId:'a'},
 {type:'CHART',metrics:[{metricKey:'accuracy',value:0.75,unit:'ratio',status:'INTERPRETABLE'}]},
 {type:'REFERENCE_BAND',text:'已匹配参考说明',guidance:['谨慎解释']},
 ],limitations:['冻结局限说明'],disclaimer:'描述性反馈'}},
 {itemId:'withdrawn',status:'REVOKED',reportRelease:{releaseId:'withdrawn-release',contentHash:'b'.repeat(64)},lifecycleNotices:[{layer:'MEASUREMENT',releaseId:'withdrawn-measurement',status:'REVOKED'}],rendered:{generatorVersion:'DECLARATIVE_REPORT_V1',title:'撤销后不得泄露',blocks:[{type:'TEXT',text:'撤销私密内容'}],limitations:[],disclaimer:null}}]
function mount(path='/composite-assessments/q/attempts/a/report'){
 return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/composite-assessments/:id/attempts/:attemptId/report" element={<CompositeReportPage/>}/><Route path="/student/composite/attempts/:attemptId/report" element={<CompositeReportPage/>}/><Route path="/public/composite/attempts/:attemptId/report" element={<CompositeReportPage/>}/></Routes></MemoryRouter>)
}
beforeEach(()=>{vi.clearAllMocks();state.user={role:'TEACHER'};sessionStorage.clear();state.status.mockResolvedValue({code:0,data:{attemptId:'a',attemptEpoch:1,status:'COMPLETED',reportStatus:{state:'READY'}}});state.report.mockResolvedValue({code:0,data:{id:'a',assessmentId:'q',name:'组合报告',completedAt:'2026-10-20T00:00:00Z',totalTime:1000,anonymousCode:null,backgroundValues:[],unitReports:[],contentReports:content()}})})
afterEach(cleanup)
describe('actual Training content report reader',()=>{
 it.each(['TEACHER','ADMIN'])('shows exact frozen versions and safe declarations to %s',async(role)=>{
  state.user={role};const {container}=mount();await screen.findByText('冻结版本私有报告')
  expect(screen.getByText('exact-report-release')).toBeInTheDocument();expect(screen.getByText('a'.repeat(64))).toBeInTheDocument()
  expect(screen.getByText('12.5')).toBeInTheDocument();expect(screen.getByText('0.75')).toBeInTheDocument();expect(screen.queryByText('99')).not.toBeInTheDocument()
  expect(screen.getByText('<script>private()</script>')).toBeInTheDocument();expect(container.querySelector('script,img,iframe')).toBeNull()
  expect(screen.getByText(/图片替代文本：冻结图片说明/)).toBeInTheDocument();expect(container.querySelector('[src],[href="https://untrusted.example/leak"]')).toBeNull()
  expect(screen.getByText(/版本状态变更：REPORT.*已退役/)).toBeInTheDocument();expect(screen.getByText(/测量或报告版本已撤销/)).toBeInTheDocument()
  expect(screen.queryByText('撤销私密内容')).not.toBeInTheDocument();expect(screen.queryByText(/撤销后不得泄露/)).not.toBeInTheDocument()
 })
 it.each(['/student/composite/attempts/a/report','/public/composite/attempts/a/report'])('ignores malicious contentReports on participant/public route %s',async(path)=>{
  state.user={role:'ADMIN'};sessionStorage.setItem('composite:recovery:attempt:a','credential');mount(path);await screen.findByText('组合报告')
  expect(screen.queryByText('冻结版本私有报告')).not.toBeInTheDocument();expect(screen.queryByText('exact-report-release')).not.toBeInTheDocument()
 })
 it('shows private reports once when the ordinary module index is present',async()=>{
  state.report.mockResolvedValue({code:0,data:{id:'a',assessmentId:'q',name:'组合报告',completedAt:'2026-10-20T00:00:00Z',totalTime:1,backgroundValues:[],unitReports:[{itemId:'one',type:'COGNITIVE',label:'One',decryptError:true},{itemId:'two',type:'COGNITIVE',label:'Two',decryptError:true}],contentReports:content()}})
  mount();await screen.findByText('冻结版本私有报告');expect(screen.getAllByText('exact-report-release')).toHaveLength(1)
 })
 it('does not render content reports in partial mode',async()=>{mount('/composite-assessments/q/attempts/a/report?partial=1');await screen.findByText('组合报告');expect(screen.queryByText('冻结版本私有报告')).not.toBeInTheDocument()})
 it('keeps legacy reports without contentReports readable',async()=>{state.report.mockResolvedValue({code:0,data:{id:'a',assessmentId:'q',name:'旧组合报告',completedAt:null,totalTime:null,anonymousCode:null,backgroundValues:[],unitReports:[]}});mount();await screen.findByText('旧组合报告');expect(screen.queryByText('冻结版本私有报告')).not.toBeInTheDocument()})
 it('also refuses participant disclosure at the component boundary',()=>{render(<TrainingContentReports reports={content()} audience="participant"/>);expect(screen.queryByText('冻结版本私有报告')).not.toBeInTheDocument()})
})
