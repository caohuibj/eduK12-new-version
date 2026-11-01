import {useState} from 'react'
import {fireEvent,render,screen,within} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import CatalogDiscoveryFilters from './CatalogDiscoveryFilters'
import CatalogClassificationTags from './CatalogClassificationTags'
import {EMPTY_CATALOG_FILTERS,EMPTY_CATALOG_FACETS,catalogQuery,type CatalogFilters} from '../../api/catalogDiscovery'
const facets={...EMPTY_CATALOG_FACETS,orientation:[{id:'orientation:ACT',label:'ACT'}],response:[{id:'response:self',label:'自评'}],use:[{id:'use:research',label:'研究'}],license:[{id:'license:cc_by_nc_4_0',label:'CC BY-NC 4.0署名非商业'}]}
function Harness({apply}:{apply:(filters:CatalogFilters)=>void}){const [filters,setFilters]=useState(EMPTY_CATALOG_FILTERS);return <CatalogDiscoveryFilters filters={filters} facets={facets} onChange={setFilters} onApply={apply}/>}
describe('shared eight-axis discovery controls',()=>{
 it('sends exact source IDs for the new axes only on apply, and clears them without an approval action',()=>{
  const apply=vi.fn();render(<Harness apply={apply}/>)
  const more=screen.getByText('更多筛选').closest('details')!
  expect(more).not.toHaveAttribute('open')
  expect(screen.getByLabelText('领域')).toBeVisible()
  expect(screen.getByLabelText('人群')).toBeVisible()
  fireEvent.click(screen.getByText('更多筛选'))
  for(const [label,id]of [['理论取向','orientation:ACT'],['作答方式','response:self'],['使用场景','use:research'],['许可说明','license:cc_by_nc_4_0']])fireEvent.change(screen.getByLabelText(label),{target:{value:id}})
  expect(apply).not.toHaveBeenCalled()
  expect(screen.getByText('更多筛选（4 项已选）')).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'检索'}))
  expect(new URLSearchParams(catalogQuery(2,apply.mock.calls[0][0])).get('tags')).toBe('orientation:ACT,response:self,use:research,license:cc_by_nc_4_0')
  fireEvent.click(screen.getByRole('button',{name:'清除筛选'}))
  expect(apply).toHaveBeenLastCalledWith(EMPTY_CATALOG_FILTERS)
  expect(screen.getByText('更多筛选')).toBeVisible()
  for(const label of ['理论取向','作答方式','使用场景','许可说明'])expect(screen.getByLabelText(label)).toHaveValue('')
  expect(screen.getByText(/分类资料不代表使用许可/)).toBeVisible()
 })
 it('accepts older five-facet payloads and uses declared labels without creating unknown meanings',()=>{
  const old={population:[],construct:[],subject:[],domain:[],language:[]}
  render(<CatalogDiscoveryFilters filters={EMPTY_CATALOG_FILTERS} facets={old} onChange={()=>{}} onApply={()=>{}}/>)
  expect(within(screen.getByLabelText('许可说明')).getAllByRole('option')).toHaveLength(1)
  render(<CatalogClassificationTags tags={[{id:'license:noncommercial_only',label:'仅限非商业',facet:'license'}]}/>)
  expect(screen.getByRole('listitem')).toHaveAttribute('data-facet','license')
  expect(screen.getByRole('listitem')).toHaveTextContent('仅限非商业')
 })
})
