import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import ToolCatalogTags, { ToolCatalogTagsPanel } from './ToolCatalogTags'

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))
vi.mock('../../api/client', () => ({ default: api }))
const tool = { key: 'FORM:fixture', name: '验收表单', family: 'FORM', tags: ['原标签'], revision: 2 }
const page = { list: [tool], hasMore: false }

beforeEach(() => {
  api.get.mockReset().mockResolvedValue({ data: page })
  api.put.mockReset()
})

it('loads only the open entry, saves normalized labels, and refreshes the picker once', async () => {
  const refreshChoices = vi.fn()
  render(<ToolCatalogTagsPanel product="TEACHER" onChange={refreshChoices}/>)
  expect(api.get).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('工具标签'))
  const row = await screen.findByRole('article', { name: '验收表单' })
  expect(api.get).toHaveBeenCalledWith('/admin/tool-catalog-tags?product=TEACHER&page=1')
  fireEvent.click(within(row).getByRole('button', { name: /编辑标签/ }))
  fireEvent.click(within(row).getByRole('button', { name: '移除标签 原标签' }))
  const input = within(row).getByRole('textbox', { name: '新标签' })
  fireEvent.change(input, { target: { value: ' Ａ    B ' } })
  fireEvent.click(within(row).getByRole('button', { name: '添加标签' }))
  fireEvent.change(input, { target: { value: ' a b ' } })
  api.put.mockResolvedValueOnce({ data: { ...tool, tags: ['A B'], revision: 3 } })
  api.get.mockResolvedValueOnce({ data: { ...page, list: [{ ...tool, tags: ['A B'], revision: 3 }] } })
  fireEvent.click(within(row).getByRole('button', { name: '保存标签' }))
  expect(await screen.findByText('已保存「验收表单」的标签。')).toBeVisible()
  expect(api.put).toHaveBeenCalledExactlyOnceWith('/admin/tool-catalog-tags', {
    product: 'TEACHER', toolKey: tool.key, expectedRevision: 2, tags: ['A B'],
  })
  expect(refreshChoices).toHaveBeenCalledOnce()
  expect(await screen.findByText('A B')).toBeVisible()
})

it('filters by an explicitly submitted tag and resolves concurrent edits without overwriting', async () => {
  render(<ToolCatalogTags product="SURVEY"/>)
  expect(await screen.findByText('原标签')).toBeVisible()
  fireEvent.change(screen.getByRole('searchbox', { name: '按标签筛选' }), { target: { value: ' 原标签 ' } })
  fireEvent.click(screen.getByRole('button', { name: '搜索工具' }))
  const row = await screen.findByRole('article', { name: '验收表单' })
  expect(api.get).toHaveBeenLastCalledWith('/admin/tool-catalog-tags?product=SURVEY&page=1&tag=' + encodeURIComponent('原标签'))
  fireEvent.click(within(row).getByRole('button', { name: /编辑标签/ }))
  api.put.mockRejectedValueOnce(Object.assign(new Error('stale'), { status: 409 }))
  fireEvent.change(within(row).getByRole('textbox', { name: '新标签' }), { target: { value: '新分类' } })
  fireEvent.click(within(row).getByRole('button', { name: '保存标签' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('工具标签已发生变化')
  api.get.mockResolvedValueOnce({ data: { ...page, list: [{ ...tool, tags: ['原标签', '他人修改'], revision: 3 }] } })
  fireEvent.click(screen.getByRole('button', { name: '重新读取标签' }))
  expect(await screen.findByText('他人修改')).toBeVisible()
  expect(api.put).toHaveBeenCalledOnce()
})
