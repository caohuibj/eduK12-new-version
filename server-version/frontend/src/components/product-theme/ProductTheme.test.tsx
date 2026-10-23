import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ProductThemeControl } from './ProductThemeControl'
import { appearanceKey, appearanceTheme, nextAppearanceBoundary, parseAppearance, useProductTheme, type AppearanceProduct } from './useProductTheme'
import { SchoolLanding } from '../../school/SchoolLanding'
import { HuiteacherLanding } from '../../huiteacher/HuiteacherLanding'

function Example({ product = 'school', account }: { product?: AppearanceProduct; account?: string }) {
  const appearance = useProductTheme(product, account)
  return <div data-testid="appearance" data-theme={appearance.theme}><ProductThemeControl appearance={appearance} product={product === 'school' ? 'School' : 'Teacher'}/></div>
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 22, 8)); localStorage.clear() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
describe('product-local Training-compatible appearance', () => {
  it('defaults to auto and validates persisted choices', () => {
    expect(parseAppearance(null)).toBe('auto'); expect(parseAppearance('bad')).toBe('auto')
    for (const value of ['light','dark','auto'] as const) expect(parseAppearance(value)).toBe(value)
    render(<Example/>); expect(screen.getByRole('combobox', { name: 'School 外观' })).toHaveValue('auto')
    expect(screen.getByTestId('appearance')).toHaveAttribute('data-theme','light')
  })
  it.each([[6,59,'dark'],[7,0,'light'],[18,59,'light'],[19,0,'dark']] as const)('uses local clock %i:%i as %s', (hour, minute, theme) => {
    expect(appearanceTheme('auto', new Date(2026,9,22,hour,minute))).toBe(theme)
  })
  it('uses next local calendar boundary, not a fixed 12 hour delay', () => {
    expect(nextAppearanceBoundary(new Date(2026,9,22,18,59,59))).toBe(1000)
    expect(nextAppearanceBoundary(new Date(2026,9,22,6,59,59))).toBe(1000)
    const now=new Date(2026,9,22,20)
    expect(new Date(now.getTime()+nextAppearanceBoundary(now)).getHours()).toBe(7)
  })
  it('switches at the boundary and on foreground restoration', () => {
    vi.setSystemTime(new Date(2026,9,22,18,59,59)); render(<Example/>)
    act(() => { vi.advanceTimersByTime(1000) }); expect(screen.getByTestId('appearance')).toHaveAttribute('data-theme','dark')
    act(() => { vi.setSystemTime(new Date(2026,9,23,8)); document.dispatchEvent(new Event('visibilitychange')) })
    expect(screen.getByTestId('appearance')).toHaveAttribute('data-theme','light')
    act(() => { vi.setSystemTime(new Date(2026,9,23,20)); window.dispatchEvent(new Event('pageshow')) })
    expect(screen.getByTestId('appearance')).toHaveAttribute('data-theme','dark')
  })
  it('keeps manual choice through clock changes and remount', () => {
    const view=render(<Example account="one"/>); fireEvent.change(screen.getByRole('combobox'),{target:{value:'dark'}})
    act(() => { vi.advanceTimersByTime(24*60*60*1000); window.dispatchEvent(new Event('focus')) })
    expect(screen.getByTestId('appearance')).toHaveAttribute('data-theme','dark')
    view.unmount(); render(<Example account="one"/>); expect(screen.getByRole('combobox')).toHaveValue('dark')
  })
  it('isolates guest, accounts and products without an intermediate previous choice', () => {
    const view=render(<Example account="one"/>); fireEvent.change(screen.getByRole('combobox'),{target:{value:'dark'}})
    view.rerender(<Example account="two"/>); expect(screen.getByTestId('appearance')).toHaveAttribute('data-theme','light')
    view.rerender(<Example/>); expect(screen.getByRole('combobox')).toHaveValue('auto')
    view.rerender(<Example product="teacher" account="one"/>); expect(screen.getByRole('combobox')).toHaveValue('auto')
    view.rerender(<Example account="one"/>); expect(screen.getByRole('combobox')).toHaveValue('dark')
    expect(appearanceKey('school','one/two')).not.toBe(appearanceKey('school','one%2Ftwo'))
  })
  it('defaults to auto at night when storage is unavailable and warns after a failed save', () => {
    vi.setSystemTime(new Date(2026,9,22,20)); vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked')})
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked')})
    render(<Example/>); expect(screen.getByTestId('appearance')).toHaveAttribute('data-theme','dark')
    fireEvent.change(screen.getByRole('combobox'),{target:{value:'light'}})
    expect(screen.getByTestId('appearance')).toHaveAttribute('data-theme','light'); expect(screen.getByRole('alert')).toHaveTextContent('未能保存')
  })
  it('syncs only the current product/account key and returns to auto', () => {
    render(<Example account="one"/>); localStorage.setItem(appearanceKey('teacher','one'),'dark')
    act(()=>window.dispatchEvent(new StorageEvent('storage',{key:appearanceKey('teacher','one')})))
    expect(screen.getByRole('combobox')).toHaveValue('auto')
    localStorage.setItem(appearanceKey('school','one'),'dark')
    act(()=>window.dispatchEvent(new StorageEvent('storage',{key:appearanceKey('school','one')})))
    expect(screen.getByRole('combobox')).toHaveValue('dark')
    fireEvent.change(screen.getByRole('combobox'),{target:{value:'auto'}})
    expect(screen.getByTestId('appearance')).toHaveAttribute('data-theme','light')
  })
  it('renders only the selected hero source and preserves responsive Teacher variants', () => {
    const view=render(<><SchoolLanding theme="dark" onJoin={()=>{}}/><HuiteacherLanding theme="dark" onEnter={()=>{}}/></>)
    const images=screen.getAllByRole('img'); expect(images).toHaveLength(2)
    expect(images[0].getAttribute('src')).toContain('moonlight'); expect(images[1].getAttribute('srcset')).toContain('moonlight-small.webp 768w')
    view.rerender(<><SchoolLanding theme="light" onJoin={()=>{}}/><HuiteacherLanding theme="light" onEnter={()=>{}}/></>)
    for (const image of screen.getAllByRole('img')) expect(image.getAttribute('src')).not.toContain('moonlight')
  })
})
