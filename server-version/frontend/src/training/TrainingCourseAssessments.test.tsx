import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({attempts:vi.fn(),exportData:vi.fn()}))
vi.mock('../modules/composite/api',()=>({compositeApi:m}))
vi.mock('../api/client',()=>({default:{get:vi.fn()},sessionFetch:vi.fn()}))
import TrainingCourseAssessments, {type CourseAssessment} from './TrainingCourseAssessments'
const course={id:'course-a',title:'课程 A'}
const published:CourseAssessment={id:'assessment',key:'assessment',kind:'QUESTIONNAIRE',name:'课程测评',typeLabel:'课程问卷',description:null,status:'PUBLISHED',unitCount:3,unitLabel:'测评单元',manageHref:'/questionnaire-products/assessment'}
const props=()=>({course,actorId:'teacher',rows:[published,{...published,id:'draft',key:'draft',name:'课程草稿',status:'DRAFT',manageHref:'/questionnaire-products/draft'}],loading:false,error:null,onRetry:vi.fn()})
beforeEach(()=>{vi.clearAllMocks();m.attempts.mockResolvedValue({code:0,data:{courseScope:course,attemptCounts:{started:4,inProgress:1,completed:3,satisfied:2}}})})
it('unifies drafts, configuration and scoped results without reading participant data on mount',async()=>{
 render(<MemoryRouter><TrainingCourseAssessments {...props()}/></MemoryRouter>)
 expect(screen.getByRole('link',{name:'继续编制'})).toHaveAttribute('href','/questionnaire-products/draft?courseId=course-a&returnTo=%2F')
 expect(screen.getByRole('link',{name:'复用测评'})).toHaveAttribute('href','/questionnaires?courseId=course-a&returnTo=%2F')
 expect(screen.getByRole('link',{name:'发布测评'})).toHaveAttribute('href','/questionnaire-products/new?courseId=course-a&returnTo=%2F')
 expect(screen.getByRole('link',{name:'使用授权问卷'})).toHaveAttribute('href','/bundle-products?authorized=1&courseId=course-a&returnTo=%2F')
 expect(m.attempts).not.toHaveBeenCalled();expect(m.exportData).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'作答与结果'}))
 expect(await screen.findByRole('link',{name:'打开本课程作答名单与报告'})).toHaveAttribute('href','/composite-assessments/assessment/results?courseId=course-a&returnTo=%2F')
 expect(m.attempts).toHaveBeenCalledWith('assessment',{courseId:'course-a',page:1,pageSize:1})
 fireEvent.click(screen.getByRole('button',{name:'导出本课程数据'}))
 expect(screen.getByRole('dialog')).toHaveTextContent('仅导出「课程 A」')
 expect(m.exportData).not.toHaveBeenCalled()
})
it('does not present unscoped result counts when scope cannot be verified',async()=>{
 m.attempts.mockResolvedValue({code:0,data:{attemptCounts:{started:99}}})
 render(<MemoryRouter><TrainingCourseAssessments {...props()}/></MemoryRouter>)
 fireEvent.click(screen.getByRole('button',{name:'作答与结果'}))
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('课程数据范围无法确认'))
 expect(screen.queryByText('99')).toBeNull()
})
it('preserves creator restrictions and leaves analysis to its single course tab',()=>{
 const p=props();p.rows=[{...published,manageHref:null}]
 render(<MemoryRouter><TrainingCourseAssessments {...p}/></MemoryRouter>)
 expect(screen.queryByRole('button',{name:'作答与结果'})).toBeNull();expect(screen.queryByRole('button',{name:'导出本课程数据'})).toBeNull()
 expect(screen.queryByRole('button',{name:'课程数据分析'})).toBeNull()
})

it.each(['LEGACY_COMPOSITE','ASSESSMENT_BUNDLE'])('does not offer course-scoped results for untracked %s delivery',kind=>{
 const p=props();p.rows=[{...published,kind}]
 render(<MemoryRouter><TrainingCourseAssessments {...p}/></MemoryRouter>)
 expect(screen.queryByRole('button',{name:'作答与结果'})).toBeNull()
 expect(screen.queryByRole('button',{name:'导出本课程数据'})).toBeNull()
 expect(screen.getByText(/未记录每次作答的课程来源/)).toBeInTheDocument()
 expect(screen.getByRole('link',{name:'管理测评'})).toBeInTheDocument()
 expect(m.attempts).not.toHaveBeenCalled()
})
