import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {HuiteacherConsensusManager} from './HuiteacherConsensus'
afterEach(cleanup)
it.each([false,true])('refreshes current approvals without losing local edits: %s',async edit=>{
 let approvals=0
 const row=()=>({id:'c',title:'课堂共识',content:'已保存正文',status:'DRAFT',revision:1,approvalCount:approvals,independentEvaluatorCount:2})
 const api=vi.fn(async(path:string)=>path.endsWith('/formal-notes')?{list:[]}:path.endsWith('/consensuses')?{list:[row()]}:row())
 render(<HuiteacherConsensusManager organizationId="org" eventId="event" api={api as never}/>)
 fireEvent.click(await screen.findByRole('button',{name:'课堂共识 · 待确认'}))
 await screen.findByDisplayValue('已保存正文')
 if(edit)fireEvent.change(screen.getByLabelText('草稿正文'),{target:{value:'尚未保存的本地修改'}})
 approvals=2
 fireEvent.click(screen.getByRole('button',{name:'刷新证据和确认进度'}))
 await screen.findByText(/已确认 2 位/)
 expect(screen.getByLabelText('草稿正文')).toHaveValue(edit?'尚未保存的本地修改':'已保存正文')
 await waitFor(()=>edit?expect(screen.getByRole('button',{name:'两人签署后正式发布'})).toBeDisabled():expect(screen.getByRole('button',{name:'两人签署后正式发布'})).toBeEnabled())
})
