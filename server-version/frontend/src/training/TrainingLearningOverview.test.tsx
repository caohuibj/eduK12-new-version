import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {MemoryRouter,useLocation} from 'react-router-dom'
import {beforeEach,describe,expect,it,vi} from 'vitest'
const {get,post,refresh}=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),refresh:vi.fn()}))
vi.mock('../api/client',()=>({default:{get,post}}))
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>({user:{id:'student',nickname:'学员'}})}))
vi.mock('../hooks/useCursorList',()=>({useCursorList:()=>({list:[{id:'course',title:'原有课程'}],loading:false,error:'',refresh,more:vi.fn(),hasMore:false})}))
import TrainingLearningOverview, {type LearningPage} from './TrainingLearningOverview'
import TrainingLearnerHome from './TrainingLearnerHome'
const row={key:'a',kind:'ASSIGNMENT' as const,typeLabel:'练习',title:'另一课程的练习',courses:[{id:'other-course',title:'另一课程'}],state:'PENDING',stateLabel:'待完成',deadline:null,updatedAt:null,href:'/student/assignments/a?courseId=other-course&courseSection=assignments',action:'开始任务'}
function page(extra:Partial<LearningPage>={}):LearningPage{return {summary:{todo:8,feedback:3},counts:{ALL:8,ASSIGNMENT:7,CHECKIN:1,ASSESSMENT:0},list:[row],total:8,page:1,pageSize:6,generatedAt:'2026-10-24T00:00:00Z',...extra}}
function Location(){return <output aria-label="地址">{useLocation().search}</output>}
function mount(path='/student',home=false){return render(<MemoryRouter initialEntries={[path]}>{home?<TrainingLearnerHome/>:<TrainingLearningOverview/>}<Location/></MemoryRouter>)}
beforeEach(()=>{vi.clearAllMocks();get.mockImplementation((url:string)=>{const query=new URLSearchParams(url.split('?')[1]);return Promise.resolve({code:0,data:page({page:Number(query.get('page')||1)})})})})
describe('Training learner homepage shortcuts',()=>{
 it('places two summary entries above courses and expands without starting tasks',async()=>{
  mount('/student',true)
  const card=await screen.findByRole('button',{name:/待办任务.*8/})
  expect(card).toHaveAttribute('aria-expanded','false');expect(screen.queryByRole('link',{name:/开始任务/})).not.toBeInTheDocument()
  fireEvent.click(card)
  const link=await screen.findByRole('link',{name:'开始任务：另一课程的练习'})
  expect(link).toHaveAttribute('href',row.href)
  expect(screen.getByRole('link',{name:/原有课程/})).toBeInTheDocument()
  expect(screen.getAllByRole('heading',{level:1})).toHaveLength(1)
  const heading=screen.getByRole('heading',{level:1,name:'我的课程'})
  const header=heading.closest('.learning-overview-header')!
  expect(header).toContainElement(card)
  expect(header).toContainElement(screen.getByRole('button',{name:/反馈与结果/}))
  expect(header).toContainElement(screen.getByRole('button',{name:'加入课程'}))
  expect(screen.getByText('1 门')).toBeInTheDocument()

  expect(screen.queryByText('今天，从这里继续')).not.toBeInTheDocument()
  expect(screen.queryByText('待办、反馈和课程，集中在这里。')).not.toBeInTheDocument()
  expect(screen.queryByText(/你好，/)).not.toBeInTheDocument()
  expect(post).not.toHaveBeenCalled()
 })
 it('switches filters, paginates, and keeps unrelated URL context',async()=>{
  mount('/student?keep=value&learning=todo')
  await screen.findByRole('link',{name:/开始任务/})
  fireEvent.click(screen.getByRole('button',{name:/^练习/}))
  await waitFor(()=>expect(get).toHaveBeenLastCalledWith('/courses/my/learning-inbox?view=todo&kind=ASSIGNMENT&page=1&pageSize=6'))
  await screen.findByRole('link',{name:/开始任务/})
  fireEvent.click(screen.getByRole('button',{name:'下一页'}))
  await waitFor(()=>expect(get).toHaveBeenLastCalledWith('/courses/my/learning-inbox?view=todo&kind=ASSIGNMENT&page=2&pageSize=6'))
  expect(screen.getByLabelText('地址')).toHaveTextContent('keep=value')
 })
 it('excludes check-in feedback and explains result release without claiming unread counts',async()=>{
  const feedback={...row,key:'r',kind:'ASSESSMENT' as const,typeLabel:'组合测评结果',title:'已交卷测评',stateLabel:'已交卷 · 按测评规则开放',href:'/student/composite/attempts/result/report',action:'查看状态与反馈'}
  get.mockResolvedValue({code:0,data:page({list:[feedback],total:1})})
  mount('/student?learning=feedback')
  expect(await screen.findByRole('link',{name:'查看状态与反馈：已交卷测评'})).toHaveAttribute('href',feedback.href)
  const filters=screen.getByRole('group',{name:'学习内容分类'})
  expect(within(filters).queryByRole('button',{name:/打卡/})).not.toBeInTheDocument()
  expect(screen.getByText(/测评记录不等于结果已开放/)).toBeInTheDocument()
  expect(screen.queryByText(/未读/)).not.toBeInTheDocument()
 })
 it('keeps courses accessible and counts unknown on failure; retry recovers',async()=>{
  get.mockRejectedValueOnce(new Error('读取失败'))
  mount('/student',true)
  await screen.findByRole('alert')
  expect(screen.getByRole('button',{name:/待办任务.*—/})).toBeInTheDocument()
  expect(screen.getByRole('link',{name:/原有课程/})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'重新读取概览'}))
  expect(await screen.findByRole('button',{name:/待办任务.*8/})).toBeInTheDocument()
 })
 it('ignores a stale pending request after switching to feedback',async()=>{
  let resolvePending!:(value:unknown)=>void
  get.mockImplementationOnce(()=>new Promise(resolve=>{resolvePending=resolve}))
  mount('/student?learning=todo')
  fireEvent.click(screen.getByRole('button',{name:/反馈与结果/}))
  await screen.findByRole('link',{name:/开始任务/})
  await act(async()=>{resolvePending({code:0,data:page({summary:{todo:99,feedback:99},list:[]})})})
  expect(screen.queryByRole('button',{name:/99/})).not.toBeInTheDocument()
  expect(screen.getByRole('heading',{name:'反馈与结果'})).toBeInTheDocument()
 })
 it('renders an honest empty state and closes only the overview query',async()=>{
  get.mockResolvedValue({code:0,data:page({summary:{todo:0,feedback:0},list:[],total:0})})
  mount('/student?learning=todo&keep=value')
  await screen.findByText('当前没有这类待办')
  fireEvent.click(screen.getByRole('button',{name:'收起学习列表'}))
  expect(screen.getByLabelText('地址')).toHaveTextContent('?keep=value')
  expect(screen.queryByRole('heading',{name:'待办任务'})).not.toBeInTheDocument()
 })
})
