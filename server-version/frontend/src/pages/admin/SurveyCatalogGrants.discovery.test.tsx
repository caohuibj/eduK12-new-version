import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {SurveyCatalogGrants} from './SurveyCatalogGrants'
import type {CatalogApi} from '../../survey/ResearchCatalog'
import {EMPTY_CATALOG_FACETS} from '../../api/catalogDiscovery'
const person={id:'r1',username:'研究者甲',status:'ACTIVE'}
const row=(i:number)=>({ref:{kind:'SCALE' as const,sourceId:'survey-standard:exact-'+i,sourceVersion:'hash-'+i},title:'工具'+i,available:true,classificationTags:[{id:'student_self_report',label:'学生',facet:'population' as const}]})
const page=(i:number)=>({page:i,hasMore:i===1,terminalReason:i===1?null:'END_OF_CATALOG',list:[row(i===1?1:26)],tagFacets:{...EMPTY_CATALOG_FACETS,population:[{id:'student_self_report',label:'学生'}],language:[{id:'language:zh-CN',label:'简体中文'}]}})

describe('classification discovery and explicitly selected version grants',()=>{
 it('keeps exact choices across pages, changes no grants on filter/selection, and grants only the chosen version',async()=>{
  const api=vi.fn(async(path:string,method?:string)=>method==='POST'?{}:path.startsWith('/source-catalog')?page(path.includes('page=2')?2:1):{list:[]})
  render(<SurveyCatalogGrants api={api as CatalogApi} password="synthetic" researchers={[person]}/>)
  fireEvent.change(screen.getByLabelText('授权给研究者'),{target:{value:'r1'}})
  await waitFor(()=>expect(screen.getByLabelText('来源类型')).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'查询可授权版本'}));await screen.findByRole('heading',{name:'工具1'})
  const search=within(screen.getByRole('search',{name:'可授权版本检索'}))
  fireEvent.change(search.getByLabelText('人群'),{target:{value:'student_self_report'}})
  fireEvent.change(search.getByLabelText('语言'),{target:{value:'language:zh-CN'}})
  fireEvent.click(search.getByRole('button',{name:'检索'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'来源下一页'})).toBeEnabled())
  expect(api.mock.calls.filter(call=>call[0].startsWith('/source-catalog')).slice(-1)[0]?.[0]).toContain('tags=student_self_report%2Clanguage%3Azh-CN')
  fireEvent.click(screen.getByRole('checkbox',{name:'选择精确版本：工具1 · hash-1'}))
  fireEvent.click(screen.getByRole('button',{name:'来源下一页'}));await screen.findByRole('heading',{name:'工具26'})
  fireEvent.click(screen.getByRole('checkbox',{name:'选择精确版本：工具26 · hash-26'}))
  expect(screen.getByRole('heading',{name:'已选 2 个精确版本（最多10个）'})).toBeInTheDocument()
  expect(api.mock.calls.filter(call=>call[1]==='POST')).toEqual([])
  fireEvent.click(screen.getByRole('button',{name:'授权已选版本：工具26 · hash-26 → 研究者甲'}))
  await waitFor(()=>expect(api.mock.calls.filter(call=>call[1]==='POST')).toHaveLength(1))
  expect(api).toHaveBeenCalledWith('/researchers/r1/tool-grants','POST',{currentPassword:'synthetic',source:row(26).ref})
  await waitFor(()=>expect(screen.getByRole('heading',{name:'已选 1 个精确版本（最多10个）'})).toBeInTheDocument())
 })
 it('clears hidden choices when filters or target change and does not grant after a successful write followed by failed refresh',async()=>{
  let granted=false
  const api=vi.fn(async(path:string,method?:string)=>{
   if(method==='POST'){granted=true;return {}}
   if(path.startsWith('/source-catalog'))return page(1)
   if(granted)throw new Error('refresh unavailable')
   return {list:[]}
  })
  render(<SurveyCatalogGrants api={api as CatalogApi} password="synthetic" researchers={[person]}/>)
  fireEvent.change(screen.getByLabelText('授权给研究者'),{target:{value:'r1'}})
  await waitFor(()=>expect(screen.getByLabelText('来源类型')).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'查询可授权版本'}));await screen.findByRole('heading',{name:'工具1'})
  fireEvent.click(screen.getByRole('checkbox',{name:'选择精确版本：工具1 · hash-1'}))
  const search=within(screen.getByRole('search',{name:'可授权版本检索'}))
  fireEvent.click(search.getByRole('button',{name:'清除筛选'}))
  await waitFor(()=>expect(screen.getByRole('checkbox',{name:'选择精确版本：工具1 · hash-1'})).toBeEnabled())
  expect(screen.getByRole('heading',{name:'已选 0 个精确版本（最多10个）'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox',{name:'选择精确版本：工具1 · hash-1'}))
  fireEvent.click(screen.getByRole('button',{name:'授权已选版本：工具1 · hash-1 → 研究者甲'}))
  await screen.findByText(/版本授权已完成，但授权列表刷新失败/)
  expect(api.mock.calls.filter(call=>call[1]==='POST')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button',{name:'刷新现有授权（只读）'}))
  await screen.findByRole('alert')
  expect(api.mock.calls.filter(call=>call[1]==='POST')).toHaveLength(1)
 })
})
