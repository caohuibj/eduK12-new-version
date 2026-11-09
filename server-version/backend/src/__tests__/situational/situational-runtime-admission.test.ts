import { describe, expect, it, vi } from 'vitest'
import { prisma } from '../../config/database'
import { startSituationalAttempt } from '../../modules/situational/situational-runtime.service'
import {
  getSituationalInstrument,
  listSituationalInstruments,
} from '../../modules/situational/situational-runtime.service'
import {
  selectPublishedSituationPackage,
  type SituationPackageV1,
} from '../../modules/situational/situation-package.registry'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'

const packageWithStatus = (
  releaseStatus: SituationPackageV1['releaseStatus'],
  instrumentVersion = SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.instrumentVersion,
): SituationPackageV1 => ({
  ...SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE,
  releaseStatus,
  instrumentVersion,
})

describe('Situational participant runtime admission', () => {
  it.each(['active','latest'])('standalone %s lookup cannot select a composite or Survey child', async phase => {
    const originalEncryption = process.env.DATA_ENCRYPTION_KEY
    const originalPseudonym = process.env.DATA_PSEUDONYM_KEY
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
    const stop = new Error('query-boundary-observed')
    const query = vi.spyOn(prisma.situationalAttempt, 'findFirst').mockRejectedValue(stop)
    if (phase === 'latest') query.mockResolvedValueOnce(null)
    try {
      await expect(startSituationalAttempt('separate-delivery-user', {
        instrumentKey: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.key,
        instrumentVersion: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.instrumentVersion,
      })).rejects.toBe(stop)
      for (const [args] of query.mock.calls) expect(args).toMatchObject({where:{compositeAttemptId:null,surveyAttemptId:null}})
      expect(query).toHaveBeenCalledTimes(phase === 'latest' ? 2 : 1)
    } finally {
      query.mockRestore()
      if (originalEncryption === undefined) delete process.env.DATA_ENCRYPTION_KEY
      else process.env.DATA_ENCRYPTION_KEY = originalEncryption
      if (originalPseudonym === undefined) delete process.env.DATA_PSEUDONYM_KEY
      else process.env.DATA_PSEUDONYM_KEY = originalPseudonym
    }
  })
  it('exposes all executable-complete production packages regardless of PILOT maturity', () => {
    const instruments = listSituationalInstruments()
    expect(instruments.map((entry) => entry.key)).toEqual([
      'sjt-assertiveness-golden',
      'sjt-responsibility-golden',
      'sjt-anxiety-golden',
    ])
    expect(instruments.every((entry) => entry.scienceMaturity === 'PILOT')).toBe(true)
    expect(getSituationalInstrument('sjt-responsibility-golden').key).toBe('sjt-responsibility-golden')
  })

  it('rejects unknown, DRAFT or RETIRED products at admission without using a real product as a fixture', () => {
    expect(() => getSituationalInstrument('sjt-not-registered')).toThrow('题包不存在或已停用')

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
