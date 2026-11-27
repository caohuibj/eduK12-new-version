import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma, Scale } from '@prisma/client'
import { publishScaleCourseLinks } from '../../modules/scale/scale-course-publication'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), enabled: vi.fn(), librarySource: vi.fn(), toolPolicy: vi.fn(), collection: vi.fn(),
}))
vi.mock('../../modules/tool-licensing/runtime', () => ({
  authorizeToolPublication: mocks.authorize, isExpandedToolLicensingEnabled: mocks.enabled,
  ToolLicenseAccessError: class {},
}))
vi.mock('../../modules/scale-library-governance/training-source', () => ({ readLibraryScaleMeasurementSource: mocks.librarySource }))
vi.mock('../../modules/assessment-governance/tool-entry-policy', () => ({ assertToolEntryPolicy: mocks.toolPolicy }))
vi.mock('../../modules/scale/scale-collection-guard', () => ({ assertTrainingScaleCollectionAllowed: mocks.collection }))

const shared = { id: 'library-scale', instrumentClass: 'CUSTOM_DESCRIPTIVE', libraryEntryId: 'entry-1',
  status: 'PUBLISHED', visibility: 'COURSE', standardSourceKind: 'CODE_PACKAGE' } as Scale
const training = { id: 'training-course', creatorId: 'training-teacher', courseType: 'TRAINING_COURSE', isLibrary: false }
const campus = { id: 'campus-course', creatorId: 'campus-admin', courseType: 'CAMPUS_ACTIVITY', isLibrary: false }
const links = vi.fn(), legacy = vi.fn(), query = vi.fn()
const tx = { courseScale: { createMany: legacy, createManyAndReturn: links }, $queryRaw: query } as unknown as Prisma.TransactionClient

beforeEach(() => {
  vi.resetAllMocks()
  mocks.enabled.mockReturnValue(true)
  mocks.librarySource.mockResolvedValue({ release: { key: 'shared-scale' } })
  links.mockResolvedValue([{ id: 'fresh-training-link', courseId: training.id }, { id: 'fresh-campus-link', courseId: campus.id }])
})

describe('Training standalone scale course publication quota', () => {
  it('charges only persisted standalone links for Training course owners', async () => {
    expect(await publishScaleCourseLinks(tx, shared, [training, campus])).toEqual({ count: 2 })
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(tx, {
      product: 'TRAINING', subjectId: training.creatorId, publicationId: 'fresh-training-link', toolKeys: ['SCALE:shared-scale'],
    })
    expect(mocks.librarySource).toHaveBeenCalledWith(tx, shared)
  })

  it('a retried allocation does not look up content or pay a second time', async () => {
    links.mockResolvedValue([])
    expect(await publishScaleCourseLinks(tx, shared, [training])).toEqual({ count: 0 })
    expect(mocks.authorize).not.toHaveBeenCalled()
    expect(mocks.librarySource).not.toHaveBeenCalled()
  })

  it('keeps private author content and feature-off deliveries on their existing path', async () => {
    await publishScaleCourseLinks(tx, { ...shared, libraryEntryId: null }, [training])
    mocks.enabled.mockReturnValue(false)
    await publishScaleCourseLinks(tx, shared, [training])
    expect(legacy).toHaveBeenCalledTimes(2)
    expect(links).not.toHaveBeenCalled()
    expect(mocks.authorize).not.toHaveBeenCalled()
  })

  it('rejects a withdrawn Training standard rather than treating it as ungoverned', async () => {
    query.mockResolvedValue([{ id: 'standard-c', key: 'standard-key', hash: 'c', available: false }])
    await expect(publishScaleCourseLinks(tx, { ...shared, id: 'native', libraryEntryId: null, instrumentClass: 'STANDARD' }, [training]))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
})
