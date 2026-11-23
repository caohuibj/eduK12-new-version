import {act,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({view:'MANAGEMENT',verify:vi.fn(),user:{id:'admin',platformRole:'STANDARD',entryGrants:[{entry:'TRAINING'}]}}))
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>({user:state.user})}))
vi.mock('./accountView',()=>({accountView:()=>state.view}))
vi.mock('./securityKey',()=>({reauthenticateAdmin:state.verify}))
import AdminStepUpRecovery from './AdminStepUpRecovery'
beforeEach(()=>{state.view='MANAGEMENT';state.verify.mockReset();state.verify.mockResolvedValue({})})
afterEach(()=>vi.restoreAllMocks())
it('verifies in place without replaying the failed operation or discarding an editor',async()=>{
 const mutation=vi.fn()
 render(<><input aria-label="课程名称" defaultValue="尚未保存的课程"/><button onClick={mutation}>保存课程</button><AdminStepUpRecovery/></>)
 act(()=>window.dispatchEvent(new CustomEvent('admin:step-up-required')))
 expect(screen.getByRole('dialog',{name:'重新验证管理员身份'})).toBeVisible()
 fireEvent.change(screen.getByLabelText('Authenticator 六位动态码'),{target:{value:'123456'}})
 fireEvent.click(screen.getByRole('button',{name:'重新验证管理员身份'}))
 expect(await screen.findByRole('status')).toHaveTextContent('重新执行原操作')
 expect(state.verify).toHaveBeenCalledExactlyOnceWith('123456','TOTP')
 expect(mutation).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'返回原操作'}))
 expect(screen.queryByRole('dialog')).toBeNull()
 expect(screen.getByLabelText('课程名称')).toHaveValue('尚未保存的课程')
})
it('does not interrupt the business view with a management dialog',()=>{
 state.view='BUSINESS';render(<AdminStepUpRecovery/>)
 act(()=>window.dispatchEvent(new CustomEvent('admin:step-up-required')))
 expect(screen.queryByRole('dialog')).toBeNull()
})
