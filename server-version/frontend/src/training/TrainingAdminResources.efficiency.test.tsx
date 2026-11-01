import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {expect,it,vi} from 'vitest'
import TrainingAdminResources from './TrainingAdminResources'
import type {Resource} from './trainingResourceCatalog'
import {EMPTY_CATALOG_FACETS,EMPTY_CATALOG_FILTERS} from '../api/catalogDiscovery'
const catalog=vi.hoisted(()=>vi.fn())
vi.mock('./trainingResourceCatalog',()=>({trainingResourceCatalog:catalog}))
it('only requests applied server filters and clears lifecycle and classification together',async()=>{
 const row:Resource={id:'exact',type:'SCALE',name:'Resource exact',code:'CODE',version:'1',status:'PUBLISHED',grantable:false,note:'Exact version'}
 const response=(list:Resource[])=>({list,page:1,pageSize:20,hasMore:false,total:list.length,tagFacets:EMPTY_CATALOG_FACETS})
 catalog.mockResolvedValue(response([row]))
 render(<TrainingAdminResources/>);await screen.findByText(row.name)
 fireEvent.click(screen.getByRole('button',{name:'资源检索'}))
 for(const value of ['R','Re','Res','Resource'])fireEvent.change(screen.getByRole('searchbox'),{target:{value}})
 expect(catalog).toHaveBeenCalledTimes(1)
 fireEvent.change(screen.getByLabelText('发布状态'),{target:{value:'DRAFT'}})
 expect(catalog).toHaveBeenCalledTimes(1)
 catalog.mockResolvedValueOnce(response([]))
 fireEvent.click(screen.getByRole('button',{name:'检索'}))
 await screen.findByText('未找到匹配资源')
 expect(catalog).toHaveBeenLastCalledWith('SCALE',expect.any(Function),{page:1,filters:{...EMPTY_CATALOG_FILTERS,keyword:'Resource'},status:'DRAFT'})
 fireEvent.click(screen.getByRole('button',{name:'清除筛选'}))
 await screen.findByText(row.name)
 expect(catalog).toHaveBeenLastCalledWith('SCALE',expect.any(Function),{page:1,filters:EMPTY_CATALOG_FILTERS,status:'all'})
 fireEvent.click(screen.getByRole('button',{name:'刷新资源'}))
 await waitFor(()=>expect(catalog).toHaveBeenCalledTimes(4))
})
