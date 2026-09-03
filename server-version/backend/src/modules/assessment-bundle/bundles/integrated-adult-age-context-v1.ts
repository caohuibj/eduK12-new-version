/**
 * Production ContextDefinition for integrated_gonogo_adexi_adult_zh_cn_v1.
 * Exact key@version: integrated-adult-age-v1@1.0.0
 */
import { validateBundleContextDefinition, type BundleContextDefinitionV1 } from '../context'

export const INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1: BundleContextDefinitionV1 = (
  validateBundleContextDefinition({
    schemaVersion: 1,
    contextDefinitionKey: 'integrated-adult-age-v1',
    contextDefinitionVersion: '1.0.0',
    fields: [
      { contextKey: 'subject_age_years', required: true, valueType: 'number' },
    ],
  })
)
