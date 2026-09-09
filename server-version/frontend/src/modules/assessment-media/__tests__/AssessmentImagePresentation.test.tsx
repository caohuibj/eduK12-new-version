import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AssessmentImagePresentation from '../AssessmentImagePresentation'
import type { AssessmentImagePresentationItem } from '../types'

const items: AssessmentImagePresentationItem[] = [
  {
    asset: { assetId: 'panel-1', contentHash: 'a'.repeat(64), mimeType: 'image/png' },
    altText: '第一格',
    caption: 'Panel 1',
  },
  {
    asset: { assetId: 'panel-2', contentHash: 'b'.repeat(64), mimeType: 'image/webp' },
    altText: '第二格',
    caption: 'Panel 2',
  },
]

describe('AssessmentImagePresentation', () => {
  it('renders ordered images with frozen alt text, caption, and asset identity', () => {
    render(<AssessmentImagePresentation
      items={items}
      ordered
      ariaLabel="漫画分镜"
      state={{
        status: 'ready',
        urls: { 'panel-1': 'blob:one', 'panel-2': 'blob:two' },
        error: null,
        retry: vi.fn(),
      }}
    />)

    const images = screen.getAllByRole('img')
    expect(images.map((image) => image.getAttribute('alt'))).toEqual(['第一格', '第二格'])
    expect(images.map((image) => image.getAttribute('data-asset-id'))).toEqual(['panel-1', 'panel-2'])
    expect(screen.getByText('Panel 1')).toBeInTheDocument()
    expect(screen.getByText('Panel 2')).toBeInTheDocument()
  })

  it('renders loading and explicit retry error states', () => {
    const retry = vi.fn()
    const { rerender } = render(<AssessmentImagePresentation
      items={[items[0]!]}
      state={{ status: 'loading', urls: {}, error: null, retry }}
    />)
    expect(screen.getByRole('status')).toHaveTextContent('加载视觉内容')

    rerender(<AssessmentImagePresentation
      items={[items[0]!]}
      state={{ status: 'error', urls: {}, error: 'network', retry }}
    />)
    expect(screen.getByRole('alert')).toHaveTextContent('视觉内容加载失败')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
