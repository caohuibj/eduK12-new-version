import { describe, expect, it } from 'vitest'
import { governedFormRawAnswersAllowed, renderGovernedFormCompletion } from '../../modules/form/disclosure'
import { formTemplateContentSchema, formTemplateReportSchema, prepareFormRelease } from '../../modules/form/release'
import { previewFormTemplateImport } from '../../modules/form/import'

const sha = 'f'.repeat(64)

describe('versioned native Form release disclosure', () => {
  it('makes completion narrative independently visible without revealing any raw answer', () => {
    const content = formTemplateContentSchema.parse({
      schemaVersion: 1, toolKey: 'fixture', version: '1', title: 'Synthetic Form',
      statement: 'Synthetic test only', reference: {},
      definition: { schemaVersion: 2, pages: [{ pageKey: 'p', title: 'Form', questions: [
        { itemKey: 'q', type: 'SHORT_TEXT', prompt: 'Respond', options: [], rows: [], required: true, maxLength: 20 },
      ] }] },
      dataCeiling: { schemaVersion: 1, policyVersion: '1', unknownAudience: 'DENY', audiences: {} },
    })
    const report = formTemplateReportSchema.parse({
      schemaVersion: 1, toolKey: 'fixture', version: '2', contentVersion: '1', contentHash: sha,
      reportVisibility: { schemaVersion: 1, policyVersion: '2', unknownAudience: 'DENY', audiences: {
        respondent: { numericScores: false, references: false, scoreDerivedLabels: false,
          individualInterpretations: false, educationalContent: true, artwork: false },
      } },
      template: { title: 'Submitted', blocks: [{ type: 'TEXT', text: 'Thank you' }] },
    })
    const formRelease = prepareFormRelease(content, report, sha, sha).provenance
    expect(governedFormRawAnswersAllowed({ formRelease }, 'respondent')).toBe(false)
    expect(governedFormRawAnswersAllowed({ formRelease }, 'researcher')).toBe(false)
    expect(governedFormRawAnswersAllowed({}, 'researcher')).toBe(true)
    expect(renderGovernedFormCompletion(report.template, { formRelease }, 'respondent')).toMatchObject({
      title: 'Submitted', blocks: [{ type: 'TEXT', text: 'Thank you' }],
    })
    expect(renderGovernedFormCompletion(report.template, { formRelease }, 'subject')).toBeNull()
    expect(renderGovernedFormCompletion(report.template, { formRelease }, 'unknown')).toBeNull()
  })

  it('routes CSV into the native Form schema and rejects unknown question types', async () => {
    const importRows = (content: string) => previewFormTemplateImport({
      format: 'CSV', content, batchId: '00000000-0000-4000-8000-000000000001',
    })
    expect(await importRows('type,prompt,options\nsingle,Choice,Yes||No')).toMatchObject({
      issues: [], definition: { schemaVersion: 2, pages: [{ questions: [{ type: 'SINGLE', prompt: 'Choice' }] }] },
    })
    expect(await importRows('type,prompt\nunknown,Choice')).toMatchObject({
      definition: null, issues: [{ line: 2, message: '未知题型' }, { line: 1, message: '未识别有效数据行' }],
    })
  })
})
