import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import TeacherBrand from './TeacherBrand'
import wordmark from './teacher-home-wordmark.svg?raw'
import wordmarkUrl from './teacher-home-wordmark.svg'

describe('Teacher vector identity',()=>{
 it('preserves B3 and exposes one accessible two-line wordmark',()=>{
  const {container}=render(<TeacherBrand/> )
  const mark=screen.getByRole('img',{name:'Teacher @eduk12.top'})
  expect(screen.getAllByRole('img')).toHaveLength(1)
  expect(mark).toHaveAttribute('viewBox','0 0 400 150')
  expect(mark.querySelector('use')).toHaveAttribute('href',`${wordmarkUrl}#teacher-wordmark`)
  expect(container.querySelector('.ht-brand-b3')).toHaveAttribute('src','/huiteacher/huiteacher-b3-emblem.svg')
  expect(container.querySelector('.ht-brand-b3')).toHaveAttribute('aria-hidden','true')
  expect(container.querySelector('.ht-brand')).toHaveAttribute('aria-label','Teacher @eduk12.top')
  expect(mark.getAttribute('style')).toContain('--ht-brand-ink')
 })
 it('contains real outlined letters, a scalable viewBox and themeable fill',()=>{
  expect(wordmark).toContain('<path')
  expect(wordmark).toContain('viewBox="0 0 400 150"')
  expect(wordmark).toContain('id="teacher-wordmark"')
  expect(wordmark).toContain('Teacher @eduk12.top')
  expect(wordmark).toContain('fill="currentColor"')
  expect(wordmark).not.toMatch(/<image|data:image|<text|<foreignObject|@font-face/)
 })
})
