/** Read-only organization membership diagnosis. Never grants or repairs authority. */
import { PrismaClient } from '@prisma/client'
import { resolveOrganizationAccessContext } from '../modules/organization/access'
async function main() {
  const args = process.argv.slice(2),
    value = (name: string) => args[args.indexOf(name) + 1]
  if (
    !args.includes('--organization-id') ||
    !args.includes('--username') ||
    !process.env.DATABASE_URL
  )
    throw new Error(
      'Required: explicit DATABASE_URL, --organization-id <id>, --username <account>',
    )
  const organizationId = value('--organization-id'),
    username = value('--username')
  if (
    !organizationId ||
    !username ||
    organizationId.startsWith('--') ||
    username.startsWith('--')
  )
    throw new Error('Invalid arguments')
  const db = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  })
  try {
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`
      const user = await tx.user.findUnique({
        where: { username },
        select: {
          id: true,
          username: true,
          role: true,
          platformRole: true,
          isActive: true,
          isFrozen: true,
          mustChangePassword: true,
          teacherApproved: true,
          expiresAt: true,
        },
      })
      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true, status: true },
      })
      if (!user || !organization)
        return {
          accountFound: Boolean(user),
          organizationFound: Boolean(organization),
        }
      const access = await resolveOrganizationAccessContext(
        {
          principal: { userId: user.id, platformRole: user.platformRole },
          organizationId,
        },
        tx,
      )
      const reasons: string[] = []
      if (!user.isActive) reasons.push('ACCOUNT_INACTIVE')
      if (user.isFrozen) reasons.push('ACCOUNT_FROZEN')
      if (user.mustChangePassword) reasons.push('PASSWORD_CHANGE_REQUIRED')
      if (user.role === 'TEACHER' && !user.teacherApproved)
        reasons.push('TEACHER_APPROVAL_REQUIRED')
      if (user.expiresAt && user.expiresAt <= new Date())
        reasons.push('ACCOUNT_EXPIRED')
      if (organization.status !== 'ACTIVE')
        reasons.push('ORGANIZATION_SUSPENDED')
      if (!access?.membershipId)
        reasons.push('NO_CURRENT_ORGANIZATION_MEMBERSHIP')
      if (access?.explicitDenies.length)
        reasons.push('EXPLICIT_ORGANIZATION_DENY')
      return {
        account: user,
        organization,
        access,
        reasons,
        note: 'Legacy ADMIN and Course enrollment do not imply organization membership. A current SYSTEM_ADMIN may govern the directory; delivery and individual disclosure require their own authority.',
      }
    })
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await db.$disconnect()
  }
}
main().catch(() => {
  console.error(
    'Organization diagnosis failed. Check arguments, database access and migration status. Connection details are not printed.',
  )
  process.exitCode = 1
})
