import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SchoolHeroMark, SchoolMark } from './SchoolMark'
import emblem from './huischool-a1-emblem.svg?raw'
import wordmark from './huischool-wordmark.svg?raw'
import wordmarkUrl from './huischool-wordmark.svg'

describe('Huischool approved A1 vector identity',()=>{
 it('renders both original artwork and wordmark as transparent path-based vectors',()=>{
  const {container}=render(<SchoolMark/> )
  expect(screen.getByRole('img',{name:'Huischool'})).toHaveAttribute('src',wordmarkUrl)
  expect(container.querySelector('.hs-brand-icon')).toHaveAttribute('src',expect.stringContaining('huischool-a1-emblem.svg'))
  expect(container.querySelector('.hs-brand')).toHaveAttribute('aria-label','Huischool')
  expect(screen.queryByText(/林间见心/)).not.toBeInTheDocument()
  for(const source of [emblem,wordmark]){
   expect(source).toContain('<path')
   expect(source).toContain('viewBox=')
   expect(source).not.toMatch(/<image|data:image|<rect|<text|<foreignObject/)
  }
 })
 it('reuses the same emblem wherever the hero emblem is displayed',()=>{
  const {container}=render(<><SchoolMark/><SchoolHeroMark/></>)
  expect(container.querySelector('.hs-hero-brand-icon')?.getAttribute('src')).toEqual(container.querySelector('.hs-brand-icon')?.getAttribute('src'))
 })
})
