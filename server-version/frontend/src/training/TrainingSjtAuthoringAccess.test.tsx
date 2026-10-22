import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
const context = vi.hoisted(() => ({ training: true }))
vi.mock('./context', () => ({ isTrainingHost: () => context.training }))
import TrainingSjtAuthoringAccess from './TrainingSjtAuthoringAccess'

it('does not mount the SJT authoring app in Training, including direct old draft links', () => {
  context.training = true
  const authoring = vi.fn(() => <p>编制器已挂载</p>)
  const Authoring = authoring
  render(<MemoryRouter initialEntries={['/sjt-authoring?draftId=old-draft']}><TrainingSjtAuthoringAccess><Authoring/></TrainingSjtAuthoringAccess></MemoryRouter>)
  expect(screen.getByText('暂不开放情境判断编制')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '返回工具' })).toHaveAttribute('href', '/toolkit')
  expect(authoring).not.toHaveBeenCalled()
})

it('preserves the existing authoring app outside Training', () => {
  context.training = false
  render(<MemoryRouter><TrainingSjtAuthoringAccess><p>原有编制器</p></TrainingSjtAuthoringAccess></MemoryRouter>)
  expect(screen.getByText('原有编制器')).toBeInTheDocument()
})
