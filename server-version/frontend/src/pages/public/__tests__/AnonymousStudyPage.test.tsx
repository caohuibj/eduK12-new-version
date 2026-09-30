import {beforeEach,expect,it,vi} from 'vitest'
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter,Route,Routes} from 'react-router-dom'
import AnonymousStudyPage from '../AnonymousStudyPage'
const api=vi.hoisted(()=>({info:vi.fn(),join:vi.fn(),home:vi.fn(),start:vi.fn(),recover:vi.fn(),revoke:vi.fn()}))
vi.mock('../../../api/anonymousStudy',()=>({publicStudyApi:()=>api,studyIdentityKey:(s:string)=>`anonymous-study:identity:${s}`}))
const home={studyId:'s',title:'Research',displayCode:'P-DISPLAY',waves:[{id:'w',title:'One',ordinal:1,attemptId:'attempt',state:'COMPLETED',completedAt:null,accepting:true}],limitations:['研究内关联']}
function show(path='/public/studies/waves/w/token'){return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/public/studies/waves/:waveId/:token" element={<AnonymousStudyPage/>}/><Route path="/public/studies/:studyId" element={<AnonymousStudyPage/>}/><Route path="/public/composite/attempts/:attemptId/report" element={<p>Own report</p>}/></Routes></MemoryRouter>)}
beforeEach(()=>{vi.resetAllMocks();sessionStorage.clear();api.info.mockResolvedValue({studyId:'s',studyTitle:'Research',title:'One',accepting:true});api.home.mockResolvedValue(home)})
it('offers A guest participation and requires consent before creating B identity',async()=>{
 show();await screen.findByText('One');expect(screen.getByRole('link',{name:'以单次访客开始'})).toHaveAttribute('href','/public/composite/token')
 const button=screen.getByRole('button',{name:'创建研究内身份码'});expect(button).toBeDisabled()
 api.join.mockResolvedValue({studyId:'s',credential:'FULL-CREDENTIAL',displayCode:'P-DISPLAY'})
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(button)
 expect(await screen.findByText('FULL-CREDENTIAL')).toBeInTheDocument();expect(sessionStorage.getItem('anonymous-study:identity:s')).toBe('FULL-CREDENTIAL')
 expect(api.start).not.toHaveBeenCalled()
})
it('recovers only its own completed report and clears stored capabilities on logout',async()=>{
 sessionStorage.setItem('anonymous-study:identity:s','credential');api.recover.mockResolvedValue({attemptId:'attempt',state:'COMPLETED',recoveryToken:'own-recovery'})
 show('/public/studies/s');fireEvent.click(await screen.findByRole('button',{name:'查看本次个人报告'}))
 expect(await screen.findByText('Own report')).toBeInTheDocument();expect(sessionStorage.getItem('composite:recovery:attempt:attempt')).toBe('own-recovery')
})
it('logout removes private history and both identity and attempt credentials',async()=>{
 sessionStorage.setItem('anonymous-study:identity:s','credential');sessionStorage.setItem('composite:recovery:attempt:attempt','secret');sessionStorage.setItem('composite:study:return:attempt','/public/studies/s')
 show('/public/studies/s');fireEvent.click(await screen.findByRole('button',{name:'退出并清除本机凭证'}))
 expect(screen.queryByText('P-DISPLAY')).not.toBeInTheDocument();expect(sessionStorage.getItem('anonymous-study:identity:s')).toBeNull();expect(sessionStorage.getItem('composite:recovery:attempt:attempt')).toBeNull()
})
it('clears private history when refresh permission fails',async()=>{
 sessionStorage.setItem('anonymous-study:identity:s','credential');show('/public/studies/s');await screen.findByRole('button',{name:'查看本次个人报告'})
 api.home.mockRejectedValueOnce(new Error('Access revoked'));fireEvent.click(screen.getByRole('button',{name:'刷新任务与历史'}))
 await waitFor(()=>expect(screen.queryByRole('button',{name:'查看本次个人报告'})).not.toBeInTheDocument());expect(await screen.findByRole('alert')).toHaveTextContent('Access revoked')
})

it('keeps identity restoration available through an expired wave entry',async()=>{
 api.info.mockResolvedValue({studyId:'s',studyTitle:'Research',title:'One',accepting:false});show()
 expect(await screen.findByText(/已有身份码仍可恢复研究历史/)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'创建研究内身份码'})).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('已有身份码，恢复研究任务'),{target:{value:'credential'}});fireEvent.click(screen.getByRole('button',{name:'用身份码进入'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'查看本次个人报告'})).toBeInTheDocument())
})
