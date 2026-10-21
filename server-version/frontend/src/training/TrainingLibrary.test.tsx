import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {act,render,screen,fireEvent,waitFor} from '@testing-library/react'
import {Link,MemoryRouter,Routes,Route} from 'react-router-dom'
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn(),governance:vi.fn()}))
vi.mock('../api/client',()=>({default:{get:mocks.get,post:mocks.post,patch:mocks.patch}}))
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>({user:{id:'teacher',role:'TEACHER'}})}))
vi.mock('./FormalReferenceStudio',()=>({default:()=>{mocks.governance();return <div>参考治理已打开</div>}}))
vi.mock('../components/MediaSelector',()=>({default:()=>null}))
import TrainingLibrary from './TrainingLibrary'
const own={canUpdateVersion:true,id:'own',name:'我的工具',kind:'scale',source:'owned',status:'PUBLISHED',version:'1.0.0',href:'/scales/own'}
const grant={id:'grant',name:'授权工具',kind:'scale',source:'granted',status:'PUBLISHED',href:'/scales/grant'}
beforeEach(()=>{vi.clearAllMocks();mocks.get.mockResolvedValue({code:0,data:{list:[],total:0}})})
afterEach(()=>vi.useRealTimers())
function show(area:'media'|'tools'='tools'){return render(<MemoryRouter initialEntries={['/toolkit']}><Routes><Route path="/toolkit" element={<TrainingLibrary area={area}/>}/><Route path="/scales/:id" element={<p>量表编辑页</p>}/></Routes></MemoryRouter>)}
it('offers version updates only for own published tools and creates a draft through the existing copy API',async()=>{
 mocks.get.mockResolvedValue({code:0,data:{list:[own,grant],total:2}});mocks.post.mockResolvedValue({code:0,data:{id:'next'}});show()
 expect(await screen.findByText('授权工具')).toBeInTheDocument();expect(screen.getAllByRole('button',{name:'更新版本'})).toHaveLength(1)
 fireEvent.click(screen.getByRole('button',{name:'更新版本'}));expect(await screen.findByText('量表编辑页')).toBeInTheDocument();expect(mocks.post).toHaveBeenCalledWith('/scales/own/copy',{})
})
it('searches and filters through the server, resets paging and does not mount governance until requested',async()=>{
 show();await screen.findByText('暂无符合条件的工具');expect(mocks.governance).not.toHaveBeenCalled()
 fireEvent.change(screen.getByLabelText('检索工具'),{target:{value:'认知'}});fireEvent.submit(screen.getByRole('search'))
 await waitFor(()=>expect(mocks.get).toHaveBeenLastCalledWith('/training-workspace/tools',expect.objectContaining({params:expect.objectContaining({keyword:'认知',page:1})})))
 fireEvent.change(screen.getByLabelText('资源来源'),{target:{value:'granted'}})
 await waitFor(()=>expect(mocks.get).toHaveBeenLastCalledWith('/training-workspace/tools',expect.objectContaining({params:expect.objectContaining({source:'granted'})})))
 fireEvent.click(screen.getByText('参考、阈值与报告管理'));expect(await screen.findByText('参考治理已打开')).toBeInTheDocument()
})
it('renames only owned media and keeps its exact identity in the request',async()=>{
 mocks.get.mockResolvedValue({code:0,data:{list:[{...own,kind:'image',url:'/image'},{...grant,kind:'image',url:'/grant'}],total:2}});mocks.patch.mockResolvedValue({code:0});show('media')
 expect(await screen.findByText('授权工具')).toBeInTheDocument();expect(screen.getAllByRole('button',{name:'改名'})).toHaveLength(1)
 fireEvent.click(screen.getByRole('button',{name:'改名'}));fireEvent.change(screen.getByLabelText('显示名称'),{target:{value:'新的名称'}});fireEvent.click(screen.getByRole('button',{name:'保存名称'}))
 expect(await screen.findByText('名称已更新，已有引用保持有效。')).toBeInTheDocument();expect(mocks.patch).toHaveBeenCalledWith('/training-workspace/media/own/name',{name:'新的名称'})
})
it('does not present a failed request as an empty library',async()=>{
 mocks.get.mockRejectedValue(new Error('连接中断'));show();expect(await screen.findByRole('alert')).toHaveTextContent('连接中断');expect(screen.queryByText('暂无符合条件的工具')).not.toBeInTheDocument()
})

it('routes a plain form directly to content editing without report controls',async()=>{
 mocks.get.mockResolvedValue({code:0,data:{list:[{...own,kind:'form-composition',status:'DRAFT'}],total:1}});show()
 expect(await screen.findByRole('link',{name:'编辑'})).toHaveAttribute('href','/questionnaire-products/own')
 expect(screen.queryByRole('link',{name:'配置与报告'})).not.toBeInTheDocument()
})

it('automatically dismisses a successful rename after five seconds',async()=>{
 vi.useFakeTimers();mocks.get.mockResolvedValue({code:0,data:{list:[{...own,kind:'image'}],total:1}});mocks.patch.mockResolvedValue({code:0})
 await act(async()=>{show('media')})
 fireEvent.click(screen.getByRole('button',{name:'改名'}));fireEvent.change(screen.getByLabelText('显示名称'),{target:{value:'新的名称'}})
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'保存名称'}))})
 expect(screen.getByText('名称已更新，已有引用保持有效。')).toBeInTheDocument()
 act(()=>vi.advanceTimersByTime(4999));expect(screen.getByText('名称已更新，已有引用保持有效。')).toBeInTheDocument()
 act(()=>vi.advanceTimersByTime(1));expect(screen.queryByText('名称已更新，已有引用保持有效。')).not.toBeInTheDocument()
})
it('clears the success notice when changing resource tabs and workspace areas, including on return',async()=>{
 mocks.get.mockResolvedValue({code:0,data:{list:[{...own,kind:'image'}],total:1}});mocks.patch.mockResolvedValue({code:0})
 render(<MemoryRouter initialEntries={['/media-library']}><Link to="/toolkit">切到工具包</Link><Link to="/media-library">回到媒体库</Link><Routes><Route path="/media-library" element={<TrainingLibrary key="media" area="media"/>}/><Route path="/toolkit" element={<TrainingLibrary key="tools" area="tools"/>}/></Routes></MemoryRouter>)
 await screen.findByText('我的工具');fireEvent.click(screen.getByRole('button',{name:'改名'}));fireEvent.click(screen.getByRole('button',{name:'保存名称'}))
 await screen.findByText('名称已更新，已有引用保持有效。')
 fireEvent.click(screen.getByRole('button',{name:'图片'}));await waitFor(()=>expect(screen.queryByText('名称已更新，已有引用保持有效。')).not.toBeInTheDocument())
 await screen.findByText('我的工具');fireEvent.click(screen.getByRole('button',{name:'改名'}));fireEvent.click(screen.getByRole('button',{name:'保存名称'}));await screen.findByText('名称已更新，已有引用保持有效。')
 fireEvent.click(screen.getByRole('link',{name:'切到工具包'}));await screen.findByRole('heading',{name:'工具',level:1});expect(screen.queryByText('名称已更新，已有引用保持有效。')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('link',{name:'回到媒体库'}));await screen.findByRole('heading',{name:'媒体',level:1});expect(screen.queryByText('名称已更新，已有引用保持有效。')).not.toBeInTheDocument()
})
