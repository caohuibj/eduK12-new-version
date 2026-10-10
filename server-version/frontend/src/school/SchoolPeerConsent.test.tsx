import { describe,it,expect,vi } from 'vitest'
import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { SchoolPeerConsent } from './SchoolPeerConsent'
import type { SchoolApi } from './SchoolRecovery'

describe('Huischool peer consent UI',()=>{
  it('uses explicit student assent rather than class enrollment as a consent grant',async()=>{
    const api=vi.fn(async(path:string)=>{
      if(path==='/my/peer-opportunities')return {
        policy:{version:'HUISCHOOL_PEER_V1',minimumCohort:5,
          text:'这是自愿的班级群体评价，不提供个人公开评价'},
        list:[{courseId:'act1',organizationId:'school1',title:'同伴支持',
          assented:false,guardianConsented:false}],
      }
      return {state:'AWAITING_GUARDIAN'}
    })
    const ok=vi.spyOn(window,'confirm').mockReturnValue(true)
    render(<SchoolPeerConsent api={api as SchoolApi} role="STUDENT"/>)
    expect(await screen.findByRole('button',{name:'本人同意参加'})).toBeInTheDocument()
    expect(screen.getByText(/最少 5 名/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'本人同意参加'}))
    await waitFor(()=>expect(api).toHaveBeenCalledWith(
      '/organizations/school1/activities/act1/peer-consent','POST',{action:'ASSENT'},
    ))
    expect(ok).toHaveBeenCalled()
    ok.mockRestore()
  })
})
