import {render,screen} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import InstrumentAuthorization from './InstrumentAuthorization'
const api=vi.hoisted(()=>({list:vi.fn(),create:vi.fn(),approve:vi.fn(),publishPreviewScale:vi.fn()}))
vi.mock('../../api/instrumentAuthorizations',()=>({instrumentAuthorizationApi:api}))
describe('Retired copyright ledger',()=>{
 it('shows a truthful retirement notice without reading or writing records',()=>{
  render(<InstrumentAuthorization training/>);
  expect(screen.getByRole('status')).toHaveTextContent('系统不判断是否已获许可')
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  for(const call of Object.values(api))expect(call).not.toHaveBeenCalled()
 })
})
