import { describe,it,expect,vi } from 'vitest'
import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { SchoolPeerConsent } from './SchoolPeerConsent'
import type { SchoolApi } from './SchoolRecovery'

describe('Huischool peer consent UI',()=>{
  it('distinguishes loading from a confirmed empty student authorization list',async()=>{
    let resolve!:(value:unknown)=>void
    const api=vi.fn(()=>new Promise(done=>{resolve=done}))
    render(<SchoolPeerConsent api={api as SchoolApi} role="STUDENT"/>)
    expect(screen.getByRole('status')).toHaveTextContent('正在读取同伴授权')
    expect(screen.queryByText('暂无需要处理的同伴授权')).not.toBeInTheDocument()
    resolve({list:[],policy:{version:'v1',minimumCohort:5,text:'自愿参与'}})
    expect(await screen.findByText('暂无需要处理的同伴授权')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(api).toHaveBeenCalledTimes(1)
  })
  it('shows a read failure instead of claiming there are no student authorizations',async()=>{
    const api=vi.fn(async()=>{throw new Error('读取失败，请稍后重试')})
    render(<SchoolPeerConsent api={api as SchoolApi} role="STUDENT"/>)
    expect(await screen.findByRole('alert')).toHaveTextContent('读取失败')
    expect(screen.queryByText('暂无需要处理的同伴授权')).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'本人同意参加'})).not.toBeInTheDocument()
  })
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

it('shows parent authorization loading and a confirmed empty state without consent writes',async()=>{
 let resolve!:(value:unknown)=>void
 const api=vi.fn(()=>new Promise(done=>{resolve=done}))
 render(<SchoolPeerConsent api={api as SchoolApi} role="PARENT"/>)
 expect(screen.getByRole('status')).toHaveTextContent('正在读取参与授权')
 expect(screen.queryByText('暂无需要确认的参与授权')).not.toBeInTheDocument()
 resolve({list:[],policy:{version:'v1',minimumCohort:5,text:'自愿参与'}})
 expect(await screen.findByText('暂无需要确认的参与授权')).toBeInTheDocument()
 expect(screen.getByText('参与说明').closest('details')).not.toHaveAttribute('open')
 expect(screen.queryByRole('status')).not.toBeInTheDocument()
 expect(api.mock.calls).toEqual([['/guardian/peer-consent-requests']])
})
