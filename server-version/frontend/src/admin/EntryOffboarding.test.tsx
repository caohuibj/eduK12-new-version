import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {beforeEach,expect,it,vi} from 'vitest'
import EntryOffboarding from './EntryOffboarding'

const client=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}))
vi.mock('../api/client',()=>({default:client}))

const base='/admin/permissions/accounts/incumbent/entries/SURVEY'
const review={
 version:4,digest:'a'.repeat(64),items:[{id:'wave',category:'COLLECTING',title:'春季回访',ready:false}],
 counts:{collecting:1,drafts:0,configurations:0,pending:1},
 successors:[{id:'successor',username:'接任者'}],
}
beforeEach(()=>{
 vi.resetAllMocks()
 client.get.mockImplementation(async (path:string)=>({data:path.includes('?successorId=successor')?
  {...review,digest:'b'.repeat(64),items:[{...review.items[0],ready:true}],counts:{...review.counts,pending:0}}:review}))
 client.put.mockResolvedValue({data:{changed:true}})
})
it('requires review of the chosen successor before the original role is revoked',async()=>{
 const complete=vi.fn()
 render(<EntryOffboarding account={{id:'incumbent',username:'原管理员'}} entry="SURVEY" currentVersion={4} onClose={vi.fn()} onComplete={complete}/>)
 expect(await screen.findByText(/春季回访/)).toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('撤权原因'),{target:{value:'正常轮岗'}})
 expect(screen.getByRole('button',{name:'确认交接并撤权'})).toBeDisabled()
 fireEvent.change(screen.getByLabelText('接任管理员'),{target:{value:'successor'}})
 await waitFor(()=>expect(screen.getByRole('button',{name:'确认交接并撤权'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'确认交接并撤权'}))
 await waitFor(()=>expect(complete).toHaveBeenCalledOnce())
 expect(client.put).toHaveBeenCalledWith(base,{active:false,expectedVersion:4,reason:'正常轮岗',
  offboarding:{mode:'PLANNED',digest:'b'.repeat(64),successorId:'successor'}})
})

it('requires explicit confirmation for emergency revocation even with a pending wave',async()=>{
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
 render(<EntryOffboarding account={{id:'incumbent',username:'原管理员'}} entry="SURVEY" currentVersion={4} onClose={vi.fn()} onComplete={vi.fn()}/>)
 await screen.findByText(/春季回访/)
 fireEvent.change(screen.getByLabelText('撤权原因'),{target:{value:'账号应急停用'}})
 fireEvent.change(screen.getByLabelText('撤权方式'),{target:{value:'EMERGENCY'}})
 const button=screen.getByRole('button',{name:'立即紧急撤权'})
 fireEvent.click(button)
 expect(client.put).not.toHaveBeenCalled()
 confirm.mockReturnValue(true)
 fireEvent.click(button)
 await waitFor(()=>expect(client.put).toHaveBeenCalledWith(base,expect.objectContaining({offboarding:{mode:'EMERGENCY'}})))
 confirm.mockRestore()
})

it('allows explicit emergency revocation using the listed version if impact cannot be read',async()=>{
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true)
 client.get.mockRejectedValueOnce(new Error('影响读取失败'))
 render(<EntryOffboarding account={{id:'incumbent',username:'原管理员'}} entry="SURVEY" currentVersion={4} onClose={vi.fn()} onComplete={vi.fn()}/>)
 expect(await screen.findByRole('alert')).toHaveTextContent('影响读取失败')
 fireEvent.change(screen.getByLabelText('撤权原因'),{target:{value:'账号应急停用'}})
 expect(screen.getByRole('button',{name:'确认交接并撤权'})).toBeDisabled()
 fireEvent.change(screen.getByLabelText('撤权方式'),{target:{value:'EMERGENCY'}})
 fireEvent.click(screen.getByRole('button',{name:'立即紧急撤权'}))
 await waitFor(()=>expect(client.put).toHaveBeenCalledWith(base,{active:false,expectedVersion:4,reason:'账号应急停用',offboarding:{mode:'EMERGENCY'}}))
 confirm.mockRestore()
})
