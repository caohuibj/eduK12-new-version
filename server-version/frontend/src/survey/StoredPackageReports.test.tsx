import {afterEach,it,expect,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {StoredPackageReports} from './StoredPackageReports'
import {derivedViewFixture} from '../modules/reporting/BundleDerivedReport.fixture'
const request=vi.hoisted(()=>vi.fn())
vi.mock('../api/surveyGovernance',()=>({governedResearcherRequest:request}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('reopens only the exact saved numerical DTO on demand and clears it on a permission failure',async()=>{
 const artifact={packageTitle:'已保存探索报告',reportVersion:'1.0.0',report:null,nativeBundle:{status:'READY',profileView:null,derivedView:derivedViewFixture()}}
 request.mockImplementation(async(path:string)=>path.includes('/finals/')?{list:[{id:'saved',artifact}]}:{list:[{finalId:'final',completedAt:'2026-11-01T00:00:00Z',count:1}],hasMore:false})
 render(<StoredPackageReports projectId="project" waveId="wave"/>)
 expect(request).not.toHaveBeenCalled();fireEvent.click(screen.getByText('已保存组合报告'))
 fireEvent.click(screen.getByRole('button',{name:'读取组合报告列表'}));await screen.findByRole('button',{name:'查看已存组合报告'})
 fireEvent.click(screen.getByRole('button',{name:'查看已存组合报告'}));await screen.findByRole('img',{name:'认知需求，范围 10 到 50，本次结果 38'})
 expect(request).toHaveBeenLastCalledWith('/project/waves/wave/finals/final/package-reports')
 request.mockRejectedValueOnce(new Error('当前权限已失效'))
 fireEvent.click(screen.getByRole('button',{name:'读取组合报告列表'}));await screen.findByRole('alert')
 expect(screen.queryByRole('img')).not.toBeInTheDocument()
})
