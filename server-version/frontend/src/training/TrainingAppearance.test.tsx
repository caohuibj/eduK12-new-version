import { act, fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TrainingAppearanceSettings, { TrainingAppearanceProvider } from './TrainingAppearance'
import { useTrainingAppearance } from './appearanceContext'
import { appearanceKey, appearanceTheme, nextAppearanceBoundary, parseAppearance } from './appearance'
const env = vi.hoisted(() => ({ training: true, user: { id: 'learner1' } as { id: string } | null }))
vi.mock('./context', () => ({ isTrainingHost: () => env.training }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: env.user }) }))
function View() { const appearance = useTrainingAppearance(); return <div data-testid="theme" data-theme={appearance.theme}><TrainingAppearanceSettings /></div> }
function Example() { return <TrainingAppearanceProvider><View /></TrainingAppearanceProvider> }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026,9,23,8)); env.training = true; env.user = { id: 'learner1' }; localStorage.clear() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
describe('Training appearance', () => {
 it('uses auto by default and preserves each valid stored preference', () => {
  expect(parseAppearance(null)).toBe('auto'); expect(parseAppearance('other')).toBe('auto'); expect(parseAppearance('auto')).toBe('auto')
  expect(parseAppearance('light')).toBe('light'); expect(parseAppearance('dark')).toBe('dark')
  expect(appearanceKey('one/two')).not.toBe(appearanceKey('one%2Ftwo'))
  render(<Example />); expect(screen.getByRole('radio', { name: /^昼夜自动/ })).toBeChecked(); expect(screen.getByTestId('theme')).toHaveAttribute('data-theme', 'light')
 })
 it('defaults to dark at night without a saved preference, including when storage is unavailable', () => {
  vi.setSystemTime(new Date(2026,9,23,20)); vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked')})
  render(<Example />); expect(screen.getByRole('radio', {name:/^昼夜自动/})).toBeChecked(); expect(screen.getByTestId('theme')).toHaveAttribute('data-theme','dark')
 })
 it('preserves an explicit light preference at night after remount', () => {
  vi.setSystemTime(new Date(2026,9,23,20)); localStorage.setItem(appearanceKey('learner1'),'light')
  const view=render(<Example />); expect(screen.getByRole('radio',{name:/^正常色/})).toBeChecked(); expect(screen.getByTestId('theme')).toHaveAttribute('data-theme','light')
  view.unmount(); render(<Example />); expect(screen.getByRole('radio',{name:/^正常色/})).toBeChecked()
 })
 it.each([[6,59,'dark'],[7,0,'light'],[18,59,'light'],[19,0,'dark']] as const)('resolves local clock %i:%i as %s', (hour, minute, theme) => {
  expect(appearanceTheme('auto', new Date(2026,9,22,hour,minute))).toBe(theme)
  expect(appearanceTheme('dark', new Date(2026,9,22,hour,minute))).toBe('dark')
 })
 it('schedules exact local boundaries and the following morning', () => {
  expect(nextAppearanceBoundary(new Date(2026,9,22,6,59,59))).toBe(1000)
  expect(nextAppearanceBoundary(new Date(2026,9,22,18,59,59))).toBe(1000)
  expect(nextAppearanceBoundary(new Date(2026,9,22,23))).toBe(8*60*60*1000)
 })
 it('saves immediately, survives remount, and isolates another account', () => {
  const view = render(<Example />);fireEvent.click(screen.getByRole('radio', { name: /暗色 月夜/ }));expect(localStorage.getItem(appearanceKey('learner1'))).toBe('dark')
  view.unmount();const second = render(<Example />);expect(screen.getByTestId('theme')).toHaveAttribute('data-theme','dark')
  env.user={id:'teacher2'};second.rerender(<Example />);expect(screen.getByTestId('theme')).toHaveAttribute('data-theme','light')
  env.user=null;second.rerender(<Example />);expect(screen.getByTestId('theme')).toHaveAttribute('data-theme','light')
  env.user={id:'learner1'};second.rerender(<Example />);expect(screen.getByTestId('theme')).toHaveAttribute('data-theme','dark')
 })
 it('switches the default at 19:00 while open and rechecks the clock when resumed', () => {
  vi.setSystemTime(new Date(2026,9,22,18,59,59));render(<Example />)
  expect(screen.getByTestId('theme')).toHaveAttribute('data-theme','light');act(()=>{vi.advanceTimersByTime(1000)});expect(screen.getByTestId('theme')).toHaveAttribute('data-theme','dark')
  act(()=>{vi.setSystemTime(new Date(2026,9,23,8));window.dispatchEvent(new Event('focus'))});expect(screen.getByTestId('theme')).toHaveAttribute('data-theme','light')
  fireEvent.click(screen.getByRole('radio',{name:/暗色 月夜/}));act(()=>{vi.advanceTimersByTime(13*60*60*1000)});expect(screen.getByTestId('theme')).toHaveAttribute('data-theme','dark')
 })
 it('applies other-tab changes only to the current account and accepts clear', () => {
  render(<Example />);localStorage.setItem(appearanceKey('learner1'),'dark');fireEvent(window,new StorageEvent('storage',{key:appearanceKey('teacher2')}));expect(screen.getByTestId('theme')).toHaveAttribute('data-theme','light')
  fireEvent(window,new StorageEvent('storage',{key:appearanceKey('learner1')}));expect(screen.getByTestId('theme')).toHaveAttribute('data-theme','dark')
  localStorage.clear();fireEvent(window,new StorageEvent('storage',{key:null}));expect(screen.getByTestId('theme')).toHaveAttribute('data-theme','light')
 })
 it('keeps the chosen theme usable when the browser refuses persistence', () => {
  render(<Example />);vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked')});fireEvent.click(screen.getByRole('radio',{name:/暗色 月夜/}));expect(screen.getByTestId('theme')).toHaveAttribute('data-theme','dark');expect(screen.getByRole('alert')).toHaveTextContent('浏览器未能保存')
 })
 it('does not expose settings or read Training preferences outside the Training host', () => {
  env.training=false;const read=vi.spyOn(Storage.prototype,'getItem');localStorage.setItem(appearanceKey('learner1'),'dark');render(<Example />);expect(screen.queryByRole('radio')).not.toBeInTheDocument();expect(screen.getByTestId('theme')).toHaveAttribute('data-theme','light');expect(read).not.toHaveBeenCalled()
 })
})
