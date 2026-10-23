import { surveyDaylight } from './survey-appearance-clock'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SurveyAppearance, SurveyAppearanceControl } from './SurveyAppearance'

const root = () => document.querySelector('[data-survey-theme]')!
function setup() { return render(<SurveyAppearance><SurveyAppearanceControl/><input aria-label="研究名称"/></SurveyAppearance>) }
function choose(label: string) {
  const modes: Record<string,string> = { '自动':'auto', '浅色':'light', '深色':'dark' }
  for (let clicks = 0; clicks < 3 && root().getAttribute('data-survey-appearance') !== modes[label]; clicks++) {
    fireEvent.click(screen.getByRole('button', { name: /^外观：/ }))
  }
  expect(root()).toHaveAttribute('data-survey-appearance', modes[label])
}
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 23, 12)) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
describe('Survey personal day/night appearance', () => {
  it.each([[6,59,'dark'],[7,0,'light'],[18,59,'light'],[19,0,'dark'],[0,0,'dark']] as const)('uses local clock at %s:%s', (hour, minute, theme) => {
    expect(surveyDaylight(new Date(2026, 9, 23, hour, minute))).toBe(theme)
  })
  it('defaults to automatic daylight without touching document or OS appearance', () => {
    setup()
    expect(root()).toHaveAttribute('data-survey-appearance', 'auto')
    expect(root()).toHaveAttribute('data-survey-theme', 'light')
    expect(document.documentElement).not.toHaveAttribute('data-survey-theme')
    expect(document.body).not.toHaveAttribute('data-survey-theme')
  })
  it('switches at night while open and returns to daylight the next morning', () => {
    vi.setSystemTime(new Date(2026, 9, 23, 18, 59, 59)); setup()
    act(() => vi.advanceTimersByTime(1000))
    expect(root()).toHaveAttribute('data-survey-theme', 'dark')
    vi.setSystemTime(new Date(2026, 9, 24, 7)); act(() => { window.dispatchEvent(new Event('focus')) })
    expect(root()).toHaveAttribute('data-survey-theme', 'light')
  })
  it('remembers manual choice through remount and ignores automatic boundaries until auto is selected', () => {
    const view = setup(); choose('深色'); expect(localStorage.getItem('survey.appearance')).toBe('dark')
    view.unmount(); setup(); expect(root()).toHaveAttribute('data-survey-theme', 'dark')
    act(() => vi.advanceTimersByTime(1000)); expect(root()).toHaveAttribute('data-survey-theme', 'dark')
    choose('浅色'); expect(root()).toHaveAttribute('data-survey-theme', 'light')
    vi.setSystemTime(new Date(2026, 9, 23, 20)); choose('自动')
    expect(root()).toHaveAttribute('data-survey-theme', 'dark')
  })
  it('refreshes a sleeping tab when it becomes visible', () => {
    setup(); vi.setSystemTime(new Date(2026, 9, 23, 20))
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(root()).toHaveAttribute('data-survey-theme', 'dark')
  })
  it('synchronizes manual preferences and cleared storage across tabs', () => {
    setup(); localStorage.setItem('survey.appearance','dark')
    act(() => { window.dispatchEvent(new StorageEvent('storage',{key:'survey.appearance'})) })
    expect(root()).toHaveAttribute('data-survey-theme','dark')
    localStorage.clear(); act(() => { window.dispatchEvent(new StorageEvent('storage',{key:null})) })
    expect(root()).toHaveAttribute('data-survey-appearance','auto')
    expect(root()).toHaveAttribute('data-survey-theme','light')
  })
  it('handles unavailable storage and invalid saved preferences', () => {
    localStorage.setItem('survey.appearance','invalid'); setup()
    expect(root()).toHaveAttribute('data-survey-appearance','auto'); cleanup()
    vi.spyOn(Storage.prototype,'getItem').mockImplementation(() => { throw new Error('unavailable') })
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw new Error('unavailable') })
    setup(); choose('深色'); expect(root()).toHaveAttribute('data-survey-theme','dark')
  })
  it('cycles auto, light, dark and back with one click each and exposes the next action without a menu', () => {
    setup()
    const button = screen.getByRole('button', { name:'外观：自动，点击切换为浅色' })
    expect(button).toHaveAttribute('title', expect.stringContaining('7:00–19:00'))
    button.focus()
    fireEvent.click(button)
    expect(root()).toHaveAttribute('data-survey-appearance','light')
    expect(button).toHaveAccessibleName('外观：浅色，点击切换为深色')
    fireEvent.click(button)
    expect(root()).toHaveAttribute('data-survey-theme','dark')
    expect(button).toHaveAccessibleName('外观：深色，点击切换为自动')
    fireEvent.click(button)
    expect(root()).toHaveAttribute('data-survey-appearance','auto')
    expect(root()).toHaveAttribute('data-survey-theme','light')
    expect(localStorage.getItem('survey.appearance')).toBe('auto')
    expect(button).toHaveFocus()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
  it('removes clock polling when the Survey surface unmounts', () => {
    const view = setup(); expect(vi.getTimerCount()).toBe(1); view.unmount(); expect(vi.getTimerCount()).toBe(0)
  })
})
