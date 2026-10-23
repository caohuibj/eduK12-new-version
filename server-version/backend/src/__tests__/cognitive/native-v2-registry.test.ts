import { describe, expect, it } from 'vitest'
import { getCognitiveV2TaskDefinition, validateNativeCognitiveDefinitions } from '../../modules/cognitive/v2/registry'

describe('native v2 identity admission', () => {
  const definition = getCognitiveV2TaskDefinition('gonogo', '1.0.0', '1.0.0')!
  it('rejects native/legacy and native/native identity collisions', () => {
    expect(() => validateNativeCognitiveDefinitions([definition])).toThrow('duplicate key')
    const native = { ...definition, testType: 'test-native-only' }
    expect(() => validateNativeCognitiveDefinitions([native, native], [])).toThrow('duplicate key')
    expect(() => validateNativeCognitiveDefinitions([native], [])).not.toThrow()
  })
  it('does not fallback for unknown engine or scorer versions', () => {
    expect(getCognitiveV2TaskDefinition('gonogo', 'unknown', '1.0.0')).toBeUndefined()
    expect(getCognitiveV2TaskDefinition('gonogo', '1.0.0', 'unknown')).toBeUndefined()
  })
})
