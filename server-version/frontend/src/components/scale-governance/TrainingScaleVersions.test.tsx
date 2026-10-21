import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { TrainingScaleVersions } from './TrainingScaleVersions'
const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../api/client', () => ({ default: api }))
beforeEach(() => { vi.resetAllMocks() })
it('loads the actual same-family history on request and links each exact version', async () => {
  api.get.mockResolvedValue({ code: 0, data: { list: [{ id: 'first', name: '量表', status: 'PUBLISHED', authoringVersion: 1 }, { id: 'second', name: '量表', status: 'DRAFT', authoringVersion: 2 }] } })
  render(<MemoryRouter><TrainingScaleVersions sourceId="second"/></MemoryRouter>)
  expect(api.get).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '查看同量表版本历史' }))
  expect(await screen.findByRole('link', { name: '量表 · v1' })).toHaveAttribute('href', '/scales/first')
  expect(screen.getByRole('link', { name: '量表 · v2' })).toHaveAttribute('href', '/scales/second')
  expect(api.get).toHaveBeenCalledWith('/scales/second/versions')
})
