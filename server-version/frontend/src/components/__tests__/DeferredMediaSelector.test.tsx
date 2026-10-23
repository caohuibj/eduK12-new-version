import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'

const loaded = vi.hoisted(() => vi.fn())
vi.mock('../MediaSelector', () => {
  loaded()
  return { default: function Picker({ isOpen }: { isOpen: boolean }) {
    const [search, setSearch] = useState('')
    return isOpen ? <label>素材搜索<input value={search} onChange={event => setSearch(event.target.value)} /></label> : null
  } }
})
import DeferredMediaSelector from '../DeferredMediaSelector'

it('loads at the first opening and retains picker state on subsequent openings', async () => {
  const props = { isOpen: false, onClose: vi.fn(), onSelect: vi.fn(), type: 'image' as const }
  const view = render(<DeferredMediaSelector {...props} />)
  expect(loaded).not.toHaveBeenCalled()
  view.rerender(<DeferredMediaSelector {...props} isOpen />)
  fireEvent.change(await screen.findByRole('textbox', { name: '素材搜索' }), { target: { value: '合成素材' } })
  view.rerender(<DeferredMediaSelector {...props} />)
  expect(screen.queryByRole('textbox')).toBeNull()
  view.rerender(<DeferredMediaSelector {...props} isOpen />)
  expect(screen.getByRole('textbox', { name: '素材搜索' })).toHaveValue('合成素材')
  expect(loaded).toHaveBeenCalledTimes(1)
})
