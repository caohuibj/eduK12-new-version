import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { SurveyCatalogGrants } from './SurveyCatalogGrants'
import type { CatalogApi } from '../../survey/ResearchCatalog'
it('clears the selected researcher when the visible page changes, hiding late old grants',async()=>{
  let resolve!:(value:unknown)=>void
  const pending=new Promise(done=>{resolve=done})
  const api=vi.fn(()=>pending)
  const props={api:api as CatalogApi,password:'synthetic-password'}
  const {rerender}=render(<SurveyCatalogGrants {...props} researchers={[{id:'r1',username:'First researcher',status:'ACTIVE'}]}/>)
  fireEvent.change(screen.getByLabelText('授权给研究者'),{target:{value:'r1'}})
  await waitFor(()=>expect(api).toHaveBeenCalledWith('/researchers/r1/tool-grants?page=1'))
  rerender(<SurveyCatalogGrants {...props} researchers={[{id:'r2',username:'Second researcher',status:'ACTIVE'}]}/>)
  expect(screen.getByLabelText('授权给研究者')).toHaveValue('')
  await act(async()=>resolve({list:[{id:'old-grant',title:'Old researcher grant',kind:'SCALE',status:'ACTIVE',sourceRef:{kind:'SCALE',sourceId:'old',sourceVersion:'1'}}]}))
  expect(screen.queryByText(/Old researcher grant/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'撤销版本授权'})).not.toBeInTheDocument()
  expect(screen.getByLabelText('授权给研究者')).toHaveValue('')
})
