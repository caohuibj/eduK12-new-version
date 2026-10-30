import {afterEach,it,expect,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {EducationAssessmentRegistrationPanel} from './EducationAssessmentRegistrationPanel'
import type {PrivateToolApi} from './privateToolClient'
afterEach(cleanup)
it('reports unsaved registration title to the parent before prepare so switching authoring modes can protect it',async()=>{
 const api=vi.fn(async()=>({list:[],nextCursor:null})),changed=vi.fn()
 render(<EducationAssessmentRegistrationPanel api={api as PrivateToolApi} organizationId="synthetic-org" actorId="synthetic-author" product="TEACHER" onDraftStateChange={changed}/>)
 fireEvent.click(screen.getByRole('button',{name:'读取登记权限与资源'}))
 await screen.findByLabelText('登记标题')
 await waitFor(()=>expect(changed).toHaveBeenLastCalledWith({dirty:false,writing:false}))
 fireEvent.change(screen.getByLabelText('登记标题'),{target:{value:'尚未准备的整包任务'}})
 expect(screen.getByLabelText('登记标题')).toHaveValue('尚未准备的整包任务')
 expect(changed).toHaveBeenLastCalledWith({dirty:true,writing:false})
 fireEvent.change(screen.getByLabelText('登记标题'),{target:{value:''}})
 expect(changed).toHaveBeenLastCalledWith({dirty:false,writing:false})
 fireEvent.change(screen.getByLabelText('工具家族'),{target:{value:'COGNITIVE'}})
 expect(changed).toHaveBeenLastCalledWith({dirty:true,writing:false})
 fireEvent.click(screen.getByRole('button',{name:'关闭登记管理'}))
 // Closing hides the panel but retains its input; changing mode still discards it.
 expect(changed).toHaveBeenLastCalledWith({dirty:true,writing:false})
 expect(api).toHaveBeenCalledTimes(1)
})
