import { expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import OrganizationProductRoutes from '../OrganizationProductRoutes'
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'student', role: 'STUDENT' }, isLoading: false }) }))
function Destination() { const location = useLocation(); return <p>{location.pathname}</p> }
it('redirects the legacy task URL through the production router', async () => {
  render(<MemoryRouter initialEntries={['/organization-tasks']}><Routes><Route path="/organization-tasks" element={<OrganizationProductRoutes/>}/><Route path="/my-assessments" element={<Destination/>}/></Routes></MemoryRouter>)
  expect(await screen.findByText('/my-assessments')).toBeInTheDocument()
})
