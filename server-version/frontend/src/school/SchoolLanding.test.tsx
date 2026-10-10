import {describe,it,expect,vi} from 'vitest'
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {SchoolCodeRegistration,SchoolPublicHeader,type SchoolRegistrationEntry} from './SchoolLanding'

describe('unified campus entry',()=>{
 it.each([
  {kind:'STUDENT',organizationId:'school',classUnitId:'class'},
  {kind:'PARENT'}, {kind:'STAFF',role:'TEACHER'},
  {kind:'STAFF',role:'COUNSELOR'}, {kind:'STAFF',role:'ADMIN'},
 ] as SchoolRegistrationEntry[])('uses the server result %j without asking for a role',async entry=>{
  const api=vi.fn(async()=>entry),done=vi.fn()
  render(<SchoolCodeRegistration api={api} onResolved={done} onLogin={()=>{}}/>)
  fireEvent.change(screen.getByLabelText('注册码'),{target:{value:'  abcdefghijklmnopqrstuvwx  '}})
  fireEvent.submit(screen.getByRole('button',{name:'继续注册'}).closest('form')!)
  await waitFor(()=>expect(done).toHaveBeenCalledWith(entry,'abcdefghijklmnopqrstuvwx'))
  expect(api).toHaveBeenCalledWith('/registration/resolve','POST',{code:'abcdefghijklmnopqrstuvwx'})
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
 })
 it('keeps unavailable codes on the code form and permits retry',async()=>{
  const api=vi.fn().mockRejectedValueOnce(new Error('注册码暂不可用')).mockResolvedValue({kind:'PARENT'}),done=vi.fn()
  render(<SchoolCodeRegistration api={api} onResolved={done} onLogin={()=>{}}/>)
  fireEvent.change(screen.getByLabelText('注册码'),{target:{value:'abcdefghijklmnopqrstuvwx'}})
  fireEvent.submit(screen.getByRole('button',{name:'继续注册'}).closest('form')!)
  await screen.findByRole('alert'); expect(done).not.toHaveBeenCalled()
  fireEvent.submit(screen.getByRole('button',{name:'继续注册'}).closest('form')!)
  await waitFor(()=>expect(done).toHaveBeenCalledTimes(1))
 })
 it('ignores delayed discovery after leaving registration',async()=>{
  let resolve!:(value:SchoolRegistrationEntry)=>void
  const api=vi.fn(()=>new Promise<SchoolRegistrationEntry>(r=>{resolve=r})),done=vi.fn()
  const view=render(<SchoolCodeRegistration api={api} onResolved={done} onLogin={()=>{}}/>)
  fireEvent.change(screen.getByLabelText('注册码'),{target:{value:'abcdefghijklmnopqrstuvwx'}})
  fireEvent.submit(screen.getByRole('button',{name:'继续注册'}).closest('form')!)
  view.unmount(); resolve({kind:'PARENT'}); await Promise.resolve(); expect(done).not.toHaveBeenCalled()
 })
 it('closes navigation with Escape and returns focus to the toggle',()=>{
  render(<SchoolPublicHeader onHome={()=>{}} onLogin={()=>{}} onRegister={()=>{}} onExplore={()=>{}} home/>)
  fireEvent.click(screen.getByRole('button',{name:'打开菜单'}))
  expect(screen.getByRole('button',{name:'关闭菜单'})).toHaveAttribute('aria-expanded','true')
  fireEvent.keyDown(document,{key:'Escape'})
  expect(screen.getByRole('button',{name:'打开菜单'})).toHaveFocus()
 })
})
