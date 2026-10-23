import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: undefined as { role: 'STUDENT' | 'TEACHER' } | undefined }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('./context', () => ({ isTrainingHost: () => true }))
import TrainingFeaturePage from './TrainingFeaturePage'
import TrainingPortal from './TrainingPortal'
import TrainingContactPage from './TrainingContactPage'

function show(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/" element={<TrainingPortal />} />
    <Route path="/features/:feature" element={<TrainingFeaturePage />} />
    <Route path="/contact" element={<TrainingContactPage />} />
  </Routes></MemoryRouter>)
}

beforeEach(() => {
  auth.user = undefined
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

describe('Training public feature navigation', () => {
  it('opens the empty contact page from the homepage text panel', () => {
    show()
    const contact = screen.getByRole('link', { name: '联系我们' })
    expect(contact.closest('.training-portal-copy')).not.toBeNull()
    expect(contact.closest('header')).toBeNull()
    fireEvent.click(contact)
    expect(screen.getByRole('heading', { level: 1, name: '联系我们' })).toBeInTheDocument()
    expect(screen.queryByRole('form')).toBeNull()
  })
  it.each([
    ['课程与学习', '把每一次学习，连成一条清晰的路。', '/dashboard'],
    ['测评与工具', '选择合适的工具，让学习得到回应。', '/toolkit'],
    ['素材与资源', '让合适的素材，在需要的地方出现。', '/media-library'],
    ['进度与反馈', '看见走过的路，再走好下一步。', '/dashboard'],
  ])('opens %s from its homepage card and preserves the feature destination at login', (title, headline, path) => {
    show()
    fireEvent.click(screen.getByRole('link', { name: `${title}，查看功能介绍` }))
    expect(screen.getByRole('heading', { level: 1, name: headline })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '登录并进入功能' })).toHaveAttribute('href', `/login?returnTo=${encodeURIComponent(path)}`)
    expect(screen.getByRole('link', { name: '登录并进入课程' })).toHaveAttribute('href', '/login?returnTo=%2Fstudent')
  })

  it('lets readers move between feature pages and marks the current page', () => {
    show('/features/courses')
    fireEvent.click(screen.getByRole('link', { name: '02 测评与工具' }))
    expect(screen.getByRole('heading', { level: 1, name: '选择合适的工具，让学习得到回应。' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '02 测评与工具' })).toHaveAttribute('aria-current', 'page')
  })

  it('takes signed-in learners to their courses rather than a trainer library', () => {
    auth.user = { role: 'STUDENT' }
    show('/features/resources')
    expect(screen.getByRole('link', { name: '进入我的课程' })).toHaveAttribute('href', '/student')
    expect(screen.queryByText('培训师入口')).toBeNull()
  })

  it('takes signed-in trainers directly to the corresponding workspace', () => {
    auth.user = { role: 'TEACHER' }
    show('/features/resources')
    expect(screen.getByRole('link', { name: '进入媒体空间' })).toHaveAttribute('href', '/media-library')
    expect(screen.queryByText('学员入口')).toBeNull()
  })

  it('offers a route home for an unknown feature URL', () => {
    show('/features/unknown')
    expect(screen.getByRole('heading', { level: 1, name: '暂未找到这项功能介绍' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回首页' })).toHaveAttribute('href', '/')
  })
})
