import { describe, expect, it } from 'vitest'
import {
  getSituationalInstrument,
  listSituationalInstruments,
  startSituationalAttempt,
} from '../../modules/situational/situational-runtime.service'
import {
  selectPublishedSituationPackage,
  type SituationPackageV1,
} from '../../modules/situational/situation-package.registry'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import { SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-responsibility-golden-zh-cn-v1'

const packageWithStatus = (
  releaseStatus: SituationPackageV1['releaseStatus'],
  instrumentVersion = SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.instrumentVersion,
): SituationPackageV1 => ({
  ...SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE,
  releaseStatus,
  instrumentVersion,
})

describe('Situational participant runtime admission', () => {
  it('does not expose the current DRAFT development fixtures', () => {
    expect(listSituationalInstruments().map((entry) => entry.key)).toEqual(['sjt-assertiveness-golden'])
    expect(listSituationalInstruments()[0]?.scienceMaturity).toBe('PILOT')
    expect(() => getSituationalInstrument('sjt-responsibility-golden'))
      .toThrow('题包不存在或已停用')
  })

  it('rejects a DRAFT or RETIRED package before touching persistence', async () => {
    await expect(startSituationalAttempt('situational-admission-user', {
      instrumentKey: SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_PACKAGE.key,
      instrumentVersion: SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_PACKAGE.instrumentVersion,
    })).rejects.toMatchObject({ code: 'INSTRUMENT_NOT_AVAILABLE', statusCode: 404 })

    expect(selectPublishedSituationPackage([
      packageWithStatus('DRAFT'),
      packageWithStatus('RETIRED', '2.0.0'),
    ], SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.key, '2.0.0')).toBeUndefined()
  })

  it('selects only PUBLISHED packages and orders numeric versions correctly', () => {
    const selected = selectPublishedSituationPackage([
      packageWithStatus('PUBLISHED', '1.0.2'),
      packageWithStatus('PUBLISHED', '1.0.10'),
      packageWithStatus('DRAFT', '1.0.11'),
    ], SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.key)
    expect(selected?.instrumentVersion).toBe('1.0.10')

    expect(selectPublishedSituationPackage([
      packageWithStatus('PUBLISHED', '1.0.2'),
    ], SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.key, '1.0.3')).toBeUndefined()
  })
})

