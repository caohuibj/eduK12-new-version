import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import GeneralQuestionnaireList from '../GeneralQuestionnaireList'

const { fetchList } = vi.hoisted(() => ({ fetchList: vi.fn() }))
vi.mock('../../../api/client', () => ({ sessionFetch: fetchList }))
vi.mock('../../../components/PublicDeliveryManager', () => ({ PublicDeliveryManager: () => null }))

describe('General questionnaire list states', () => {
  it('keeps failure mutually exclusive with empty and retries successfully', async () => {
    fetchList.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ ok: true, json: async () => ({ data: { list: [] } }) })
    const user = userEvent.setup()
    render(<MemoryRouter><GeneralQuestionnaireList /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline')
    expect(screen.queryByText('暂无泛化问卷')).toBeNull()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('暂无泛化问卷')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
