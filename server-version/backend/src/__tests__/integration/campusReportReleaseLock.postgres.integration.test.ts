import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { withCampusReportReleaseLock } from '../../modules/campus/report-release-lock'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip

/**
 * Real PostgreSQL sessions, not a mocked mutex. The two operations model a
 * GROUP vs REPEATED_COHORT/MATCHED_LONGITUDINAL report attempting to release
 * overlapping frozen populations (nine of ten students shared). Their source
 * cohort guards are tested separately; here we prove only one school
 * disclosure is allowed into the guard/write/post-check critical section.
 */
suite('Huischool concurrent group / longitudinal report disclosure fencing — isolated PostgreSQL', () => {
  it('admits one report per school and rejects the simultaneous overlapping report before generation', async () => {
    requireIsolatedReleaseDatabase(DB_URL!)
    const schoolA = randomUUID()
    const schoolB = randomUUID()
    const groupMembers = Array.from({length:10}, (_, i) => 'student-'+i)
    const longitudinalMembers = [...groupMembers.slice(1), 'student-10']
    expect(groupMembers.filter(id => longitudinalMembers.includes(id))).toHaveLength(9)
    let enter!: () => void
    let release!: () => void
    const entered = new Promise<void>(resolve => { enter = resolve })
    const held = new Promise<void>(resolve => { release = resolve })
    let generated = 0
    const group = withCampusReportReleaseLock(schoolA, async () => {
      generated += 1
      enter() // The GROUP precheck would have passed before this signal.
      await held // Its artifact write and postcheck are still in progress.
      return { kind: 'GROUP', members: groupMembers }
    })
    try {
      await entered
      const contender = withCampusReportReleaseLock(schoolA, async () => {
        generated += 1
        return { kind: 'REPEATED_COHORT', members: longitudinalMembers }
      })
      await expect(contender).rejects.toMatchObject({
        code: 'CAMPUS_REPORT_RELEASE_BUSY', statusCode: 409,
      })
      expect(generated).toBe(1)
      // An independent school has its own privacy history and can progress.
      await expect(withCampusReportReleaseLock(schoolB, async () => 'school-B'))
        .resolves.toBe('school-B')
    } finally {
      release() // Always release the first operation if a contender assertion fails.
    }
    await expect(group).resolves.toMatchObject({ kind: 'GROUP' })
    // A later caller may acquire the lock but must recheck frozen histories;
    // it cannot reuse either concurrent caller's old precheck.
    await expect(withCampusReportReleaseLock(schoolA, async () => 'must-recheck'))
      .resolves.toBe('must-recheck')
  })

  it('drops the lock on a failed writer so future reads are not held indefinitely', async () => {
    requireIsolatedReleaseDatabase(DB_URL!)
    const school = randomUUID()
    await expect(withCampusReportReleaseLock(school, async () => {
      throw new Error('artifact validation rejected before disclosure')
    })).rejects.toThrow('artifact validation')
    await expect(withCampusReportReleaseLock(school, async () => 'recovered'))
      .resolves.toBe('recovered')
  })
})
