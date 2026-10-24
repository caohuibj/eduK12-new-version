import { act, fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TrainingAppearanceSettings, { TrainingAppearanceProvider } from './TrainingAppearance'
import { useTrainingAppearance } from './appearanceContext'
import { appearanceKey, appearanceTheme, nextAppearanceBoundary, parseAppearance } from './appearance'
const env = vi.hoisted(() => ({ training: true, loading: false, user: { id: 'learner1' } as { id: string } | null }))
vi.mock('./context', () => ({ isTrainingHost: () => env.training }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: env.user, isLoading: env.loading }) }))
function View() { const appearance = useTrainingAppearance(); return <div data-testid="theme" data-theme={appearance.theme}><TrainingAppearanceSettings /></div> }
function Example() { return <TrainingAppearanceProvider><View /></TrainingAppearanceProvider> }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026,9,23,8)); env.training = true; env.loading = false; env.user = { id: 'learner1' }; localStorage.clear() })
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


describe('Training first-paint theme handoff',()=>{
 it('keeps the cached theme during identity recovery, then adopts the resolved account preference before paint',()=>{
  env.user=null;env.loading=true
  localStorage.setItem('training:appearance:boot:v1','dark')
  localStorage.setItem(appearanceKey('resolved'),'light')
  localStorage.setItem(appearanceKey(),'light')
  const write=vi.spyOn(Storage.prototype,'setItem')
  const view=render(<Example/>)
  expect(screen.getByTestId('theme')).toHaveAttribute('data-theme','dark')
  expect(document.documentElement).toHaveAttribute('data-training-entry','true')
  expect(document.documentElement).toHaveAttribute('data-training-theme','dark')
  expect(write).not.toHaveBeenCalled()
  env.user={id:'resolved'};env.loading=false;view.rerender(<Example/>)
  expect(screen.getByTestId('theme')).toHaveAttribute('data-theme','light')
  expect(document.documentElement).toHaveAttribute('data-training-theme','light')
  expect(localStorage.getItem('training:appearance:boot:v1')).toBe('light')
  expect(localStorage.getItem(appearanceKey())).toBe('light')
 })
 it('updates the first-paint cache on selection and restores the document theme after a normal remount',()=>{
  const view=render(<Example/>)
  fireEvent.click(screen.getByRole('radio',{name:/暗色 月夜/}))
  expect(localStorage.getItem('training:appearance:boot:v1')).toBe('dark')
  expect(localStorage.getItem(appearanceKey('learner1'))).toBe('dark')
  expect(document.documentElement).toHaveAttribute('data-training-theme','dark')
  view.unmount();expect(document.documentElement).not.toHaveAttribute('data-training-entry')
  render(<Example/>);expect(document.documentElement).toHaveAttribute('data-training-theme','dark')
 })
 it('reacts to the presentation cache while recovering but isolates it once an account is known',()=>{
  env.user=null;env.loading=true
  localStorage.setItem('training:appearance:boot:v1','light')
  localStorage.setItem(appearanceKey('resolved'),'light')
  const view=render(<Example/>)
  localStorage.setItem('training:appearance:boot:v1','dark')
  fireEvent(window,new StorageEvent('storage',{key:'training:appearance:boot:v1'}))
  expect(document.documentElement).toHaveAttribute('data-training-theme','dark')
  env.user={id:'resolved'};env.loading=false;view.rerender(<Example/>)
  localStorage.setItem('training:appearance:boot:v1','dark')
  fireEvent(window,new StorageEvent('storage',{key:'training:appearance:boot:v1'}))
  expect(document.documentElement).toHaveAttribute('data-training-theme','light')
 })
 it('uses the guest preference after recovery resolves without an account',()=>{
  env.user=null;env.loading=true
  localStorage.setItem('training:appearance:boot:v1','dark')
  localStorage.setItem(appearanceKey(),'light')
  const view=render(<Example/>)
  env.loading=false;view.rerender(<Example/>)
  expect(document.documentElement).toHaveAttribute('data-training-theme','light')
  expect(localStorage.getItem('training:appearance:boot:v1')).toBe('light')
 })
 it('suspends Training document colors and storage access for an explicit other-product entry',()=>{
  const read=vi.spyOn(Storage.prototype,'getItem')
  render(<TrainingAppearanceProvider suspended><View/></TrainingAppearanceProvider>)
  expect(document.documentElement).not.toHaveAttribute('data-training-entry')
  expect(read).not.toHaveBeenCalled()
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
 })
})
