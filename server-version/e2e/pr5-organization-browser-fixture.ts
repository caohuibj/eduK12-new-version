import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import bcrypt from '../backend/node_modules/bcryptjs'
import {
  createMembership,
  createOrganization,
  grantPersona,
} from '../backend/src/modules/organization/service'
import {
  createPlatformReportingSpec,
  publishPlatformReportingSpec,
  reviewPlatformReportingSpec,
} from '../backend/src/modules/reporting/spec'

const { PrismaClient } = require('../backend/node_modules/@prisma/client') as { PrismaClient: new () => any }
const prisma = new PrismaClient()
const output = process.env.PR5_ORGANIZATION_E2E_FIXTURE_FILE || '/tmp/eduk12-pr5-organization-fixture.json'
const password = 'Pr5OrgBrowserPass!2026'
const key = (label: string, suffix: string) => `pr5-browser-${label}-${suffix}-${randomUUID()}`

const main = async () => {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`
  const passwordHash = await bcrypt.hash(password, 10)
  const createUser = (label: string, role: 'STUDENT' | 'PARENT' | 'ADMIN', platformRole: 'STANDARD' | 'SYSTEM_ADMIN' = 'STANDARD') => prisma.user.create({
    data: {
      username: `pr5_org_${label}_${suffix}`,
      passwordHash,
      role,
      platformRole,
      nickname: `PR5 ${label}`,
      mustChangePassword: false,
      isActive: true,
      teacherApproved: role === 'ADMIN',
    },
  })

  // Deliberately keep tenant actors on legacy STUDENT. Organization authority
  // must come from current Membership/Persona rather than User.role.
  const owner = await createUser('owner', 'STUDENT')
  const backupAdmin = await createUser('backup_admin', 'STUDENT')
  const teacher = await createUser('teacher_persona', 'STUDENT')
  const student = await createUser('student', 'STUDENT')
  const parent = await createUser('parent', 'PARENT')
  const client = await createUser('client', 'STUDENT')
  const outsider = await createUser('outsider', 'STUDENT')
  const systemAdmin = await createUser('system_admin', 'ADMIN', 'SYSTEM_ADMIN')

  const primary = await createOrganization({
    name: `PR5 Browser Organization ${suffix}`,
    meta: { actorUserId: owner.id, commandKey: key('org-primary', suffix) },
  })
  await createMembership({
    organizationId: primary.organization.id,
    userId: backupAdmin.id,
    orgRole: 'ORG_ADMIN',
    meta: { actorUserId: owner.id, commandKey: key('backup-admin', suffix) },
  })

  const teacherMembership = await createMembership({
    organizationId: primary.organization.id,
    userId: teacher.id,
    meta: { actorUserId: owner.id, commandKey: key('teacher-membership', suffix) },
  })
  await grantPersona({
    organizationId: primary.organization.id,
    membershipId: teacherMembership.id,
    persona: 'TEACHER',
    meta: { actorUserId: owner.id, commandKey: key('teacher-persona', suffix) },
  })

  const studentMembership = await createMembership({
    organizationId: primary.organization.id,
    userId: student.id,
    meta: { actorUserId: owner.id, commandKey: key('student-membership', suffix) },
  })
  await grantPersona({
    organizationId: primary.organization.id,
    membershipId: studentMembership.id,
    persona: 'STUDENT',
    meta: { actorUserId: owner.id, commandKey: key('student-persona', suffix) },
  })

  await grantPersona({ organizationId: primary.organization.id, membershipId: teacherMembership.id, persona: 'COUNSELOR', meta: { actorUserId: owner.id, commandKey: key('counselor-persona', suffix) } })
  const clientMembership = await createMembership({ organizationId: primary.organization.id, userId: client.id, meta: { actorUserId: owner.id, commandKey: key('client-member', suffix) } })
  await grantPersona({ organizationId: primary.organization.id, membershipId: clientMembership.id, persona: 'CLIENT', meta: { actorUserId: owner.id, commandKey: key('client-persona', suffix) } })

  await prisma.parentStudentRelationship.create({
    data: {
      parentUserId: parent.id,
      studentUserId: student.id,
      status: 'ACTIVE',
      approvedByUserId: owner.id,
      approvedAt: new Date(),
    },
  })

  const foreign = await createOrganization({
    name: `PR5 Foreign Organization ${suffix}`,
    meta: { actorUserId: outsider.id, commandKey: key('org-foreign', suffix) },
  })

  // Seed one governed published spec so the TEACHER-persona browser journey can
  // prove that Reporting discovery is backed by the real database.
  const spec = await createPlatformReportingSpec({
    actor: { userId: systemAdmin.id, platformRole: 'SYSTEM_ADMIN' },
    specKey: `pr5-browser-group-${suffix}`,
    version: 1,
    definition: {
      schemaVersion: 1,
      analysisKind: 'GROUP',
      engineKey: 'ORG_GROUP_V1',
      engineVersion: '1.0.0',
      privacyUnit: 'SUBJECT',
      selectionPolicy: 'UNIQUE_OR_REJECT',
      minimumCohortN: 3,
      minimumContributorN: 3,
      reportEvidenceCeiling: 'PILOT',
      metricRules: [{
        metricId: 'score',
        sourceMetricKey: 'score',
        acceptedResultQuality: ['interpretable'],
        acceptedMetricQuality: 'IGNORE_METRIC_QUALITY',
        aggregations: ['MEAN'],
        missingnessRule: 'EXCLUDE',
        minimumMetricN: 3,
        observationUnit: 'SUBJECT',
        selectionPolicy: 'UNIQUE_OR_REJECT',
      }],
    },
  })
  await reviewPlatformReportingSpec({ actor: { userId: systemAdmin.id, platformRole: 'SYSTEM_ADMIN' }, specId: spec.id })
  await publishPlatformReportingSpec({ actor: { userId: systemAdmin.id, platformRole: 'SYSTEM_ADMIN' }, specId: spec.id })

  const fixture = {
    username: owner.username,
    password,
    ownerUserId: owner.id,
    ownerMembershipId: primary.membership.id,
    counselorMembershipId: teacherMembership.id,
    clientMembershipId: clientMembership.id,
    organizationId: primary.organization.id,
    organizationName: primary.organization.name,
    foreignOrganizationId: foreign.organization.id,
    foreignOrganizationName: foreign.organization.name,
    runName: `PR5 Browser Run ${suffix}`,
    gradeName: `PR5 Browser Grade ${suffix}`,
    publishedSpec: { id: spec.id, key: spec.specKey },
    users: {
      client: { id: client.id, username: client.username, password, legacyRole: client.role },
      owner: { id: owner.id, username: owner.username, password, legacyRole: owner.role },
      teacher: { id: teacher.id, username: teacher.username, password, legacyRole: teacher.role },
      student: { id: student.id, username: student.username, password, legacyRole: student.role },
      parent: { id: parent.id, username: parent.username, password, legacyRole: parent.role },
    },
  }
  writeFileSync(output, JSON.stringify(fixture, null, 2))
  console.log(`PR5 Organization browser fixture written to ${output}`)
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
