import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {SchoolActivityContent} from './SchoolActivityContent'
import type {SchoolApi} from './SchoolRecovery'
const item={id:'one',kind:'READING',title:'待校正阅读',content:'保留的正文',updatedAt:'2026-11-23T00:00:00.000Z'}
describe('School draft content maintenance',()=>{
 it('reopens saved content, edits with a revision and explicitly removes only the selected draft',async()=>{
  let rows=[{...item}]
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(true)
  const api=vi.fn(async(path:string,method='GET',body?:any)=>{
   if(method==='GET')return {list:rows,truncated:false}
   expect(path).toBe('/activity/tasks/READING/one')
   expect(body.expectedUpdatedAt).toBe(item.updatedAt)
   if(method==='PATCH'){rows=[{...item,title:body.title,content:body.content}];return {changed:true}}
   expect(method).toBe('DELETE');rows=[];return {changed:true}
  })
  render(<SchoolActivityContent api={api as SchoolApi} path="/activity" editable disabled={false} revision={0}/>)
  fireEvent.click(await screen.findByText('查看内容'))
  expect(screen.getByText('保留的正文')).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'编辑草稿内容'}))
  fireEvent.change(screen.getByLabelText('修改内容标题'),{target:{value:'已校正阅读'}})
  fireEvent.click(screen.getByRole('button',{name:'保存内容修改'}))
  await screen.findByText('已校正阅读')
  fireEvent.click(screen.getByRole('button',{name:'移除草稿内容'}))
  expect(await screen.findByText('尚未添加内容。')).toBeVisible()
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('已校正阅读'))
  confirm.mockRestore()
 })
 it('keeps an unsaved edit on a server stale-revision rejection and never offers published mutations',async()=>{
  const api=vi.fn(async(_path:string,method='GET')=>{if(method==='GET')return {list:[item],truncated:false};throw Error('内容已被其他操作更新')})
  const {rerender}=render(<SchoolActivityContent api={api as SchoolApi} path="/a" editable disabled={false} revision={0}/>)
  fireEvent.click(await screen.findByRole('button',{name:'编辑草稿内容'}))
  fireEvent.change(screen.getByLabelText('修改内容标题'),{target:{value:'我的未保存修改'}})
  fireEvent.click(screen.getByRole('button',{name:'保存内容修改'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('其他操作更新')
  expect(screen.getByLabelText('修改内容标题')).toHaveValue('我的未保存修改')
  rerender(<SchoolActivityContent api={api as SchoolApi} path="/a" editable={false} disabled={false} revision={0}/>)
  expect(screen.queryByRole('button',{name:'移除草稿内容'})).not.toBeInTheDocument()
  // A status change also withdraws an already-open edit form.
  expect(screen.queryByRole('button',{name:'保存内容修改'})).not.toBeInTheDocument()
 })
 it('ignores an old activity response when the selected activity changes',async()=>{
  let finish!:(value:any)=>void
  const old=new Promise(resolve=>{finish=resolve})
  const api=vi.fn(async(path:string)=>path==='/old/tasks'?old:{list:[{...item,title:'当前活动内容'}],truncated:false})
  const {rerender}=render(<SchoolActivityContent api={api as SchoolApi} path="/old" editable disabled={false} revision={0}/>)
  rerender(<SchoolActivityContent api={api as SchoolApi} path="/new" editable disabled={false} revision={0}/>)
  await screen.findByText('当前活动内容')
  await act(async()=>{finish({list:[item],truncated:false});await old})
  await waitFor(()=>expect(within(screen.getByRole('region',{name:'已添加活动内容'})).queryByText(item.title)).not.toBeInTheDocument())
 })
})
