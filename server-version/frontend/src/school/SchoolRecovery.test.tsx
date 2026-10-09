import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  SchoolStudentRecovery, SchoolRecoveryOfficer, type SchoolApi,
} from './SchoolRecovery'

describe('campus self-service recovery',()=>{
  it('only redeems an independently supplied token and never calls training API',async()=>{
    const invoke=vi.fn(async()=>({recovered:true}))
    const onComplete=vi.fn()
    render(<SchoolStudentRecovery api={invoke as unknown as SchoolApi} onComplete={onComplete}/>)
    fireEvent.change(screen.getByLabelText('一次性恢复码'),{
      target:{value:'fictional-one-time-recovery-token'},
    })
    fireEvent.change(screen.getByLabelText('新密码'),{target:{value:'PrivateNewPassword123'}})
    fireEvent.click(screen.getByRole('button',{name:'核验并恢复账号'}))
    await waitFor(()=>expect(onComplete).toHaveBeenCalledTimes(1))
    expect(invoke).toHaveBeenCalledWith('/credentials/redeem','POST',{
      recoveryCode:'fictional-one-time-recovery-token',
      newPassword:'PrivateNewPassword123',
    })
  })
})

describe('campus recovery officer interface',()=>{
  it('only asks the school-specific endpoint to issue after affirmative offline verification',async()=>{
    const invoke=vi.fn(async(path:string)=>{
      if(path.endsWith('/student-recoveries'))return {
        username:'newschoolaccount',
        recoveryCode:'synthetic-one-time-code',
        expiresAt:new Date(Date.now()+60000).toISOString(),
      }
      return {list:[]}
    })
    render(<SchoolRecoveryOfficer api={invoke as unknown as SchoolApi}
      classPath="/organizations/school-x/classes/class-y" />)
    fireEvent.change(screen.getByLabelText('资格学号（不显示在审计记录中）'),{
      target:{value:'P1234'},
    })
    const issue=screen.getByRole('button',{name:'签发恢复码'})
    expect(issue).toBeDisabled()
    fireEvent.click(screen.getByLabelText('已在线下完成独立身份核验'))
    expect(issue).toBeEnabled()
    fireEvent.click(issue)
    await waitFor(()=>expect(invoke).toHaveBeenCalledWith(
      '/organizations/school-x/classes/class-y/student-recoveries','POST',{
        studentNumber:'P1234',reasonCode:'FORGOT_PASSWORD',verifiedOffline:true,
      }))
    expect(await screen.findByText('synthetic-one-time-code')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'已安全交付，隐藏凭据'}))
    expect(screen.queryByText('synthetic-one-time-code')).not.toBeInTheDocument()
  })
})
