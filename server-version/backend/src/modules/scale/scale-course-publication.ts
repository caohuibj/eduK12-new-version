import { Prisma, type Scale } from '@prisma/client'
import { assertToolEntryPolicy } from '../assessment-governance/tool-entry-policy'
import { ScaleLibraryError } from '../scale-library-governance/contracts'
import { readLibraryScaleMeasurementSource } from '../scale-library-governance/training-source'
import { toolLicenseKey } from '../tool-licensing/contracts'
import { authorizeToolPublication, isExpandedToolLicensingEnabled, ToolLicenseAccessError } from '../tool-licensing/runtime'
import { standardNativeScaleJoin } from './component-import/native-source'
import { assertTrainingScaleCollectionAllowed } from './scale-collection-guard'

type Course = {
  id: string
  creatorId: string
  courseType: string
  isLibrary: boolean
}

const trainingDelivery = (course: Course) =>
  !course.isLibrary && (course.courseType === 'TRAINING_COURSE' || course.courseType === 'LEGACY_COURSE')

async function publishedToolKey(tx: Prisma.TransactionClient, scale: Scale) {
  if (scale.libraryEntryId) {
    const source = await readLibraryScaleMeasurementSource(tx, scale)
    return toolLicenseKey('SCALE', source.release.key)
  }
  // Imported standard C does not advertise the standalone runtime. A code
  // package without an exact, permitted standard combination retains its
  // existing course delivery and has no corresponding commercial tool.
  if (scale.standardSourceKind !== 'CODE_PACKAGE' || scale.instrumentClass !== 'STANDARD') return null
  const [standard] = await tx.$queryRaw<Array<{ id: string; hash: string; key: string; available: boolean }>>(Prisma.sql`
    SELECT r.id,r.combination_hash AS hash,r.tool_key AS key,
      COALESCE(r.state='ONLINE' AND policy.decision='APPROVED' AND NOT policy.paused,false) AS available
    FROM scales native
    JOIN survey_standard_releases r ON ${standardNativeScaleJoin('native')}
    JOIN measurement_content_releases m ON m.id=native.measurement_release_id
      AND m.id=r.measurement_release->>'releaseId' AND m.content_hash=r.measurement_release->>'contentHash'
    LEFT JOIN survey_tool_policies policy ON policy.product='TRAINING' AND policy.resource_key='standard-release:'||r.id
      AND policy.fingerprint=r.combination_hash
    WHERE native.id=${scale.id} AND m.layer='MEASUREMENT' AND m.family='SCALE' AND m.status='PUBLISHED'
      AND (policy.resource_key IS NOT NULL OR r.state='ONLINE')
    ORDER BY available DESC,r.id LIMIT 1 FOR SHARE OF r
  `)
  if (!standard) return null
  if (!standard.available) throw new ScaleLibraryError(409, '该标准量表没有可投放的 Training 版本')
  await assertToolEntryPolicy(tx, { resourceKey: 'standard-release:' + standard.id, fingerprint: standard.hash }, 'TRAINING')
  await assertTrainingScaleCollectionAllowed(tx, [scale.id])
  return 'SCALE:' + standard.key
}

/** Linking a released standalone scale to a course creates its delivery.
 * The persisted link identifies one publication and is replay-safe. */
export async function publishScaleCourseLinks(tx: Prisma.TransactionClient, scale: Scale, courses: readonly Course[]) {
  const data = courses.map(course => ({ courseId: course.id, scaleId: scale.id }))
  if (!isExpandedToolLicensingEnabled('TRAINING') || scale.status !== 'PUBLISHED'
    || !['COURSE', 'PUBLIC'].includes(scale.visibility) || (!scale.libraryEntryId && scale.instrumentClass !== 'STANDARD')
    || !courses.some(trainingDelivery)) return tx.courseScale.createMany({ data, skipDuplicates: true })

  const links = await tx.courseScale.createManyAndReturn({ data, skipDuplicates: true, select: { id: true, courseId: true } })
  const billableCourses = new Map(courses.filter(trainingDelivery).map(course => [course.id, course.creatorId]))
  const billableLinks = links.filter(link => billableCourses.has(link.courseId)).sort((a, b) =>
    billableCourses.get(a.courseId)!.localeCompare(billableCourses.get(b.courseId)!) || a.courseId.localeCompare(b.courseId))
  if (!billableLinks.length) return { count: links.length }
  const key = await publishedToolKey(tx, scale)
  if (!key) return { count: links.length }
  for (const link of billableLinks) {
    try {
      await authorizeToolPublication(tx, {
        product: 'TRAINING', subjectId: billableCourses.get(link.courseId)!, publicationId: link.id, toolKeys: [key],
      })
    } catch (error) {
      if (error instanceof ToolLicenseAccessError) throw new ScaleLibraryError(error.statusCode, error.message)
      throw error
    }
  }
  return { count: links.length }
}
