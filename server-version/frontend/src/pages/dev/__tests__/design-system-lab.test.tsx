import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import DesignSystemLab from '../DesignSystemLab'

it('renders the code-native design workspace from shared production primitives', () => {
  render(<DesignSystemLab />)

  expect(screen.getByRole('heading', { name: 'Huisurvey UI Lab' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '设计基础' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '共享交互组件' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '报告阅读组件' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '典型报告场景' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '纵向可视化状态' })).toBeInTheDocument()

  expect(screen.getByText('--hui-ds-color-action')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '主要操作' })).toBeInTheDocument()
  expect(screen.getByText('总体自我调节')).toBeInTheDocument()
  expect(screen.getByText('Construct × Channel')).toBeInTheDocument()
  const scaleDimensions = screen.getByLabelText('量表维度示意')
  expect(within(scaleDimensions).getByText('原始范围 0–25')).toBeInTheDocument()
  expect(within(scaleDimensions).getByText('原始范围 0–20')).toBeInTheDocument()
  expect(within(scaleDimensions).queryByRole('progressbar')).not.toBeInTheDocument()
  expect(screen.getByText('允许描述趋势')).toBeInTheDocument()
  expect(screen.getByText('存在不可直接比较区段')).toBeInTheDocument()
  expect(screen.getByText(/图表不包含被抑制的统计值/)).toBeInTheDocument()
})
