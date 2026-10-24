import { describe,expect,it } from 'vitest'
import { isResearchFreeTextType } from '../../modules/survey/analytics.response-privacy'
describe('Survey raw answer privacy projection',()=>{
  it('keeps every free-text category excluded by default',()=>{
    for(const type of ['SHORT_TEXT','LONG_TEXT','OTHER_TEXT','SJT_NATIVE_FREE_TEXT','SJT_NATIVE_RAW_JSON'])
      expect(isResearchFreeTextType(type)).toBe(true)
    for(const type of ['SINGLE','MULTIPLE','MATRIX','MATRIX_MULTIPLE',
      'NUMBER','SLIDER','RANK_ORDER','CONSTANT_SUM','DATE','TIME'])
      expect(isResearchFreeTextType(type)).toBe(false)
  })
})
