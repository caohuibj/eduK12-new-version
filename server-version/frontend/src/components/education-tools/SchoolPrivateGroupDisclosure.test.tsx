import {useState} from 'react'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {SchoolPrivateGroupDisclosure,type SchoolPrivateGroupSelection} from './SchoolPrivateGroupDisclosure'
afterEach(cleanup)
it('requires an explicit audience choice and discards it on opt-out; stale source pins cannot carry forward',()=>{
 const choice={blockId:'block-A',versionId:'fixed-A',contentHash:'hash-A',title:'固定量表 A',minimumRespondents:12,
  metrics:[{key:'total',label:'总分'}],audiences:{PROFESSIONAL:['total'],TEACHER:[],ORGANIZATION:['total']}}
 const changes=vi.fn()
 function Editor(){
  const [value,setValue]=useState<SchoolPrivateGroupSelection|null>(null)
  return <SchoolPrivateGroupDisclosure choices={[choice]} value={value} onChange={next=>{changes(next);setValue(next)}}/>
 }
 const view=render(<Editor/>)
 fireEvent.click(screen.getByLabelText('为新来源版本明确选择群体披露'))
 expect(changes).toHaveBeenLastCalledWith({schemaVersion:1,minimumRespondents:12,leaves:[]})
 fireEvent.click(screen.getByLabelText('心理专业人员 · 总分'))
 const selected=changes.mock.lastCall![0] as SchoolPrivateGroupSelection
 expect(selected.leaves).toEqual([{blockId:'block-A',versionId:'fixed-A',contentHash:'hash-A',audiences:{PROFESSIONAL:['total'],TEACHER:[],ORGANIZATION:[]}}])
 expect((screen.getByLabelText('学校管理者 · 总分') as HTMLInputElement).checked).toBe(false)
 expect(screen.queryByLabelText('教师 · 总分')).toBeNull()
 fireEvent.click(screen.getByLabelText('为新来源版本明确选择群体披露'))
 expect(changes).toHaveBeenLastCalledWith(null)
 view.rerender(<SchoolPrivateGroupDisclosure choices={[{...choice,contentHash:'changed'}]} value={selected} onChange={changes}/>)
 expect(screen.getByRole('alert').textContent).toContain('固定来源或群体披露上限已变化')
 expect(screen.queryByLabelText('心理专业人员 · 总分')).toBeNull()
})
