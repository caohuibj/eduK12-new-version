import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {act,render,screen,fireEvent,waitFor,within} from '@testing-library/react'
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
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks()})
function show(area:'media'|'tools'='tools',entry='/toolkit'){return render(<MemoryRouter initialEntries={[entry]}><Routes><Route path="/toolkit" element={<TrainingLibrary area={area}/>}/><Route path="/scales/:id" element={<p>量表编辑页</p>}/></Routes></MemoryRouter>)}
it('offers only scale and form creation in the tool menu',async()=>{
 show();await screen.findByText('暂无符合条件的工具')
 fireEvent.click(screen.getByText('编制工具',{selector:'summary'}))
 expect(screen.getByRole('link',{name:'编制量表'})).toHaveAttribute('href','/scales/new')
 expect(screen.getByRole('link',{name:'编制表单'})).toHaveAttribute('href','/toolkit/forms/new')
 expect(screen.queryByRole('link',{name:'编制情境判断'})).not.toBeInTheDocument()
 expect(screen.queryByRole('link',{name:'编制组合测评'})).not.toBeInTheDocument()
})
it('keeps SJT and cognitive descriptors without authoring or version actions',async()=>{
 const rows=[{...own,id:'sjt-draft',name:'情境草稿',kind:'sjt-draft',status:'DRAFT',href:'/sjt-authoring?draftId=sjt-draft'},
  {...own,id:'sjt-published',name:'情境已发布',kind:'sjt-draft',href:'/sjt-authoring?draftId=sjt-published'},
  {...grant,id:'sjt-resource',name:'已授权情境',kind:'situational',href:'/questionnaire-products/new'},
  {...grant,id:'cognitive',name:'已授权认知',kind:'cognitive',href:'/cognitive-assignments'}]
 mocks.get.mockResolvedValue({code:0,data:{list:rows,total:rows.length}});show()
 await screen.findByRole('article',{name:'已授权认知'})
 for(const row of rows){const card=within(screen.getByRole('article',{name:row.name}));expect(card.queryByRole('link')).not.toBeInTheDocument();expect(card.queryByRole('button',{name:'更新版本'})).not.toBeInTheDocument()}
 expect(mocks.post).not.toHaveBeenCalled()
})
it('opens existing composition content for editing and retains its report configuration',async()=>{
 mocks.get.mockResolvedValue({code:0,data:{list:[{...own,id:'composition',name:'组合问卷',kind:'composition',status:'DRAFT',href:'/toolkit/compositions/composition'}],total:1}});show()
 expect(await screen.findByRole('link',{name:'编辑组合问卷'})).toHaveAttribute('href','/questionnaire-products/composition')
 expect(screen.getByRole('link',{name:'配置与报告'})).toHaveAttribute('href','/toolkit/compositions/composition')
})
it.each(['media','tools'] as const)('expands and collapses a truncated %s description without opening the resource',async area=>{
 vi.spyOn(HTMLElement.prototype,'scrollHeight','get').mockReturnValue(100)
 vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(40)
 const description='完整说明文字，需要在卡片中展开查看。'.repeat(6)
 mocks.get.mockResolvedValue({code:0,data:{list:[{...own,kind:area==='media'?'image':'scale',description}],total:1}})
 show(area)
 const expand=await screen.findByRole('button',{name:'显示更多'})
 const text=document.getElementById(expand.getAttribute('aria-controls')!)!
 expect(expand).toHaveAttribute('aria-expanded','false');expect(text).not.toHaveClass('is-expanded')
 fireEvent.click(expand)
 expect(screen.getByRole('button',{name:'收起'})).toHaveAttribute('aria-expanded','true')
 expect(text).toHaveClass('is-expanded');expect(text.textContent).toBe(description)
 fireEvent.click(screen.getByRole('button',{name:'收起'}))
 expect(screen.getByRole('button',{name:'显示更多'})).toHaveAttribute('aria-expanded','false')
 expect(text).not.toHaveClass('is-expanded');expect(mocks.post).not.toHaveBeenCalled()
})
it('omits the expand button when the complete description already fits',async()=>{
 vi.spyOn(HTMLElement.prototype,'scrollHeight','get').mockReturnValue(40)
 vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(40)
 mocks.get.mockResolvedValue({code:0,data:{list:[{...own,description:'简短说明'}],total:1}})
 show();await screen.findByText('简短说明')
 expect(screen.queryByRole('button',{name:'显示更多'})).not.toBeInTheDocument()
})
it.each(['media','tools'] as const)('pages %s in groups of nine and resets to page one after filtering',async area=>{
 const rows=Array.from({length:10},(_,index)=>({...own,id:'row-'+index,name:'资源'+(index+1),kind:area==='media'?'image':'scale'}))
 mocks.get.mockImplementation(async(_path,{params})=>({code:0,data:{list:rows.slice((params.page-1)*params.pageSize,params.page*params.pageSize),total:rows.length}}))
 show(area)
 await screen.findByRole('article',{name:'资源1'})
 expect(screen.getAllByRole('article')).toHaveLength(9)
 expect(mocks.get).toHaveBeenLastCalledWith('/training-workspace/'+area,expect.objectContaining({params:expect.objectContaining({page:1,pageSize:9})}))
 expect(screen.getByRole('navigation',{name:'资源分页'})).toHaveTextContent('1 / 2')
 fireEvent.click(screen.getByRole('button',{name:'下一页'}));await screen.findByRole('article',{name:'资源10'})
 expect(screen.getAllByRole('article')).toHaveLength(1);expect(screen.getByRole('button',{name:'下一页'})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:area==='media'?'图片':'量表'}));await screen.findByRole('article',{name:'资源1'})
 expect(mocks.get).toHaveBeenLastCalledWith('/training-workspace/'+area,expect.objectContaining({params:expect.objectContaining({page:1,pageSize:9,kind:area==='media'?'image':'scale'})}))
})
it('clamps an old out-of-range page to the final nine-item page',async()=>{
 const rows=Array.from({length:19},(_,index)=>({...own,id:'row-'+index,name:'资源'+(index+1)}))
 mocks.get.mockImplementation(async(_path,{params})=>({code:0,data:{list:rows.slice((params.page-1)*params.pageSize,params.page*params.pageSize),total:rows.length}}))
 show('tools','/toolkit?page=99')
 await screen.findByRole('article',{name:'资源19'})
 expect(screen.getAllByRole('article')).toHaveLength(1)
 expect(screen.getByRole('navigation',{name:'资源分页'})).toHaveTextContent('3 / 3')
 expect(mocks.get).toHaveBeenLastCalledWith('/training-workspace/tools',expect.objectContaining({params:expect.objectContaining({page:3,pageSize:9})}))
})
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

it('routes an independent form to its form editor without report controls',async()=>{
 mocks.get.mockResolvedValue({code:0,data:{list:[{...own,kind:'form-template',status:'DRAFT',href:'/toolkit/forms/own'}],total:1}});show()
 expect(await screen.findByRole('link',{name:'编辑'})).toHaveAttribute('href','/toolkit/forms/own')
 expect(screen.queryByRole('link',{name:'配置与报告'})).not.toBeInTheDocument()
})
it('copies existing form content into an independent form without changing its original questionnaire',async()=>{
 mocks.get.mockResolvedValue({code:0,data:{list:[{...own,kind:'form-composition',version:'4',status:'DRAFT'}],total:1}})
 mocks.post.mockResolvedValue({code:0,data:{id:'saved-form'}})
 render(<MemoryRouter initialEntries={['/toolkit']}><Routes><Route path="/toolkit" element={<TrainingLibrary area="tools"/>}/><Route path="/toolkit/forms/:id" element={<p>独立表单编辑</p>}/></Routes></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button',{name:'存为独立表单'}))
 expect(await screen.findByText('独立表单编辑')).toBeInTheDocument()
 expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/questionnaire-products/form-templates',expect.objectContaining({name:'我的工具',source:{id:'own',kind:'COMPOSITE',revision:4}}))
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
