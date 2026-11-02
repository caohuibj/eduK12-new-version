import { describe, expect, expectTypeOf, it } from 'vitest'
import * as core from '../modules/assessment-core/form'
import type { FormDraft as SharedFormDraft, FormQuestion as SharedFormQuestion } from '../modules/assessment-core/form'
import type { FormDraft, FormQuestion, SurveyImage } from './builder.types'
import { FormChoiceExtras, hasSelectedOther, toggleFormMultiple } from './FormChoiceExtras'
import type { FormChoiceExtrasQuestion } from './FormChoiceExtras'
import { ProfessionalFormAnswer } from './ProfessionalFormAnswer'
import type { ProfessionalAnswer, ProfessionalQuestion } from './ProfessionalFormAnswer'
import { sanitizeFormAnswers, visibleFormKeys } from './form-visibility'
import type { ConditionalFormItem } from './form-visibility'

// Keep the pre-extraction public shape explicit: the shared image parameter must
// not widen or drop the existing Survey/Teacher draft contract.
type ExistingFormQuestion={
  itemKey:string;type:'SINGLE'|'MULTIPLE'|'SHORT_TEXT'|'LONG_TEXT'|'NUMBER'|'LIKERT'|'MATRIX'|
    'DATE'|'TIME'|'RANK_ORDER'|'SLIDER'|'CONSTANT_SUM'|'MATRIX_MULTIPLE';
  prompt:string;image?:SurveyImage;materials?:import('../modules/assessment-media/material').AssessmentMaterial[];required:boolean;allowRefusal?:boolean;
  options:{optionKey:string;label:string;score?:number}[];rows:{rowKey:string;label:string}[];
  min?:number;max?:number;integerOnly?:boolean;step?:number;precision?:number;
  maxLength?:number;total?:number;minSelections?:number;maxSelections?:number;
  timeZone?:'Asia/Shanghai'|'UTC';textValidation?:'EMAIL'|'DIGITS'|'ALPHANUMERIC';
  otherOptionKey?:string;otherMaxLength?:number;exclusiveOptionKeys?:string[];
  displayIf?:{itemKey:string;operator:'EQUALS'|'INCLUDES';optionKey:string}
}
type ExistingFormDraft={schemaVersion:1|2;pages:{
  pageKey:string;title:string;description?:string;questions:ExistingFormQuestion[]
}[]}
type ExistingAnswer=string|number|string[]|Record<string,number>|{_surveyRefusal:true}|null

describe('shared Form compatibility entries',()=>{
  it('keeps Survey and Teacher visibility imports on the same implementation',()=>{
    expect(visibleFormKeys).toBe(core.visibleFormKeys)
    expect(sanitizeFormAnswers).toBe(core.sanitizeFormAnswers)
  })

  it('re-exports the same renderers and choice helpers without wrappers',()=>{
    expect(ProfessionalFormAnswer).toBe(core.ProfessionalFormAnswer)
    expect(FormChoiceExtras).toBe(core.FormChoiceExtras)
    expect(hasSelectedOther).toBe(core.hasSelectedOther)
    expect(toggleFormMultiple).toBe(core.toggleFormMultiple)
  })

  it('preserves the existing draft, answer and renderer type contracts',()=>{
    expectTypeOf<FormQuestion>().toEqualTypeOf<ExistingFormQuestion>()
    expectTypeOf<Omit<FormDraft,'materials'|'descriptive'>>().toEqualTypeOf<ExistingFormDraft>()
    expectTypeOf<FormDraft['descriptive']>().toEqualTypeOf<import('../modules/assessment-core/form/types').FormDescriptive|undefined>()
    expectTypeOf<FormQuestion>().toEqualTypeOf<SharedFormQuestion<SurveyImage>>()
    expectTypeOf<Omit<FormDraft,'materials'>>().toEqualTypeOf<SharedFormDraft<SurveyImage>>()
    expectTypeOf<FormDraft['materials']>().toEqualTypeOf<import('../modules/assessment-media/material').AssessmentMaterial[]|undefined>()
    expectTypeOf<ProfessionalAnswer>().toEqualTypeOf<ExistingAnswer>()
    expectTypeOf<ProfessionalAnswer>().toEqualTypeOf<core.ProfessionalAnswer>()
    expectTypeOf<ProfessionalQuestion>().toEqualTypeOf<core.ProfessionalQuestion>()
    expectTypeOf<FormChoiceExtrasQuestion>().toEqualTypeOf<core.FormChoiceExtrasQuestion>()
    expectTypeOf<ConditionalFormItem>().toEqualTypeOf<core.ConditionalFormItem>()
  })
})
