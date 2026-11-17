import { beforeEach, describe, expect, it, vi } from 'vitest'
const findWave = vi.hoisted(() => vi.fn())
vi.mock('../../config/database', () => ({ prisma: { surveyWave: { findFirst: findWave } } }))
import { preparePublicationDigest, resetSurveyPublicationCachesForTests } from '../../modules/survey/admission.service'

const snapshot = { runtimeStatus: 'SURVEY_FINAL_V1', units: [{ kind: 'FORM', instrumentKey: 'form' }] }

beforeEach(() => {
  findWave.mockReset()
  resetSurveyPublicationCachesForTests()
})

describe('immutable survey publication preparation', () => {
  it('reads and hashes one frozen snapshot for repeated prepares, and does not cache a miss', async () => {
    findWave.mockResolvedValueOnce(null)
    expect(await preparePublicationDigest('project', 'wave')).toBeUndefined()
    findWave.mockResolvedValue({ publicationId: 'pub', publication: { id: 'pub', compiledSnapshot: snapshot } })
    const first = await preparePublicationDigest('project', 'wave')
    const second = await preparePublicationDigest('project', 'wave')
    expect(second).toEqual(first)
    expect(findWave).toHaveBeenCalledTimes(2)
  })
})
