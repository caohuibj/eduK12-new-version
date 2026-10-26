import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {HuiteacherConsensusReviews} from './HuiteacherConsensus'
type Api=Parameters<typeof HuiteacherConsensusReviews>[0]['api']
afterEach(()=>{cleanup();vi.restoreAllMocks()})
describe('Teacher personal consensus review states',()=>{
 it('distinguishes a failed read from an empty inbox and retries only the existing read',async()=>{
  const api=vi.fn().mockRejectedValueOnce(Error('暂时无法读取')).mockResolvedValue({list:[]})
  render(<HuiteacherConsensusReviews api={api as Api}/>)
  expect(await screen.findByText('暂时无法读取')).toBeInTheDocument()
  expect(screen.queryByText(/暂无需要你确认的共识/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'刷新待办'}))
  expect(await screen.findByText(/暂无需要你确认的共识/)).toBeInTheDocument()
  expect(screen.queryByText('暂时无法读取')).not.toBeInTheDocument()
  expect(api.mock.calls).toEqual([['/my-consensus-reviews'],['/my-consensus-reviews']])
 })
 it('keeps exact-version approval behind explicit confirmation',async()=>{
  const review={id:'review',title:'本次课堂观察共识',content:'合成专业共识',status:'DRAFT',revision:3,digest:'frozen-digest',approvalCount:0}
  const api=vi.fn(async(path:string)=>path==='/my-consensus-reviews'?{list:[review]}:{ok:true})
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
  render(<HuiteacherConsensusReviews api={api as Api}/>)
  const approve=await screen.findByRole('button',{name:'我确认此版本的人工共识'})
  expect(screen.queryByText(/暂无需要你确认的共识/)).not.toBeInTheDocument()
  fireEvent.click(approve)
  expect(api).toHaveBeenCalledTimes(1)
  confirm.mockReturnValue(true);fireEvent.click(approve)
  await waitFor(()=>expect(api).toHaveBeenCalledWith('/consensuses/review/approve','POST',{expectedRevision:3,expectedDigest:'frozen-digest'}))
  expect(await screen.findByText('本人对该版本的确认已保存。')).toBeInTheDocument()
 })
})
