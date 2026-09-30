import {expect,it} from 'vitest'
import {render,screen} from '@testing-library/react'
import {MemoryRouter,Route,Routes,useLocation} from 'react-router-dom'
import OrganizationTasksPage from '../OrganizationTasksPage'
function Destination(){const location=useLocation();return <p>{location.pathname}</p>}
it('redirects the legacy task URL to the canonical inbox',async()=>{
 render(<MemoryRouter initialEntries={['/organization-tasks']}><Routes><Route path="/organization-tasks" element={<OrganizationTasksPage/>}/><Route path="/my-assessments" element={<Destination/>}/></Routes></MemoryRouter>)
 expect(await screen.findByText('/my-assessments')).toBeInTheDocument()
})
