import {beforeEach,expect,it,vi} from 'vitest'
import {render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
const mocks=vi.hoisted(()=>({courses:vi.fn(),grants:vi.fn()}))
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>({user:{id:'reviewer',username:'Reviewer'}})}))
vi.mock('../api/client',()=>({default:{get:mocks.courses}}))
vi.mock('../api/formalReference',()=>({formalReferenceApi:{grants:mocks.grants}}))
import TrainingTrainerHome from './TrainingTrainerHome'
beforeEach(()=>{vi.resetAllMocks();sessionStorage.clear();mocks.courses.mockResolvedValue({code:0,data:{list:[],total:0}})})
it('offers the existing teacher home to an explicit reviewer with no authored courses',async()=>{
 mocks.grants.mockResolvedValue([{grantId:'grant',measurementReleaseIds:['measurement'],capabilities:['reference.review']}])
 render(<MemoryRouter><TrainingTrainerHome/></MemoryRouter>)
 await screen.findByText('还没有创建课程。')
 expect(await screen.findByRole('region',{name:'正式参考独立审核与发布'})).toBeInTheDocument()
 expect(mocks.grants).toHaveBeenCalledOnce()
})
it('does not make platform scientific authority depend on a course list read',async()=>{
 mocks.courses.mockRejectedValue(new Error('course unavailable'))
 mocks.grants.mockResolvedValue([{grantId:'grant',measurementReleaseIds:['measurement'],capabilities:['reference.publish']}])
 render(<MemoryRouter><TrainingTrainerHome/></MemoryRouter>)
 await screen.findByText(/course unavailable/)
 expect(await screen.findByRole('region',{name:'正式参考独立审核与发布'})).toBeInTheDocument()
})
it('does not render scientific controls merely because the user is a teacher',async()=>{
 mocks.grants.mockResolvedValue([]);render(<MemoryRouter><TrainingTrainerHome/></MemoryRouter>)
 await screen.findByText('还没有创建课程。');await waitFor(()=>expect(mocks.grants).toHaveBeenCalledOnce())
 expect(screen.queryByRole('region',{name:'正式参考独立审核与发布'})).not.toBeInTheDocument()
})
