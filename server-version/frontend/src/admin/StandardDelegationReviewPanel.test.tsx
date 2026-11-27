import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import api from '../api/client'
import {StandardDelegationReviewPanel} from './StandardDelegationReviewPanel'

vi.mock('../api/client',()=>({default:{get:vi.fn(),post:vi.fn()}}))
const accountId='origin-account'
const base='/admin/permissions/standard-delegation-review/accounts/'+accountId
const grant={id:'origin-grant',title:'标准量表',schoolName:'甲校',product:'TEACHER',exact:true,status:'ACTIVE',version:1,expiresAt:'2099-07-31T08:00:00.000Z'}
const detail={
 grant,combinations:[{id:'exact-release',title:'标准量表',contentVersion:'1.0',parametersVersion:'2.0',reportVersion:'3.0'}],
 affected:{count:1,digest:'a'.repeat(64),hasMore:false,list:[{id:'dependent-grant',label:'校内教师',title:'原固定配置',expiresAt:grant.expiresAt}]},
 candidates:[{id:'successor-account',label:'接任人账号',detail:'接任人姓名',grantId:null}],moreCandidates:false,
}

describe('standard delegation account handoff',()=>{
 beforeEach(()=>{
  vi.mocked(api.get).mockImplementation(async (url)=>({
   code:0,message:'成功',data:url.includes('/grants/')?detail:{list:[grant],hasMore:false},
  }))
  vi.mocked(api.post).mockResolvedValue({code:0,message:'成功',data:{grantId:'successor-grant'}})
 })
 afterEach(()=>{vi.clearAllMocks();vi.restoreAllMocks()})

 async function openGrant(){
  render(<StandardDelegationReviewPanel accountId={accountId} accountLabel="原管理员"/>)
  fireEvent.click(screen.getByRole('button',{name:'查看量表分发与交接'}))
  fireEvent.click(await screen.findByRole('button',{name:/标准量表 · 甲校/}))
  await screen.findByText(/报告 3.0/)
 }

 it('separately shows downstream impact, issues the successor and confirms the former grant withdrawal',async()=>{
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(true)
  await openGrant()
  expect(screen.getByText(/校内教师 · 原固定配置/)).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'完成交接并撤销原委托'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:/接任人账号 · 接任人姓名/}))
  fireEvent.change(screen.getByLabelText('分发委托变更原因'),{target:{value:'学期人员交接'}})
  fireEvent.click(screen.getByRole('button',{name:'签发接任委托'}))
  expect(await screen.findByText(/接任委托已签发/)).toBeInTheDocument()
  expect(api.post).toHaveBeenCalledTimes(1)
  expect(api.post).toHaveBeenCalledWith(base+'/grants/origin-grant/successor',{
   requestId:expect.any(String),successorId:'successor-account',expectedVersion:1,reason:'学期人员交接',
  })
  fireEvent.click(screen.getByRole('button',{name:'完成交接并撤销原委托'}))
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith(base+'/grants/origin-grant/revoke',{
   expectedVersion:1,reason:'学期人员交接',impactDigest:detail.affected.digest,successorGrantId:'successor-grant',
  }))
  expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('1 份固定配置'))
 })

 it('shows outstanding chosen configurations and submits only after checking the successor’s reissue',async()=>{
  vi.spyOn(window,'confirm').mockReturnValue(true)
  let reissued=false
  vi.mocked(api.get).mockImplementation(async url=>({
   code:0,message:'成功',data:url.includes('/grants/')?{...detail,
    candidates:[{...detail.candidates[0],grantId:'successor-grant'}],
    affected:{...detail.affected,list:[{...detail.affected.list[0],reissued}]},
   }:{list:[grant],hasMore:false},
  }))
  await openGrant()
  fireEvent.click(screen.getByRole('checkbox',{name:/延续 校内教师/}))
  fireEvent.click(screen.getByRole('button',{name:/接任人账号 · 接任人姓名/}))
  expect(await screen.findByText(/待重发/)).toBeVisible()
  fireEvent.change(screen.getByLabelText('分发委托变更原因'),{target:{value:'保留被选配置'}})
  fireEvent.click(screen.getByRole('button',{name:'完成交接并撤销原委托'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('尚未重发')
  expect(api.post).not.toHaveBeenCalled()
  reissued=true
  fireEvent.click(screen.getByRole('button',{name:'核对重发记录'}))
  expect(await screen.findByText(/已重发/)).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'完成交接并撤销原委托'}))
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith(base+'/grants/origin-grant/revoke',{
   expectedVersion:1,reason:'保留被选配置',impactDigest:detail.affected.digest,
   successorGrantId:'successor-grant',continueIds:['dependent-grant'],
  }))
 })

 it('does not retry an uncertain signing with a different identity',async()=>{
  vi.spyOn(window,'confirm').mockReturnValue(true)
  vi.mocked(api.post).mockRejectedValueOnce(new Error('连接中断'))
  await openGrant()
  fireEvent.click(screen.getByRole('button',{name:/接任人账号 · 接任人姓名/}))
  fireEvent.change(screen.getByLabelText('分发委托变更原因'),{target:{value:'核对原请求'}})
  fireEvent.click(screen.getByRole('button',{name:'签发接任委托'}))
  const retry=await screen.findByRole('button',{name:'重试同一笔签发'})
  expect(screen.getByRole('alert')).toHaveTextContent('连接中断')
  expect(screen.getByRole('button',{name:'终止原委托'})).toBeDisabled()
  fireEvent.click(retry)
  await waitFor(()=>expect(api.post).toHaveBeenCalledTimes(2))
  expect(vi.mocked(api.post).mock.calls[1]).toEqual(vi.mocked(api.post).mock.calls[0])
  await screen.findByText(/接任委托已签发/)
 })
})
