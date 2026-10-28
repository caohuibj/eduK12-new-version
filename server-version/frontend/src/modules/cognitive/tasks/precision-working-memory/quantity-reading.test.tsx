import React from 'react'
import {afterEach,describe,expect,it} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import records from '../../../../../../../docs/cognitive-library/onboarding-content-20261028/parallel-review/spatial/representative-records.json'
import {SpatialInstructions} from './SpatialInstructions'
import {SpatialReport} from './SpatialReport'
import {isSpatialReport,type SpatialReport as Report} from './generated/report'

afterEach(cleanup)
describe('spatial circle-position explanation and public quality gate',()=>{
  it.each(['zh','en'] as const)('explains circle degrees and keeps zero, missing and invalid distinct (%s)',language=>{
    const en=language==='en'
    render(<SpatialInstructions language={language} profile="experience"/>)
    expect(screen.getByText(en?/the top and right points are 90° apart/:/正上方与正右方相差90°/)).toBeTruthy()
    cleanup()
    const one=records.oneRecordReport as Report;expect(isSpatialReport(one)).toBe(true)
    const {container}=render(<SpatialReport report={one} language={language}/>)
    expect(screen.getByText(en?/Degrees describe circle positions/:/这里的“度”指圆周位置差/)).toBeTruthy()
    expect(container.querySelectorAll('figure')).toHaveLength(1)
    expect(screen.getByText(en?/No valid .* selections were available/:/有效记录不足/)).toBeTruthy()
    expect(screen.getAllByText('0°').length).toBeGreaterThan(0)
    expect(container.querySelector('figcaption')?.textContent).toContain('0/20')
    if(en)expect(container.querySelector('figcaption')?.textContent).toContain('1 item:')
    cleanup()
    const empty=records.emptyReport as Report;expect(isSpatialReport(empty)).toBe(true)
    const invalid=render(<SpatialReport report={empty} language={language}/>)
    expect(invalid.container.querySelector('figure')).toBeNull()
    expect(screen.queryByText(en?'One thing to try':'一个可尝试的小建议')).toBeNull()
    expect(screen.getByText(en?'This record is not ready to interpret':'本次记录暂时无法解读')).toBeTruthy()
  })
})
