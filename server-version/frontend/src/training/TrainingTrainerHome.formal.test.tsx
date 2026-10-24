vi.mock('./TrainingTrainerOverview', () => ({ default: () => null }))
import {beforeEach,expect,it,vi} from 'vitest'
import {render,screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
const mocks=vi.hoisted(()=>({courses:vi.fn(),grants:vi.fn()}))
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>({user:{id:'reviewer',username:'Reviewer'}})}))
vi.mock('../api/client',()=>({default:{get:mocks.courses}}))
vi.mock('../api/formalReference',()=>({formalReferenceApi:{grants:mocks.grants}}))
import TrainingTrainerHome from './TrainingTrainerHome'
beforeEach(()=>{vi.resetAllMocks();sessionStorage.clear();mocks.courses.mockResolvedValue({code:0,data:{list:[],total:0}})})
it('keeps course home focused and leaves scientific governance to the toolkit',async()=>{
 render(<MemoryRouter><TrainingTrainerHome/></MemoryRouter>)
 await screen.findByText('还没有创建课程。')
 expect(screen.queryByRole('region',{name:'正式参考独立审核与发布'})).not.toBeInTheDocument()
 expect(mocks.grants).not.toHaveBeenCalled()
})
it('does not fetch unrelated scientific authority when the course list is unavailable',async()=>{
 mocks.courses.mockRejectedValue(new Error('course unavailable'))
 render(<MemoryRouter><TrainingTrainerHome/></MemoryRouter>)
 await screen.findByText(/course unavailable/)
 expect(mocks.grants).not.toHaveBeenCalled()
})
