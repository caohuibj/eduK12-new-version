const api=vi.hoisted(()=>({post:vi.fn()}))
vi.mock('../api/client',()=>({default:api}))
import TrainingCatalogTags from './TrainingCatalogTags'
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter,useLocation} from 'react-router-dom'
import {expect,it,vi} from 'vitest'
import { CatalogFilters, CatalogPagination } from './TrainingCatalogControls'
import { useCatalogQuery } from './useCatalogQuery'
import TrainingWorkspaceNav from './TrainingWorkspaceNav'
function Surface(){const c=useCatalogQuery('assignments_');const location=useLocation();return <><CatalogFilters key={c.stateKey} selection={c.selection} onApply={c.apply} deadline label="作业"/><CatalogPagination selection={c.selection} onApply={c.apply} loading={false} total={42} label="作业"/><pre data-testid="query">{location.search}</pre><code>{c.params}</code></>}
it('applies server filters only on submit, resets paging and preserves course-section query',async()=>{
 render(<MemoryRouter initialEntries={['/courses/c/detail?section=assignments&assignments_page=2']}><Surface/></MemoryRouter>)
 fireEvent.click(screen.getByText('检索与筛选'))
 fireEvent.change(screen.getByRole('searchbox',{name:'搜索作业'}),{target:{value:'第二期'}})
 expect(screen.getByRole('status')).toHaveTextContent('第 2 / 3 页')
 expect(screen.getByText(/section=assignments/,{selector:'pre'})).not.toHaveTextContent('第二期')
 fireEvent.click(screen.getByRole('button',{name:'查询'}))
 await waitFor(()=>expect(screen.getByText(/section=assignments/,{selector:'pre'})).toHaveTextContent('assignments_page=1'))
 expect(screen.getByText(/pageSize=20/,{selector:'code'})).toHaveTextContent('search=%E7%AC%AC%E4%BA%8C%E6%9C%9F')
 fireEvent.change(screen.getByRole('combobox',{name:'每页数量'}),{target:{value:'10'}})
 expect(screen.getByRole('status')).toHaveTextContent('第 1 / 5 页')
 fireEvent.click(screen.getByRole('button',{name:'下一页'}));expect(screen.getByRole('status')).toHaveTextContent('第 2 / 5 页')
})
it('collapses navigation on escape and supports current-page links',()=>{
 render(<MemoryRouter><TrainingWorkspaceNav activePath="/dashboard" items={[{path:'/dashboard',label:'我的课程'},{path:'/questionnaires',label:'全部测评'}]}/></MemoryRouter>)
 const trigger=screen.getByText('导航菜单');fireEvent.click(trigger);expect(trigger.parentElement).toHaveAttribute('open')
 expect(screen.getByRole('link',{name:'我的课程'})).toHaveAttribute('aria-current','page')
 fireEvent.keyDown(trigger,{key:'Escape'});expect(trigger.parentElement).not.toHaveAttribute('open');expect(trigger).toHaveFocus()
})

it('saves management-only tags with the previous tag version and retains a rejected edit',async()=>{
 const saved=vi.fn();api.post.mockResolvedValueOnce({code:409,message:'标签已变化，请刷新'})
 render(<TrainingCatalogTags id="assessment" kind="QUESTIONNAIRE" tags={['课前']} onSaved={saved}/>)
 fireEvent.click(screen.getByText(/管理标签/,{selector:'summary'}))
 fireEvent.change(screen.getByRole('textbox',{name:'测评标签'}),{target:{value:'重点，课前'}})
 fireEvent.click(screen.getByRole('button',{name:'保存标签'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('标签已变化')
 expect(screen.getByRole('textbox',{name:'测评标签'})).toHaveValue('重点，课前');expect(saved).not.toHaveBeenCalled()
 api.post.mockResolvedValueOnce({code:0,data:{tags:['重点','课前']}})
 fireEvent.click(screen.getByRole('button',{name:'保存标签'}))
 await waitFor(()=>expect(saved).toHaveBeenCalledOnce())
 expect(api.post).toHaveBeenCalledWith('/questionnaire-products/assessment/catalog-tags',{kind:'QUESTIONNAIRE',tags:['重点','课前'],expectedTags:['课前']})
})
