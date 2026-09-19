import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { createMembership, createOrganization } from '../backend/src/modules/organization/service'

const prisma = new PrismaClient()
const output = process.env.PR5_ORGANIZATION_E2E_FIXTURE_FILE || '/tmp/eduk12-pr5-organization-fixture.json'
const password = 'Pr5OrgBrowserPass!2026'

const main = async () => {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`
  const passwordHash = await bcrypt.hash(password, 10)

  // Intentionally keep the product owner's legacy role STUDENT. Organization
  // authority must come from the current Membership episode, not User.role.
  const owner = await prisma.user.create({
    data: {
      username: `pr5_org_owner_${suffix}`,
      passwordHash,
      role: 'STUDENT',
      platformRole: 'STANDARD',
      nickname: 'PR5 Organization Owner',
      mustChangePassword: false,
      isActive: true,
    },
  })
  const backupAdmin = await prisma.user.create({
    data: {
      username: `pr5_org_backup_${suffix}`,
      passwordHash,
      role: 'STUDENT',
      platformRole: 'STANDARD',
      nickname: 'PR5 Backup Admin',
      mustChangePassword: false,
      isActive: true,
    },
  })
  const outsider = await prisma.user.create({
    data: {
      username: `pr5_org_outsider_${suffix}`,
      passwordHash,
      role: 'STUDENT',
      platformRole: 'STANDARD',
      nickname: 'PR5 Other Organization Owner',
      mustChangePassword: false,
      isActive: true,
    },
  })

  const primary = await createOrganization({
    name: `PR5 Browser Organization ${suffix}`,
    meta: { actorUserId: owner.id, commandKey: `pr5-browser-org-primary-${suffix}` },
  })
  await createMembership({
    organizationId: primary.organization.id,
    userId: backupAdmin.id,
    orgRole: 'ORG_ADMIN',
    meta: { actorUserId: owner.id, commandKey: `pr5-browser-backup-admin-${suffix}` },
  })
  const foreign = await createOrganization({
    name: `PR5 Foreign Organization ${suffix}`,
    meta: { actorUserId: outsider.id, commandKey: `pr5-browser-org-foreign-${suffix}` },
  })

  const fixture = {
    username: owner.username,
    password,
    ownerUserId: owner.id,
    ownerMembershipId: primary.membership.id,
    organizationId: primary.organization.id,
    organizationName: primary.organization.name,
    foreignOrganizationId: foreign.organization.id,
    foreignOrganizationName: foreign.organization.name,
    runName: `PR5 Browser Run ${suffix}`,
    gradeName: `PR5 Browser Grade ${suffix}`,
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
