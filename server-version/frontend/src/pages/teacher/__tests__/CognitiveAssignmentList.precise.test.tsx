import {beforeEach,describe,it,expect,vi} from 'vitest'
import {render,screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
const m=vi.hoisted(()=>({get:vi.fn(),create:vi.fn(),available:true}))
vi.mock('../../../contexts/CapabilitiesContext',()=>({useCognitiveEnabled:()=>true}))
vi.mock('../../../contexts/AuthContext',()=>({useAuth:()=>({user:{id:'teacher',role:'TEACHER'}})}))
vi.mock('../../../api/client',()=>({default:{get:m.get,post:vi.fn(),patch:vi.fn()}}))
const pointer={authorizationId:'11111111-1111-4111-8111-111111111111',authorizationRevision:1,bindingHash:'a'.repeat(64),configurationHash:'b'.repeat(64)}
vi.mock('../../../modules/cognitive/api',()=>({cognitiveApi:{
 listTeacherAssignments:async()=>({code:0,data:{list:[]}}),listTests:async()=>({code:0,data:{list:[]}}),
 listConfigs:async()=>({code:0,data:{list:[{id:'cfg',name:'简单反应时',testType:'reaction',configVersion:'1.1.0',authorizationMode:'PRECISE',available:m.available,
  fixedProfile:'research',configurationName:'课堂研究报告',selectedBinding:{authorizationId:'11111111-1111-4111-8111-111111111111',authorizationRevision:1,bindingHash:'a'.repeat(64),configurationHash:'b'.repeat(64)},unavailableReason:m.available?null:'原使用权已撤销'}]}}),
 createAssignment:m.create,
}}))
import CognitiveAssignmentList from '../CognitiveAssignmentList'
beforeEach(()=>{vi.clearAllMocks();m.available=true;m.get.mockResolvedValue({code:0,data:{list:[{id:'course',title:'课程',courseCode:'COURSE'}]}});m.create.mockResolvedValue({code:0,data:{id:'draft'}})})
describe('administrator fixed cognitive profile consumer',()=>{
 it('creates directly with the original binding without live test-catalog or user profile selection',async()=>{
  const user=userEvent.setup();render(<MemoryRouter><CognitiveAssignmentList/></MemoryRouter>)
  await user.click(await screen.findByRole('button',{name:/新建认知任务/}))
  await user.selectOptions(screen.getAllByRole('combobox')[1],'cfg')
  expect(screen.getByText('管理员指定配置：课堂研究报告')).toBeInTheDocument();expect(screen.queryByLabelText('测验档位')).not.toBeInTheDocument()
  await user.selectOptions(screen.getAllByRole('combobox')[0],'course')
  await user.type(screen.getByLabelText('标题'),'课程认知任务')
  await user.click(screen.getByRole('button',{name:'保存草稿'}))
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({selectedBinding:pointer,configId:'cfg'}))
  expect(m.create.mock.calls[0][0]).not.toHaveProperty('profile')
 })
 it('blocks an unavailable fixed grant instead of offering a default profile',async()=>{
  m.available=false;const user=userEvent.setup();render(<MemoryRouter><CognitiveAssignmentList/></MemoryRouter>)
  await user.click(await screen.findByRole('button',{name:/新建认知任务/}));await user.selectOptions(screen.getAllByRole('combobox')[1],'cfg')
  expect(screen.getByRole('alert')).toHaveTextContent('原使用权已撤销');expect(screen.getByRole('button',{name:'保存草稿'})).toBeDisabled()
  expect(screen.queryByLabelText('测验档位')).not.toBeInTheDocument();expect(m.create).not.toHaveBeenCalled()
 })
})
