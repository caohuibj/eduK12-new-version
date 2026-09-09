import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AssessmentImageGate from '../AssessmentImageGate'
import { assessmentImageItems, assessmentOptionImageItems } from '../adapter'

const image = (assetId: string, order = 0) => ({
  asset: { assetId, contentHash: 'a'.repeat(64), mimeType: 'image/png' },
  altText: `alt ${assetId}`,
  caption: `caption ${assetId}`,
  order,
})

beforeEach(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:media'),
    revokeObjectURL: vi.fn(),
  })
})

describe('MEDIA-2 frontend image adapters', () => {
  it('sorts Scale image presentation by frozen order and rejects invalid entries', () => {
    expect(assessmentImageItems([image('second', 2), image('first', 0)]).map((item) => item.asset.assetId)).toEqual(['first', 'second'])
    expect(assessmentImageItems([{ ...image('bad'), asset: { ...image('bad').asset, mimeType: 'image/gif' } }])).toEqual([])
  })

  it('projects Form option images without changing option value/label data', () => {
    const options = [
      { value: 'a', label: 'A', images: [image('a-2', 1), image('a-1', 0)] },
      { value: 'b', label: 'B', images: [image('b-1', 0)] },
    ]
    expect(assessmentOptionImageItems(options).map((item) => item.asset.assetId)).toEqual(['a-1', 'a-2', 'b-1'])
    expect(options.map(({ value, label }) => ({ value, label }))).toEqual([{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }])
  })

  it('blocks response controls while media is loading and releases them only after ready', async () => {
    let resolve!: (blob: Blob) => void
    const loadAsset = vi.fn(() => new Promise<Blob>((done) => { resolve = done }))
    render(
      <AssessmentImageGate items={assessmentImageItems([image('asset-1')])} loadAsset={loadAsset}>
        <button type="button">Answer</button>
      </AssessmentImageGate>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('加载视觉内容')
    expect(screen.getByRole('button', { name: 'Answer' })).toBeDisabled()
    resolve(new Blob(['x'], { type: 'image/png' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Answer' })).toBeEnabled())
    expect(screen.getByRole('img', { name: 'alt asset-1' })).toHaveAttribute('data-asset-id', 'asset-1')
  })

  it('keeps response controls blocked on error while leaving retry actionable', async () => {
    const loadAsset = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(new Blob(['x'], { type: 'image/png' }))
    render(
      <AssessmentImageGate items={assessmentImageItems([image('asset-1')])} loadAsset={loadAsset}>
        <button type="button">Answer</button>
      </AssessmentImageGate>,
    )
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('视觉内容加载失败'))
    expect(screen.getByRole('button', { name: 'Answer' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Answer' })).toBeEnabled())
    expect(loadAsset).toHaveBeenCalledTimes(2)
  })
})
