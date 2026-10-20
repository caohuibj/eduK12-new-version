import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn()}))
vi.mock('../../../api/client',()=>({default:api}))
vi.mock('../../../contexts/CapabilitiesContext',()=>({useCognitiveEnabled:()=>true}))
vi.mock('../../../contexts/AuthContext',()=>({useAuth:()=>({user:{id:'teacher',role:'TEACHER'}})}))
vi.mock('../../../components/PublicDeliveryManager',()=>({PublicDeliveryManager:({groupIpEligible}: {groupIpEligible?:boolean})=><p>group eligibility: {String(Boolean(groupIpEligible))}</p>}))
import { QuestionnaireProductEdit } from '../QuestionnaireProducts'
const course={id:'training',title:'Training',courseType:'TRAINING_COURSE'}
const published={id:'task',productKind:'QUESTIONNAIRE',name:'Task',status:'PUBLISHED',revision:1,questionnaireType:'COURSE',questionnaireCourses:[{courseId:'training'}],publicEnabled:true,maxAttempts:1,items:[],formSections:[]}
beforeEach(()=>vi.resetAllMocks())
function mount(extra:Record<string,unknown>={},courses:Record<string,unknown>[]=[course]){
 api.get.mockImplementation(async(path:string)=>({code:0,data:path.endsWith('/resources')?{scales:[],cognitive:[],situational:[],courses}:{...published,...extra}}))
 render(<MemoryRouter initialEntries={['/questionnaire-products/task']}><Routes><Route path="/questionnaire-products/:id" element={<QuestionnaireProductEdit/>}/></Routes></MemoryRouter>)
}
it('enables only a published single Training binding from server catalog, independent of hostname',async()=>{
 mount();expect(await screen.findByText('group eligibility: true')).toBeInTheDocument()
})
it.each([
 ['missing catalog',{},[]],
 ['legacy course',{},[{...course,courseType:'LEGACY'}]],
 ['library',{},[{...course,isLibrary:true}]],
 ['unknown type',{},[{id:'training',title:'Unknown'}]],
 ['multiple bindings',{questionnaireCourses:[{courseId:'training'},{courseId:'other'}]},[course]],
 ['general',{questionnaireType:'GENERAL'},[course]],
 ['non-questionnaire',{productKind:'COMPOSITE'},[course]],
] as const)('keeps opt-in unavailable for %s',async(_label,extra,courses)=>{
 mount(extra,[...courses]);expect(await screen.findByText('group eligibility: false')).toBeInTheDocument()
})
