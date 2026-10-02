import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RelationalAvailabilityProvider, useRelationalAvailability } from '../RelationalAvailabilityContext'
import { navigationFor } from '../../components/app-shell/navigation'
const state = vi.hoisted(() => ({ user: { id: 'one', role: 'PARENT' }, catalog: vi.fn(), tasks: vi.fn() }))
vi.mock('../AuthContext', () => ({ useAuth: () => ({ user: state.user }) }))
vi.mock('../../api/relational', () => ({ relationalApi: { catalog: state.catalog, tasks: state.tasks } }))
function Probe() { const { status, retry } = useRelationalAvailability(); return <><p>{status}</p><button onClick={retry}>retry</button></> }
beforeEach(() => { vi.resetAllMocks(); state.user = { id: 'one', role: 'PARENT' }; state.catalog.mockResolvedValue([]); state.tasks.mockResolvedValue([]) })
describe('relational discovery', () => {
  it.each(['STUDENT', 'PARENT', 'TEACHER'] as const)('hides an empty %s product but retains the Run inbox', role => {
    expect(navigationFor(role, true, false).some(item => item.path === '/relational/tasks')).toBe(false)
    expect(navigationFor(role, true, false).some(item => item.path === '/my-assessments')).toBe(true)
    expect(navigationFor(role, true, true).some(item => item.path === '/relational/tasks')).toBe(true)
  })
  it('reports empty only after both authenticated queries succeed', async () => {
    render(<RelationalAvailabilityProvider><Probe/></RelationalAvailabilityProvider>)
    expect(await screen.findByText('empty')).toBeInTheDocument()
  })
  it.each(['catalog', 'tasks'] as const)('shows discovery for published catalog or any historical task (%s)', async source => {
    state[source].mockResolvedValue([{ status: 'COMPLETED', launchable: false }])
    render(<RelationalAvailabilityProvider><Probe/></RelationalAvailabilityProvider>)
    expect(await screen.findByText('available')).toBeInTheDocument()
  })
  it('keeps failure distinct from empty and supports retry', async () => {
    state.tasks.mockRejectedValueOnce(new Error('offline'))
    render(<RelationalAvailabilityProvider><Probe/></RelationalAvailabilityProvider>)
    expect(await screen.findByText('error')).toBeInTheDocument()
    fireEvent.click(screen.getByText('retry'))
    expect(await screen.findByText('empty')).toBeInTheDocument()
  })
  it('does not expose the previous identity while the next discovery is pending', async () => {
    state.tasks.mockResolvedValueOnce([{}]).mockImplementationOnce(() => new Promise(() => {}))
    const view = render(<RelationalAvailabilityProvider><Probe/></RelationalAvailabilityProvider>)
    await screen.findByText('available')
    state.user = { id: 'two', role: 'PARENT' }
    view.rerender(<RelationalAvailabilityProvider><Probe/></RelationalAvailabilityProvider>)
    expect(screen.getByText('loading')).toBeInTheDocument()
  })
})
