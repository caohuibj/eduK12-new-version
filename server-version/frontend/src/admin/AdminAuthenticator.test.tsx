import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import {MemoryRouter} from 'react-router-dom'
import AdminKeyEnrollment from './AdminKeyEnrollment'
import AdminStepUp from './AdminStepUp'
const {begin,confirm,enroll,reauth,get}=vi.hoisted(()=>({begin:vi.fn(),confirm:vi.fn(),enroll:vi.fn(),reauth:vi.fn(),get:vi.fn()}))
vi.mock('./securityKey',()=>({beginTotpEnrollment:begin,confirmTotpEnrollment:confirm,enrollSecurityKey:enroll,reauthenticateAdmin:reauth}))
vi.mock('../api/client',()=>({default:{get}}))
const uri='otpauth://totp/eduK12%20Admin:synthetic?secret=MZXW6YTBOI&issuer=eduK12%20Admin'
beforeEach(()=>{vi.clearAllMocks();get.mockResolvedValue({code:0});begin.mockResolvedValue({code:0,data:{otpauthUri:uri}});confirm.mockResolvedValue({code:0,data:{registered:true}});reauth.mockResolvedValue({code:0})})
async function setup(){
  render(<MemoryRouter><AdminKeyEnrollment/></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('管理账号'),{target:{value:'synthetic-admin'}})
  fireEvent.change(screen.getByLabelText('当前密码'),{target:{value:'Synthetic1!password'}})
  fireEvent.change(screen.getByLabelText('一次性绑定码'),{target:{value:'synthetic-private-ticket'}})
  fireEvent.click(screen.getByRole('button',{name:'生成绑定二维码'}))
  await screen.findByRole('heading',{name:'扫描二维码'})
}
describe('administrator Authenticator binding and sensitive actions',()=>{
  it('submits the values actually present after autofill without depending on React change events',async()=>{
    render(<MemoryRouter><AdminKeyEnrollment/></MemoryRouter>)
    // Password managers can populate DOM controls without dispatching change.
    const fields=[['管理账号','autofilled-admin'],['当前密码','Autofilled1!password'],['一次性绑定码','autofilled-private-ticket']] as const
    for(const [label,value] of fields)(screen.getByLabelText(label) as HTMLInputElement).value=value
    fireEvent.click(screen.getByRole('button',{name:'生成绑定二维码'}))
    await screen.findByRole('heading',{name:'扫描二维码'})
    expect(begin).toHaveBeenCalledExactlyOnceWith('autofilled-admin','Autofilled1!password','autofilled-private-ticket')
  })
  it('shows the actual transport error instead of hiding a plain API error object',async()=>{
    begin.mockRejectedValueOnce({message:'受控登记票据无效或账号权限已变化',status:403})
    render(<MemoryRouter><AdminKeyEnrollment/></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('管理账号'),{target:{value:'synthetic-admin'}})
    fireEvent.change(screen.getByLabelText('当前密码'),{target:{value:'Synthetic1!password'}})
    fireEvent.change(screen.getByLabelText('一次性绑定码'),{target:{value:'synthetic-private-ticket'}})
    fireEvent.click(screen.getByRole('button',{name:'生成绑定二维码'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('受控登记票据无效或账号权限已变化')
    expect(screen.queryByRole('heading',{name:'扫描二维码'})).not.toBeInTheDocument()
    expect(screen.getByLabelText('一次性绑定码')).toHaveValue('synthetic-private-ticket')
  })

  it('lists every missing field in a visible alert before submission',async()=>{
    render(<MemoryRouter><AdminKeyEnrollment/></MemoryRouter>)
    fireEvent.click(screen.getByRole('button',{name:'生成绑定二维码'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('请填写管理账号、当前密码、一次性绑定码后再生成绑定二维码。')
    expect(begin).not.toHaveBeenCalled();expect(get).not.toHaveBeenCalled()
  })

  it('explains a missing enrollment ticket without calling the registration API',async()=>{
    render(<MemoryRouter initialEntries={['/admin/security/enroll?returnTo=%2Fadmin%2Ftraining']}><AdminKeyEnrollment/></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('管理账号'),{target:{value:'synthetic-admin'}})
    fireEvent.change(screen.getByLabelText('当前密码'),{target:{value:'Synthetic1!password'}})
    fireEvent.click(screen.getByRole('button',{name:'生成绑定二维码'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('请填写一次性绑定码后再生成绑定二维码。')
    expect(begin).not.toHaveBeenCalled();expect(get).not.toHaveBeenCalled()
    expect(screen.getByLabelText('一次性绑定码')).toBeRequired()
    expect(screen.getByRole('link',{name:'前往管理员登录'})).toHaveAttribute('href','/admin/login?returnTo=%2Fadmin%2Ftraining')
  })

  it('defaults to mobile Authenticator, retains the operator ticket, and clears credential fields before showing the QR',async()=>{
    await setup()
    expect(begin).toHaveBeenCalledExactlyOnceWith('synthetic-admin','Synthetic1!password','synthetic-private-ticket')
    expect(enroll).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('当前密码')).toBeNull()
    expect(screen.queryByLabelText('一次性绑定码')).toBeNull()
    expect(screen.getByText('在微软 Authenticator 中选择“添加账号 → 其他账号”，扫描此二维码。')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Authenticator 六位动态码'),{target:{value:'123456'}})
    fireEvent.click(screen.getByRole('button',{name:'确认绑定'}))
    await screen.findByText(/Authenticator 已绑定/)
    expect(confirm).toHaveBeenCalledExactlyOnceWith('123456')
    expect(screen.queryByRole('heading',{name:'扫描二维码'})).toBeNull()
    expect(screen.getByRole('link',{name:'前往管理员登录'})).toBeInTheDocument()
  })
  it('restarts a consumed binding challenge after a rejected code and clears the QR',async()=>{
    confirm.mockRejectedValueOnce(new Error('动态码错误，请重新开始'))
    await setup()
    fireEvent.change(screen.getByLabelText('Authenticator 六位动态码'),{target:{value:'123456'}})
    fireEvent.click(screen.getByRole('button',{name:'确认绑定'}))
    await screen.findByText(/请重新填写登记信息开始绑定/)
    expect(screen.queryByRole('heading',{name:'扫描二维码'})).toBeNull()
    expect(screen.getByLabelText('当前密码')).toHaveValue('')
    expect(screen.getByLabelText('一次性绑定码')).toHaveValue('')
  })
  it('keeps sensitive actions behind an explicit new code and clears that code after verification',async()=>{
    render(<AdminStepUp/>)
    fireEvent.change(screen.getByLabelText('Authenticator 六位动态码'),{target:{value:'654321'}})
    fireEvent.click(screen.getByRole('button',{name:'重新验证管理员身份'}))
    await screen.findByText('管理员双因素验证完成，五分钟内可执行敏感操作。')
    expect(reauth).toHaveBeenCalledExactlyOnceWith('654321','TOTP')
    expect(screen.getByLabelText('Authenticator 六位动态码')).toHaveValue('')
  })
  it('retains explicit hardware-key verification without requiring a mobile code',async()=>{
    render(<AdminStepUp/>)
    fireEvent.change(screen.getByLabelText('敏感操作验证方式'),{target:{value:'SECURITY_KEY'}})
    expect(screen.queryByLabelText('Authenticator 六位动态码')).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'重新验证管理员身份'}))
    await waitFor(()=>expect(reauth).toHaveBeenCalledExactlyOnceWith('','SECURITY_KEY'))
  })
})
