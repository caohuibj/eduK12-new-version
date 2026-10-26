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
 it('shows an existing exact-version approval after reloading and allows a revised version to be reviewed',async()=>{
  let review={id:'review',title:'课堂观察共识',content:'合成共识',status:'DRAFT',revision:3,digest:'digest-3',approvalCount:1,approvedByMe:true}
  const api=vi.fn(async(_path:string)=>({list:[review]}));render(<HuiteacherConsensusReviews api={api as Api}/>)
  expect(await screen.findByText('本人已确认此版本')).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'我确认此版本的人工共识'})).not.toBeInTheDocument()
  review={...review,revision:4,digest:'digest-4',approvalCount:0,approvedByMe:false}
  fireEvent.click(screen.getByRole('button',{name:'刷新待办'}))
  expect(await screen.findByRole('button',{name:'我确认此版本的人工共识'})).toBeEnabled()
  expect(screen.queryByText('本人已确认此版本')).not.toBeInTheDocument()
  expect(api.mock.calls.every(call=>call.length===1)).toBe(true)
 })
 it('coalesces fast confirmation clicks and retains the receipt if refresh fails',async()=>{
  const review={id:'review',title:'课堂观察共识',content:'合成共识',status:'DRAFT',revision:3,digest:'digest-3',approvalCount:0}
  let reads=0,release!:(value:unknown)=>void
  const api=vi.fn((path:string)=>path==='/my-consensus-reviews'?(++reads===1?Promise.resolve({list:[review]}):Promise.reject(Error('列表刷新失败'))):new Promise(resolve=>{release=resolve}))
  vi.spyOn(window,'confirm').mockReturnValue(true);render(<HuiteacherConsensusReviews api={api as Api}/>)
  const button=await screen.findByRole('button',{name:'我确认此版本的人工共识'})
  fireEvent.click(button);fireEvent.click(button)
  expect(api.mock.calls.filter(([path])=>path.endsWith('/approve'))).toHaveLength(1)
  release({approved:true,id:'review',revision:3})
  expect(await screen.findByText('本人已确认此版本')).toBeInTheDocument()
  expect(await screen.findByText('列表刷新失败')).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'我确认此版本的人工共识'})).not.toBeInTheDocument()
 })
 it('keeps exact-version approval behind explicit confirmation',async()=>{
  const review={id:'review',title:'本次课堂观察共识',content:'合成专业共识',status:'DRAFT',revision:3,digest:'frozen-digest',approvalCount:0}
  const api=vi.fn(async(path:string)=>path==='/my-consensus-reviews'?{list:[review]}:{approved:true,id:review.id,revision:review.revision})
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
