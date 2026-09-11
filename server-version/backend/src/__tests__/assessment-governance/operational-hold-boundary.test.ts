import { afterEach, describe, expect, it } from 'vitest'
import {
  ASSESSMENT_OPERATIONAL_HOLDS,
  AssessmentOperationalHoldError,
  operationalIdentityKey,
} from '../../modules/assessment-governance/operational-hold'
import {
  createFrozenScaleRuntimeSnapshot,
  freezeScaleRuntimeAtAttemptStart,
  parseFrozenScaleRuntimeSnapshot,
} from '../../modules/assessment-runtime/runtime-snapshot'
import { WHO5_ZH_CN_V1_PACKAGE } from '../../modules/scale/scale-package.registry'
import {
  selectPublishedSituationPackage,
  type SituationPackageV1,
} from '../../modules/situational/situation-package.registry'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'

afterEach(() => {
  ASSESSMENT_OPERATIONAL_HOLDS.clear()
})

const hold = (input: {
  family: 'SCALE' | 'COGNITIVE' | 'SITUATIONAL'
  key: string
  version: string
  scoringVersion?: string
}) => {
  const record = {
    ...input,
    reasonCode: 'MANUAL_TEST_HOLD',
    effectiveAt: '2026-09-11T00:00:00.000Z',
  }
  ASSESSMENT_OPERATIONAL_HOLDS.set(operationalIdentityKey(record), record)
}

describe('operational hold boundary', () => {
  it('blocks a new Scale freeze before touching the reference database', async () => {
    hold({ family: 'SCALE', key: WHO5_ZH_CN_V1_PACKAGE.key, version: WHO5_ZH_CN_V1_PACKAGE.instrumentVersion })
    let dbTouched = false
    const db = new Proxy({}, {
      get() {
        dbTouched = true
        throw new Error('database must not be touched for a paused start')
      },
    })

    await expect(freezeScaleRuntimeAtAttemptStart(db as never, {
      instrumentKey: WHO5_ZH_CN_V1_PACKAGE.key,
      instrumentVersion: WHO5_ZH_CN_V1_PACKAGE.instrumentVersion,
      definition: WHO5_ZH_CN_V1_PACKAGE.definition,
    })).rejects.toBeInstanceOf(AssessmentOperationalHoldError)
    expect(dbTouched).toBe(false)
  })

  it('does not invalidate an already-frozen Scale runtime snapshot', () => {
    const snapshot = createFrozenScaleRuntimeSnapshot({
      instrumentKey: WHO5_ZH_CN_V1_PACKAGE.key,
      instrumentVersion: WHO5_ZH_CN_V1_PACKAGE.instrumentVersion,
      definition: WHO5_ZH_CN_V1_PACKAGE.definition,
    })
    hold({ family: 'SCALE', key: WHO5_ZH_CN_V1_PACKAGE.key, version: WHO5_ZH_CN_V1_PACKAGE.instrumentVersion })
    expect(parseFrozenScaleRuntimeSnapshot(snapshot)).toEqual(snapshot)
  })

  it('does not fall back to an older Situational version when the selected latest version is paused', () => {
    const older: SituationPackageV1 = {
      ...SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE,
      instrumentVersion: '1.0.0',
      releaseStatus: 'PUBLISHED',
    }
    const latest: SituationPackageV1 = {
      ...SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE,
      instrumentVersion: '1.0.1',
      releaseStatus: 'PUBLISHED',
    }
    hold({ family: 'SITUATIONAL', key: latest.key, version: latest.instrumentVersion })

    expect(selectPublishedSituationPackage([older, latest], latest.key)).toBeUndefined()
    expect(selectPublishedSituationPackage([older, latest], older.key, older.instrumentVersion)).toBe(older)
  })

  it('keeps Cognitive operational holds scoring-version exact', () => {
    hold({ family: 'COGNITIVE', key: 'reaction', version: '1.0.0', scoringVersion: '1.1.0' })
    const heldKey = operationalIdentityKey({ family: 'COGNITIVE', key: 'reaction', version: '1.0.0', scoringVersion: '1.1.0' })
    const siblingKey = operationalIdentityKey({ family: 'COGNITIVE', key: 'reaction', version: '1.0.0', scoringVersion: '1.0.0' })
    expect(ASSESSMENT_OPERATIONAL_HOLDS.has(heldKey)).toBe(true)
    expect(ASSESSMENT_OPERATIONAL_HOLDS.has(siblingKey)).toBe(false)
  })
})
