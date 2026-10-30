import {fireEvent,render,screen} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {EntryAdmissionChoices} from './EntryAdmissionChoices'
describe('entry scope selected during global intake',()=>{
 it('allows an explicit single supported entry without forcing both',()=>{
  const change=vi.fn();render(<EntryAdmissionChoices value={['TRAINING','SURVEY']} onChange={change}/>)
  fireEvent.click(screen.getByRole('checkbox',{name:'Training'}))
  expect(change).toHaveBeenCalledWith(['SURVEY'])
  expect(screen.queryByRole('checkbox',{name:'School'})).not.toBeInTheDocument()
  expect(screen.queryByRole('checkbox',{name:'Teacher'})).not.toBeInTheDocument()
 })
 it('shows an unsupported Training adapter as unavailable rather than implying admission',()=>{
  const change=vi.fn();render(<EntryAdmissionChoices value={['SURVEY']} supported={['SURVEY']} onChange={change} unavailableReason="Training cannot bind this exact combination"/>)
  expect(screen.getByRole('checkbox',{name:'Training'})).toBeDisabled()
  expect(screen.getByRole('checkbox',{name:'Survey'})).toBeChecked()
  expect(screen.getByText('Training cannot bind this exact combination')).toBeVisible()
  fireEvent.click(screen.getByRole('checkbox',{name:'Training'}));expect(change).not.toHaveBeenCalled()
 })
 it('offers the two education scopes only when the standard-combination adapter explicitly supports them',()=>{
  const change=vi.fn();render(<EntryAdmissionChoices includeEducationEntries value={['SCHOOL','TEACHER']} onChange={change}/>)
  expect(screen.getByRole('checkbox',{name:'School'})).toBeChecked()
  fireEvent.click(screen.getByRole('checkbox',{name:'Teacher'}))
  expect(change).toHaveBeenCalledWith(['SCHOOL'])
 })
})
