import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {MemoryRouter} from 'react-router-dom'
import GovernedToolLibrary from './GovernedToolLibrary'
const {catalog,policy}=vi.hoisted(()=>({catalog:vi.fn(),policy:vi.fn()}))
vi.mock('../../api/surveyGovernance',async()=>({...await vi.importActual('../../api/surveyGovernance'),governedRequest:catalog}))
vi.mock('../../api/surveyManagement',()=>({surveyManagementRequest:policy}))
vi.mock('../../contexts/AuthContext',()=>({useAuth:()=>({user:{platformRole:'STANDARD'}})}))
afterEach(cleanup)
it('lets the entry manager find an approved governed Scale and change only its exact Survey policy',async()=>{
 const row={id:'scale',title:'Governed exact Scale',family:'SCALE',state:'ONLINE',toolVersion:'1',hash:'a'.repeat(64),versions:{content:'c1',parameters:'p1',report:null},components:[],policyIdentity:{resourceKey:'governed-release:scale',fingerprint:'a'.repeat(64)},policy:{decision:'PENDING',version:0,paused:false},states:{content:{ready:true,reasons:[]},assignment:{ready:false,reasons:['尚未准入 Survey']}}}
 catalog.mockImplementation(async(_scope:string,path:string)=>({list:path.includes('family=SCALE')?[row]:[],hasMore:false}));policy.mockResolvedValue({})
 render(<MemoryRouter><GovernedToolLibrary/></MemoryRouter>)
 fireEvent.change(screen.getByLabelText('工具类型'),{target:{value:'SCALE'}});await screen.findByText(row.title)
 fireEvent.click(screen.getByText('状态、详情与操作'));fireEvent.change(screen.getByLabelText('本次范围审批或暂停原因'),{target:{value:'Synthetic exact entry admission'}})
 fireEvent.click(screen.getByRole('button',{name:'批准 Survey 使用范围'}))
 await waitFor(()=>expect(policy).toHaveBeenCalledWith('survey-library','/policies',{...row.policyIdentity,expectedVersion:0,decision:'APPROVED',paused:false,reason:'Synthetic exact entry admission'}))
 expect(screen.queryByRole('button',{name:/编辑内容|编辑参数|编辑报告/})).toBeNull()
})
