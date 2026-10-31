import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,it,expect,vi} from 'vitest'
import {EducationPrivateScalePicker} from './EducationPrivateScalePicker'
import type {PrivateToolApi} from './privateToolClient'
afterEach(cleanup)
it('posts only explicit School SELF group selections and clears them when the administration changes',async()=>{
 const choice={versionId:'fixed',contentHash:'fixed-hash',title:'Fixed source',minimumRespondents:10,metrics:[{key:'total',label:'总分'}],
  audiences:{PROFESSIONAL:[],TEACHER:[],ORGANIZATION:['total']}}
 const api=vi.fn(async(_path:string,method?:string)=>method==='POST'?{}:{list:[{toolId:'tool',versionId:'fixed',title:'Fixed source',sourceRevision:1,contentHash:'fixed-hash',createdAt:'synthetic',groupChoice:choice}],nextCursor:null})
 render(<EducationPrivateScalePicker entry="SCHOOL" organizationId="org" actorKey="author" scopeKey="run" api={api as PrivateToolApi}
  endpoint="/run/private-track" expectedVersion={4} disabled={false} onBusy={vi.fn()} onRefresh={async()=>{}}/>)
 fireEvent.click(screen.getByRole('button',{name:'读取我的固定量表'}));await screen.findByRole('option',{name:/Fixed source/})
 fireEvent.change(screen.getByLabelText('我的量表 · 固定版本'),{target:{value:'fixed'}})
 fireEvent.change(screen.getByLabelText('本次作答方式'),{target:{value:'SELF'}})
 fireEvent.click(screen.getByLabelText('为新来源版本明确选择群体披露'))
 expect((screen.getByRole('button',{name:'加入我的固定量表'}) as HTMLButtonElement).disabled).toBe(true)
 fireEvent.click(screen.getByLabelText('学校管理者 · 总分'))
 fireEvent.click(screen.getByRole('button',{name:'加入我的固定量表'}))
 await waitFor(()=>expect(api.mock.calls.some(call=>call[1]==='POST')).toBe(true))
 const sent=api.mock.calls.find(call=>call[1]==='POST') as unknown as [string,string,{privateScale:{groupReporting:unknown}}]
 expect(sent[2].privateScale.groupReporting).toEqual({schemaVersion:1,minimumRespondents:10,leaves:[{blockId:undefined,versionId:'fixed',contentHash:'fixed-hash',audiences:{PROFESSIONAL:[],TEACHER:[],ORGANIZATION:['total']}}]})
 await waitFor(()=>expect((screen.getByLabelText('本次作答方式') as HTMLSelectElement).value).toBe(''))
 fireEvent.change(screen.getByLabelText('我的量表 · 固定版本'),{target:{value:'fixed'}})
 fireEvent.change(screen.getByLabelText('本次作答方式'),{target:{value:'SELF'}})
 fireEvent.click(screen.getByLabelText('为新来源版本明确选择群体披露'))
 fireEvent.click(screen.getByLabelText('学校管理者 · 总分'))
 fireEvent.change(screen.getByLabelText('本次作答方式'),{target:{value:'PARENT_REPORT'}})
 expect(screen.queryByLabelText('为新来源版本明确选择群体披露')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'加入我的固定量表'}))
 await waitFor(()=>expect(api.mock.calls.filter(call=>call[1]==='POST')).toHaveLength(2))
 const second=api.mock.calls.filter(call=>call[1]==='POST')[1] as unknown as [string,string,{privateScale:Record<string,unknown>}]
 expect(second[2].privateScale).not.toHaveProperty('groupReporting')
})
