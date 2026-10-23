import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SchoolHeroMark, SchoolMark } from './SchoolMark'
import emblem from './huischool-a1-emblem.svg?raw'
import wordmark from './huischool-wordmark.svg?raw'
import wordmarkUrl from './huischool-wordmark.svg'

describe('School approved A1 vector identity',()=>{
 it('renders the original emblem and a two-line themeable vector wordmark',()=>{
  const {container}=render(<SchoolMark/> )
  const mark=screen.getByRole('img',{name:'School @eduk12.top'})
  expect(mark).toHaveAttribute('viewBox','0 0 400 150')
  expect(mark.querySelector('use')).toHaveAttribute('href',`${wordmarkUrl}#school-wordmark`)
  expect(container.querySelector('.hs-brand-icon')).toHaveAttribute('src',expect.stringContaining('huischool-a1-emblem.svg'))
  expect(container.querySelector('.hs-brand')).toHaveAttribute('aria-label','School @eduk12.top')
  expect(screen.queryByText(/林间见心|Huischool/)).not.toBeInTheDocument()
  for(const source of [emblem,wordmark]){
   expect(source).toContain('<path')
   expect(source).toContain('viewBox=')
   expect(source).not.toMatch(/<image|data:image|<rect|<text|<foreignObject/)
  }
  expect(wordmark).toContain('id="school-wordmark"')
  expect(wordmark).toContain('fill="currentColor"')
  expect(wordmark).toContain('School @eduk12.top')
  expect(mark.getAttribute('style')).toContain('--hs-brand-ink')
 })
 it('reuses the same emblem wherever the hero emblem is displayed',()=>{
  const {container}=render(<><SchoolMark/><SchoolHeroMark/></>)
  expect(container.querySelector('.hs-hero-brand-icon')?.getAttribute('src')).toEqual(container.querySelector('.hs-brand-icon')?.getAttribute('src'))
 })
})
