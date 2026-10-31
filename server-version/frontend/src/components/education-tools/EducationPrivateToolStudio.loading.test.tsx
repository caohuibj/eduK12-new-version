import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {EducationPrivateToolStudio} from './EducationPrivateToolStudio'
import type {PrivateToolApi} from './privateToolClient'
afterEach(()=>{cleanup();vi.restoreAllMocks()})
it('loads Teacher package data only on its tab and keeps an unsaved questionnaire when switching is declined',async()=>{
 const base='/organizations/org/private-tools'
 const api=vi.fn(async(path:string)=>{
  if([base,base+'?kind=COMPOSITION',base+'/package-sources'].includes(path))return {list:[],nextCursor:null}
  throw Error('Unexpected '+path)
 })
 render(<EducationPrivateToolStudio api={api as PrivateToolApi} organizationId="org" actorId="author" entry="TEACHER"/>)
 await waitFor(()=>expect(screen.queryByText('正在读取或保存，请稍候…')).not.toBeInTheDocument())
 expect(api.mock.calls.map(([path])=>path)).toEqual([base])
 fireEvent.click(screen.getByRole('button',{name:'普通问卷'}))
 const title=await screen.findByLabelText('问卷名称')
 await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'?kind=COMPOSITION'))
 fireEvent.change(title,{target:{value:'保留我的问卷'}})
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
 fireEvent.click(screen.getByRole('button',{name:'正式整包 · 整体引用'}))
 expect(confirm).toHaveBeenCalledTimes(1)
 expect(title).toHaveValue('保留我的问卷')
 expect(api.mock.calls.some(([path])=>path.endsWith('/package-sources'))).toBe(false)
 confirm.mockReturnValue(true)
 fireEvent.click(screen.getByRole('button',{name:'正式整包 · 整体引用'}))
 await screen.findByText('当前学校下暂无获授权的正式固定包。')
 expect(api.mock.calls.map(([path])=>path)).toEqual([base,base+'?kind=COMPOSITION',base+'/package-sources'])
})
