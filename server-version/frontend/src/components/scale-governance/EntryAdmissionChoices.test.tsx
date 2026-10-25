import {fireEvent,render,screen} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {EntryAdmissionChoices} from './EntryAdmissionChoices'
describe('entry scope selected during global intake',()=>{
 it('allows an explicit single supported entry without forcing both',()=>{
  const change=vi.fn();render(<EntryAdmissionChoices value={['TRAINING','SURVEY']} onChange={change}/>)
  fireEvent.click(screen.getByRole('checkbox',{name:'Training'}))
  expect(change).toHaveBeenCalledWith(['SURVEY'])
 })
 it('shows an unsupported Training adapter as unavailable rather than implying admission',()=>{
  const change=vi.fn();render(<EntryAdmissionChoices value={['SURVEY']} supported={['SURVEY']} onChange={change} unavailableReason="Training cannot bind this exact combination"/>)
  expect(screen.getByRole('checkbox',{name:'Training'})).toBeDisabled()
  expect(screen.getByRole('checkbox',{name:'Survey'})).toBeChecked()
  expect(screen.getByText('Training cannot bind this exact combination')).toBeVisible()
  fireEvent.click(screen.getByRole('checkbox',{name:'Training'}));expect(change).not.toHaveBeenCalled()
 })
})
