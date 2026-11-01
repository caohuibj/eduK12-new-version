import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
const mocks=vi.hoisted(()=>({role:'PARENT',get:vi.fn(),post:vi.fn(),roster:vi.fn(),navigate:vi.fn()}))
vi.mock('../../../api/client',()=>({default:{get:mocks.get,post:mocks.post}}))
vi.mock('../../../contexts/AuthContext',()=>({useAuth:()=>({user:{id:'current',role:mocks.role}})}))
vi.mock('../../../api/relational',()=>({relationalApi:{teacherRoster:mocks.roster}}))
vi.mock('react-router-dom',async original=>({...await original<any>(),useNavigate:()=>mocks.navigate}))
vi.mock('../../bundle/BundleReport',()=>({default:()=> <p>已读取授权报告</p>}))
import ChildCognitiveControlPage from '../ChildCognitiveControlPage'
const ok=(data:any)=>({code:0,data})
beforeEach(()=>{vi.clearAllMocks();mocks.role='PARENT';mocks.post.mockResolvedValue(ok({}));mocks.get.mockResolvedValue(ok([]))})
const show=()=>render(<MemoryRouter><ChildCognitiveControlPage /></MemoryRouter>)
describe('child and adult separate participation',()=>{
  it('requires parent sharing consent before opening only the assigned observation',async()=>{
    mocks.get.mockResolvedValueOnce(ok([{assignmentId:'parent-observation',subjectName:'儿童甲',respondentType:'PARENT',status:'OPEN',consentRequired:true}])).mockResolvedValue(ok([{assignmentId:'parent-observation',subjectName:'儿童甲',respondentType:'PARENT',status:'OPEN',consentRequired:false}]))
    show(); await screen.findByText('家长观察 · 儿童甲')
    expect(screen.queryByRole('button',{name:'开始'})).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'同意分享给分配教师并继续'}))
    await waitFor(()=>expect(mocks.post).toHaveBeenCalledWith('/child-cognitive-control/assignments/parent-observation/consent',{}))
    mocks.post.mockResolvedValue(ok({attemptId:'actual-parent-attempt'}))
    fireEvent.click(await screen.findByRole('button',{name:'开始'}))
    await waitFor(()=>expect(mocks.navigate).toHaveBeenCalledWith('/relational/attempts/actual-parent-attempt?returnTo=%2Frelational%2Fchild-control'))
    expect(screen.queryByRole('region',{name:'分配儿童跨方法评估'})).not.toBeInTheDocument()
  })
  it('labels a student task as the child own performance and opens its existing runner',async()=>{
    mocks.role='STUDENT';mocks.get.mockResolvedValue(ok([{assignmentId:'child-task',respondentType:'SELF',status:'OPEN',consentRequired:false}]))
    mocks.post.mockResolvedValue(ok({attemptId:'actual-child-attempt'}));show()
    expect(await screen.findByText('请由孩子本人操作，成人可以协助理解说明。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'开始'}))
    await waitFor(()=>expect(mocks.post).toHaveBeenCalledWith('/child-cognitive-control/assignments/child-task/start',{}))
    expect(mocks.get.mock.calls.every(c=>c[0]==='/child-cognitive-control/tasks')).toBe(true)
  })
  it('issues one episode using the selected roster child and existing linked parent',async()=>{
    mocks.role='TEACHER'
    mocks.get.mockImplementation(async(url:string)=>ok(url.endsWith('/options')?{templates:[{id:'tasks',name:'儿童任务配置',courseId:'course',courseTitle:'课程',respondentType:'SELF'},{id:'parent-source',name:'家长观察配置',courseId:'course',courseTitle:'课程',respondentType:'PARENT'}],reports:[{bundleKey:'child_cognitive_control_parent_zh_cn',bundleVersion:'0.1.0'}]}:[]))
    mocks.roster.mockResolvedValue({roster:[{studentUserId:'actual-child',displayName:'儿童甲',approvedParents:[{parentUserId:'actual-linked-parent',displayName:'家长甲'}]}]})
    show();await screen.findByText('课程 · 儿童任务配置')
    fireEvent.change(screen.getByLabelText('儿童任务'),{target:{value:'tasks'}})
    await screen.findByText('儿童甲');fireEvent.change(screen.getByLabelText('儿童'),{target:{value:'actual-child'}})
    fireEvent.change(screen.getByLabelText('家长观察表（可选）'),{target:{value:'parent-source'}})
    fireEvent.change(screen.getByLabelText('已关联家长'),{target:{value:'actual-linked-parent'}})
    fireEvent.click(screen.getByRole('button',{name:'分别分配'}))
    await waitFor(()=>expect(mocks.post).toHaveBeenCalledWith('/child-cognitive-control/rounds',expect.objectContaining({subjectUserId:'actual-child',taskCompositeId:'tasks',parent:{userId:'actual-linked-parent',compositeId:'parent-source'},reportBundleKey:'child_cognitive_control_parent_zh_cn',reportBundleVersion:'0.1.0'})))
    expect(mocks.roster).toHaveBeenCalledWith('course')
  })
})
