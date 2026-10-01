import {beforeEach,expect,it,vi} from 'vitest'
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {AnonymousStudyManager} from '../AnonymousStudyManager'
const api=vi.hoisted(()=>({list:vi.fn(),statistics:vi.fn(),create:vi.fn()}))
vi.mock('../../api/anonymousStudy',()=>({anonymousStudyApi:api}))
vi.mock('../../contexts/AuthContext',()=>({useAuth:()=>({user:{id:'publisher'}})}))
vi.mock('../../api/client',()=>({sessionFetch:vi.fn()}))
vi.mock('../../api/publicDelivery',()=>({publicDeliveryAdapter:vi.fn()}))
beforeEach(()=>{vi.resetAllMocks();api.list.mockResolvedValue({list:[{id:'s',title:'Research',status:'ACTIVE'}]});api.statistics.mockResolvedValue({list:[{id:'w',title:'Wave',ordinal:1,tokenId:'t',participants:2,completedParticipants:1,attempts:2,completedAttempts:1,abandonedAttempts:0}],countMeaning:'Counts'})})
it('loads studies on first mount and displays counts without psychological group metrics',async()=>{
 render(<AnonymousStudyManager compositeId="c" links={[]}/>)
 expect(await screen.findByRole('option',{name:'Research'})).toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('选择本人的研究'),{target:{value:'s'}})
 expect(await screen.findByText(/参与人数 2.*完成人数 1/)).toBeInTheDocument()
 expect(screen.getByText(/人数统计不提供群体心理指标/)).toBeInTheDocument()
})
it('clears prior research data and ignores late results after changing the resource',async()=>{
 let resolve!:(v:unknown)=>void;api.statistics.mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
 const view=render(<AnonymousStudyManager compositeId="c" links={[]}/>);await screen.findByRole('option',{name:'Research'})
 fireEvent.change(screen.getByLabelText('选择本人的研究'),{target:{value:'s'}});await waitFor(()=>expect(api.statistics).toHaveBeenCalled())
 api.list.mockResolvedValueOnce({list:[]});view.rerender(<AnonymousStudyManager compositeId="other" links={[]}/>)
 resolve({list:[{id:'w',title:'PRIVATE OLD WAVE',ordinal:1}],countMeaning:''})
 await waitFor(()=>expect(screen.queryByText(/PRIVATE OLD WAVE/)).not.toBeInTheDocument())
 expect(screen.queryByRole('option',{name:'Research'})).not.toBeInTheDocument()
})
