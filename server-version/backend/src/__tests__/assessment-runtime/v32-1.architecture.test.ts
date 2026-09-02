import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (relativePath: string): string => readFileSync(
  resolve(__dirname, '../../', relativePath),
  'utf8',
)

describe('Unified runtime architecture boundaries', () => {
  it('keeps the authoritative scorer pure and free of publication/database gates', () => {
    const scorer = source('modules/cognitive/v2/authoritative-scorer.ts')

    expect(scorer).not.toMatch(/assertTaskContractValid|publication gate|publicationGate/i)
    expect(scorer).not.toMatch(/\bprisma\b|encryptField|decryptField|isEncrypted/)
  })

  it('keeps unified unit submitters free of legacy parent coordination', () => {
    const cognitive = source('modules/cognitive/unified-final-submit.service.ts')
    const scale = source('modules/scale/unified-final-submit.service.ts')
    const scaleFinal = source('modules/scale/scale-final-submit.service.ts')
    const form = source('modules/assessment-runtime/unified-form-section-final-submit.service.ts')

    for (const submitter of [cognitive, scale, form]) {
      expect(submitter).not.toMatch(/refreshCompositeFinalOnlyProgress/)
      expect(submitter).not.toMatch(/SELECT[\s\S]*FOR UPDATE/i)
    }
    expect(cognitive.match(/cognitiveRawSubmission\.create/g) ?? []).toHaveLength(1)
    expect(cognitive).not.toMatch(/CognitiveTrial|cognitiveTrial/)
    expect(scale).not.toMatch(/getFrozenActiveSlot/)
    expect(scale).not.toMatch(/readQuestionnaireAssessmentContext/)
    expect(scale).not.toMatch(/readCompositeAttemptContext/)
    expect(scale).not.toMatch(/frozenActiveSlotSetEncrypted/)
    expect(scale).not.toMatch(/include:\s*\{\s*scale/)
    expect(scale).toMatch(/activateScaleAdmission/)
    expect(scaleFinal).toMatch(/UNIFIED_SCALE_CHILD_ADMISSION_SELECT/)
  })

  it('keeps the unified raw submission boundary strict and encrypted', () => {
    const raw = source('modules/cognitive/unified-raw-submission.ts')
    const security = source('modules/assessment-runtime/security.ts')

    expect(raw).toContain('trialEnvelopeSchema')
    expect(raw).toContain('.strict()')
    expect(security).toContain('isEncrypted')
    expect(security).not.toContain('safeDecrypt')
  })
})
