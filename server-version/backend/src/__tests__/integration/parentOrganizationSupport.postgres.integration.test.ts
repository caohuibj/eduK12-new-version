import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import express from 'express'
import bcrypt from 'bcryptjs'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'
import { generateToken } from '../../utils/jwt'
import { csrfProtection } from '../../middleware/csrf'
import {
  parentAccountsRouter,
  platformUsersRouter,
} from '../../modules/parent-portal/accounts.routes'
import {
  organizationInvitationsRouter,
  createOrganizationInvitation,
  previewOrganizationInvitation,
  acceptOrganizationInvitation,
} from '../../modules/organization/invitations'
import organizationRoutes from '../../modules/organization/organization.routes'
import {
  createMembership,
  createOrganization,
  setMembershipRole,
  denyOrganizationAccess,
  liftOrganizationAccessDeny,
  endMembership,
} from '../../modules/organization/service'
import { createParentPortalService } from '../../modules/parent-portal/service'
import { LINK_CONSENT_VERSION } from '../../modules/parent-portal/contracts'
const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
let server: Server, origin: string
async function user(
  role: 'ADMIN' | 'STUDENT' | 'TEACHER' | 'PARENT',
  system = false,
) {
  return prisma.user.create({
    data: {
      username: 'support-test-' + randomUUID(),
      role,
      platformRole: system ? 'SYSTEM_ADMIN' : 'STANDARD',
      teacherApproved: true,
      passwordHash: 'test-only',
    },
  })
}
const actor = (u: Awaited<ReturnType<typeof user>>) => ({
  userId: u.id,
  role: u.role,
  platformRole: u.platformRole,
})
const meta = (id: string) => ({ actorUserId: id, commandKey: randomUUID() })
async function fixture() {
  const admin = await user('ADMIN'),
    child = await user('STUDENT')
  const org = await prisma.organization.create({
    data: {
      id: randomUUID(),
      name: 'Support synthetic ' + randomUUID(),
      createdByUserId: admin.id,
    },
  })
  await createMembership({
    organizationId: org.id,
    userId: admin.id,
    orgRole: 'ORG_ADMIN',
    meta: meta(admin.id),
  })
  return { admin, child, org }
}
async function request(
  u: Awaited<ReturnType<typeof user>>,
  path: string,
  body?: unknown,
  token?: string,
) {
  const res = await fetch(origin + '/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Cookie:
        'ptool_csrf=support-csrf; ptool_session=' +
        (token ??
          generateToken({
            userId: u.id,
            username: u.username,
            role: u.role,
            tokenVersion: u.tokenVersion,
          })),
      'X-CSRF-Token': 'support-csrf',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json(), headers: res.headers }
}
suite(
  'Parent and organization support through PostgreSQL and actual HTTP',
  () => {
    beforeAll(async () => {
      const selected = new URL(url!),
        actual = new URL(process.env.DATABASE_URL ?? '')
      if (
        !/test|ci/i.test(selected.pathname) ||
        selected.host !== actual.host ||
        selected.pathname !== actual.pathname
      )
        throw new Error('requires selected isolated test database')
      const app = express()
      app.use(express.json())
      app.use('/api', csrfProtection)
      app.use('/api/parent-accounts', parentAccountsRouter)
      app.use('/api/platform-users', platformUsersRouter)
      app.use('/api/organization-invitations', organizationInvitationsRouter)
      app.use('/api/organizations', organizationRoutes)
      app.use((e: any, _q: any, r: any, _n: any) =>
        r.status(500).json({ code: 'TEST_FAILURE', message: 'fixture error' }),
      )
      server = app.listen(0, '127.0.0.1')
      await new Promise<void>((r) => server.once('listening', r))
      const a = server.address()
      if (!a || typeof a === 'string') throw new Error('listener missing')
      origin = 'http://127.0.0.1:' + a.port
    })
    afterAll(async () => {
      if (server) {
        server.closeAllConnections()
        await new Promise<void>((r) => server.close(() => r()))
      }
      await prisma.$disconnect()
    })
    it('legacy ADMIN cannot search accounts or create parents; current SYSTEM_ADMIN creates one audited password-change account', async () => {
      const legacy = await user('ADMIN'),
        root = await user('ADMIN', true),
        password = 'SupportOnly12345',
        input = {
          username: 'created-parent-' + randomUUID().slice(0, 8),
          nickname: 'Synthetic parent',
          password,
          commandKey: randomUUID(),
        }
      expect((await request(legacy, '/parent-accounts', input)).status).toBe(
        403,
      )
      expect((await request(legacy, '/platform-users')).status).toBe(403)
      const first = await request(root, '/parent-accounts', input)
      expect(first.status).toBe(200)
      expect(first.body.data).toMatchObject({
        role: 'PARENT',
        platformRole: 'STANDARD',
        mustChangePassword: true,
      })
      expect(JSON.stringify(first.body)).not.toMatch(
        /passwordHash|SupportOnly12345|credentialFingerprint/,
      )
      expect(
        (await request(root, '/parent-accounts', input)).body.data.id,
      ).toBe(first.body.data.id)
      expect(
        (
          await request(root, '/parent-accounts', {
            ...input,
            nickname: 'Changed',
          })
        ).status,
      ).toBe(409)
      const parent = await prisma.user.findUniqueOrThrow({
        where: { id: first.body.data.id },
      })
      expect(await bcrypt.compare(password, parent.passwordHash)).toBe(true)
      expect((await request(parent, '/organizations')).status).toBe(403)
      const rows = await prisma.$queryRaw<
        Array<{ response: unknown; payload: unknown }>
      >`SELECT r.response,a.payload FROM organization_command_receipts r JOIN organization_governance_audits a ON a.actor_user_id=r.actor_user_id AND a.target_id=${parent.id} WHERE r.actor_user_id=${root.id}`
      expect(rows).toHaveLength(1)
      expect(JSON.stringify(rows)).not.toMatch(/SupportOnly12345|passwordHash/)
      await prisma.user.update({
        where: { id: root.id },
        data: { platformRole: 'STANDARD' },
      })
      expect((await request(root, '/parent-accounts', input)).status).toBe(403)
    })
    it('parent reset invalidates old sessions, keeps credentials out of receipts and is idempotent', async () => {
      const root = await user('ADMIN', true),
        parent = await user('PARENT'),
        token = generateToken({
          userId: parent.id,
          username: parent.username,
          role: parent.role,
          tokenVersion: parent.tokenVersion,
        }),
        input = { password: 'ResetSupport123', commandKey: randomUUID() }
      const response = await request(
        root,
        '/parent-accounts/' + parent.id + '/reset-password',
        input,
      )
      expect(response.status).toBe(200)
      expect(JSON.stringify(response.body)).not.toContain(input.password)
      expect(
        (
          await request(
            root,
            '/parent-accounts/' + parent.id + '/reset-password',
            input,
          )
        ).status,
      ).toBe(200)
      const changed = await prisma.user.findUniqueOrThrow({
        where: { id: parent.id },
      })
      expect(changed.tokenVersion).toBe(parent.tokenVersion + 1)
      expect(changed.mustChangePassword).toBe(true)
      expect(
        (await request(parent, '/organizations', undefined, token)).status,
      ).toBe(401)
    })
    it('invitation creates only MEMBER with selected persona; retry audits once, another actor and old episode cannot reuse it', async () => {
      const f = await fixture(),
        invite = await createOrganizationInvitation(
          f.admin.id,
          f.org.id,
          'STUDENT',
        ),
        command = randomUUID()
      expect(
        await previewOrganizationInvitation(f.child.id, invite.inviteCode),
      ).toMatchObject({
        organization: { id: f.org.id },
        orgRole: 'MEMBER',
        persona: 'STUDENT',
        alreadyMember: false,
      })
      const accepted = await acceptOrganizationInvitation(
        f.child.id,
        invite.inviteCode,
        command,
      )
      expect(
        await acceptOrganizationInvitation(
          f.child.id,
          invite.inviteCode,
          command,
        ),
      ).toEqual(accepted)
      const member = await prisma.organizationMembership.findUniqueOrThrow({
        where: { id: accepted.membershipId! },
      })
      expect(member.orgRole).toBe('MEMBER')
      expect(
        await prisma.organizationPersonaGrant.count({
          where: { membershipId: member.id, persona: 'STUDENT' },
        }),
      ).toBe(1)
      expect(
        await prisma.organizationCapabilityGrant.count({
          where: { membershipId: member.id },
        }),
      ).toBe(0)
      const other = await user('STUDENT')
      await expect(
        acceptOrganizationInvitation(other.id, invite.inviteCode, randomUUID()),
      ).rejects.toThrow()
      await endMembership({
        organizationId: f.org.id,
        membershipId: member.id,
        meta: meta(f.admin.id),
      })
      await expect(
        acceptOrganizationInvitation(
          f.child.id,
          invite.inviteCode,
          randomUUID(),
        ),
      ).rejects.toThrow()
      const fresh = await createOrganizationInvitation(
          f.admin.id,
          f.org.id,
          'STUDENT',
        ),
        rejoined = await acceptOrganizationInvitation(
          f.child.id,
          fresh.inviteCode,
          randomUUID(),
        )
      expect(rejoined.membershipId).not.toBe(member.id)
    })
    it.each(['role', 'expiry', 'inviter-ended', 'deny'])(
      'current %s rejects invitation consumption',
      async (condition) => {
        const f = await fixture(),
          invite = await createOrganizationInvitation(
            f.admin.id,
            f.org.id,
            'STUDENT',
          )
        if (condition === 'role')
          await prisma.user.update({
            where: { id: f.child.id },
            data: { role: 'PARENT' },
          })
        if (condition === 'expiry')
          await prisma.$executeRaw`UPDATE organization_member_invitations SET created_at=statement_timestamp()-interval '2 days',expires_at=statement_timestamp()-interval '1 day' WHERE id=${invite.id}`
        if (condition === 'inviter-ended')
          await prisma.organizationMembership.updateMany({
            where: { organizationId: f.org.id, userId: f.admin.id },
            data: { validUntil: new Date() },
          })
        if (condition === 'deny')
          await prisma.organizationAccessDeny.create({
            data: {
              id: randomUUID(),
              organizationId: f.org.id,
              userId: f.child.id,
              permission: '*',
              reason: 'test',
              deniedByUserId: f.admin.id,
            },
          })
        await expect(
          acceptOrganizationInvitation(
            f.child.id,
            invite.inviteCode,
            randomUUID(),
          ),
        ).rejects.toThrow()
        expect(
          await prisma.organizationMembership.count({
            where: { organizationId: f.org.id, userId: f.child.id },
          }),
        ).toBe(0)
      },
    )
    it('two consumers of one membership invitation have only one winner', async () => {
      const f = await fixture(),
        other = await user('STUDENT'),
        invite = await createOrganizationInvitation(
          f.admin.id,
          f.org.id,
          'STUDENT',
        )
      const result = await Promise.allSettled([
        acceptOrganizationInvitation(
          f.child.id,
          invite.inviteCode,
          randomUUID(),
        ),
        acceptOrganizationInvitation(other.id, invite.inviteCode, randomUUID()),
      ])
      expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(
        await prisma.organizationMembership.count({
          where: { organizationId: f.org.id, orgRole: 'MEMBER' },
        }),
      ).toBe(1)
    })
    it('membership creation and persona are atomic; paged filters return human-readable current and historical rows', async () => {
      const f = await fixture(),
        body = {
          userId: f.child.id,
          orgRole: 'MEMBER',
          persona: 'STUDENT',
          commandKey: randomUUID(),
        }
      const response = await request(
        f.admin,
        '/organizations/' + f.org.id + '/memberships',
        body,
      )
      expect(response.status).toBe(200)
      const id = response.body.data.id
      expect(
        await prisma.organizationPersonaGrant.count({
          where: { membershipId: id, persona: 'STUDENT' },
        }),
      ).toBe(1)
      const page = await request(
        f.admin,
        '/organizations/' +
          f.org.id +
          '/memberships?state=CURRENT&orgRole=MEMBER&keyword=' +
          encodeURIComponent(f.child.username),
      )
      expect(page.status).toBe(200)
      expect(page.body.data).toMatchObject({
        total: 1,
        list: [
          {
            id,
            username: f.child.username,
            isCurrent: true,
            accountUsable: true,
          },
        ],
      })
      await endMembership({
        organizationId: f.org.id,
        membershipId: id,
        meta: meta(f.admin.id),
      })
      expect(
        (
          await request(
            f.admin,
            '/organizations/' +
              f.org.id +
              '/memberships?state=CURRENT&orgRole=MEMBER',
          )
        ).body.data.total,
      ).toBe(0)
      expect(
        (
          await request(
            f.admin,
            '/organizations/' + f.org.id + '/memberships?state=ENDED',
          )
        ).body.data.total,
      ).toBe(1)
    })
    it('paginates all delivery grant history beyond the former 200-row cut-off', async () => {
      const f = await fixture(),
        teacher = await user('TEACHER'),
        grade = randomUUID(),
        classroom = randomUUID(),
        prefix = randomUUID()
      const membership = await createMembership({
        organizationId: f.org.id,
        userId: teacher.id,
        persona: 'TEACHER',
        meta: meta(f.admin.id),
      })
      await prisma.$executeRaw`INSERT INTO organization_units (id,organization_id,unit_kind,name,parent_unit_id) VALUES (${grade},${f.org.id},'GRADE','Synthetic grade',NULL),(${classroom},${f.org.id},'CLASS','Synthetic class',${grade})`
      await prisma.$executeRaw`INSERT INTO organization_assessment_delivery_grants (id,organization_id,teacher_membership_id,class_unit_id,granted_by_user_id,revoked_by_user_id,revoked_at) SELECT ${prefix}||'-'||i::text,${f.org.id},${membership.id},${classroom},${f.admin.id},${f.admin.id},statement_timestamp() FROM generate_series(1,201) i`
      const legacy = await request(
        f.admin,
        '/organizations/' + f.org.id + '/assessment-delivery-grants',
      )
      expect(legacy.body.data).toMatchObject({
        total: 201,
        page: 1,
        pageSize: 200,
      })
      expect(legacy.body.data.list).toHaveLength(200)
      const rows: Array<{ id: string }> = []
      for (let page = 1; page <= 3; page++) {
        const res = await request(
          f.admin,
          '/organizations/' +
            f.org.id +
            '/assessment-delivery-grants?page=' +
            page +
            '&pageSize=100',
        )
        expect(res.status).toBe(200)
        expect(res.body.data).toMatchObject({ total: 201, page, pageSize: 100 })
        expect(res.body.data.list).toHaveLength(page === 3 ? 1 : 100)
        rows.push(...res.body.data.list)
      }
      expect(new Set(rows.map((row) => row.id)).size).toBe(201)
    })
    it.each(['password', 'approval', 'frozen', 'inactive', 'expired'])(
      'does not create an organization whose initial administrator is unusable: %s',
      async (condition) => {
        const root = await user('ADMIN', true),
          candidate = await user('TEACHER')
        await prisma.user.update({
          where: { id: candidate.id },
          data: {
            ...(condition === 'password' ? { mustChangePassword: true } : {}),
            ...(condition === 'approval' ? { teacherApproved: false } : {}),
            ...(condition === 'frozen' ? { isFrozen: true } : {}),
            ...(condition === 'inactive' ? { isActive: false } : {}),
            ...(condition === 'expired'
              ? { expiresAt: new Date(Date.now() - 60000) }
              : {}),
          },
        })
        const name = 'Unusable synthetic ' + randomUUID()
        await expect(
          createOrganization({
            name,
            firstAdminUserId: candidate.id,
            meta: meta(root.id),
          }),
        ).rejects.toMatchObject({ code: 'INITIAL_ADMIN_UNAVAILABLE' })
        expect(await prisma.organization.count({ where: { name } })).toBe(0)
      },
    )
    it('creates an organization with an approved teacher as its usable initial administrator', async () => {
      const root = await user('ADMIN', true),
        candidate = await user('TEACHER')
      const result = await createOrganization({
        name: 'Usable synthetic ' + randomUUID(),
        firstAdminUserId: candidate.id,
        meta: meta(root.id),
      })
      expect(result.membership).toMatchObject({
        userId: candidate.id,
        orgRole: 'ORG_ADMIN',
        validUntil: null,
      })
    })
    it.each(['*', 'ORGANIZATION_GOVERNANCE'])(
      'a %s-denied administrator cannot replace the last governable administrator',
      async (permission) => {
        const f = await fixture(),
          second = await user('TEACHER')
        const m = await createMembership({
          organizationId: f.org.id,
          userId: second.id,
          orgRole: 'ORG_ADMIN',
          meta: meta(f.admin.id),
        })
        const first = await prisma.organizationMembership.findFirstOrThrow({
          where: {
            organizationId: f.org.id,
            userId: f.admin.id,
            validUntil: null,
          },
        })
        await denyOrganizationAccess({
          organizationId: f.org.id,
          userId: second.id,
          permission,
          reason: 'synthetic deny',
          meta: meta(f.admin.id),
        })
        await expect(
          endMembership({
            organizationId: f.org.id,
            membershipId: first.id,
            meta: meta(f.admin.id),
          }),
        ).rejects.toMatchObject({ code: 'LAST_ORG_ADMIN' })
        await expect(
          setMembershipRole({
            organizationId: f.org.id,
            membershipId: first.id,
            orgRole: 'MEMBER',
            meta: meta(f.admin.id),
          }),
        ).rejects.toMatchObject({ code: 'LAST_ORG_ADMIN' })
        expect(
          await prisma.organizationMembership.findUniqueOrThrow({
            where: { id: first.id },
          }),
        ).toMatchObject({ orgRole: 'ORG_ADMIN', validUntil: null })
        await liftOrganizationAccessDeny({
          organizationId: f.org.id,
          userId: second.id,
          permission,
          reason: 'synthetic restore',
          meta: meta(f.admin.id),
        })
        await endMembership({
          organizationId: f.org.id,
          membershipId: first.id,
          meta: meta(f.admin.id),
        })
        expect(
          (
            await prisma.organizationMembership.findUniqueOrThrow({
              where: { id: m.id },
            })
          ).validUntil,
        ).toBeNull()
      },
    )
    it.each(['*', 'ORGANIZATION_GOVERNANCE'])(
      'a %s-denied account cannot be added or promoted as organization administrator',
      async (permission) => {
        const f = await fixture(),
          target = await user('TEACHER')
        await denyOrganizationAccess({
          organizationId: f.org.id,
          userId: target.id,
          permission,
          reason: 'synthetic deny',
          meta: meta(f.admin.id),
        })
        await expect(
          createMembership({
            organizationId: f.org.id,
            userId: target.id,
            orgRole: 'ORG_ADMIN',
            meta: meta(f.admin.id),
          }),
        ).rejects.toMatchObject({ code: 'ORG_ADMIN_UNAVAILABLE' })
        const member = await createMembership({
          organizationId: f.org.id,
          userId: target.id,
          orgRole: 'MEMBER',
          meta: meta(f.admin.id),
        })
        await expect(
          setMembershipRole({
            organizationId: f.org.id,
            membershipId: member.id,
            orgRole: 'ORG_ADMIN',
            meta: meta(f.admin.id),
          }),
        ).rejects.toMatchObject({ code: 'ORG_ADMIN_UNAVAILABLE' })
        expect(
          (
            await prisma.organizationMembership.findUniqueOrThrow({
              where: { id: member.id },
            })
          ).orgRole,
        ).toBe('MEMBER')
      },
    )
    it('organization-only students can invite parents; ended and rejoined membership does not validate old invitation', async () => {
      const f = await fixture(),
        parent = await user('PARENT'),
        service = createParentPortalService()
      const m = await createMembership({
        organizationId: f.org.id,
        userId: f.child.id,
        persona: 'STUDENT',
        meta: meta(f.admin.id),
      })
      expect(
        (await service.invitationSources(actor(f.child))).list,
      ).toContainEqual({
        kind: 'ORGANIZATION',
        id: f.org.id,
        title: f.org.name,
      })
      const invitation = await service.invitations(actor(f.child), {
        organizationId: f.org.id,
      })
      await endMembership({
        organizationId: f.org.id,
        membershipId: m.id,
        meta: meta(f.admin.id),
      })
      await createMembership({
        organizationId: f.org.id,
        userId: f.child.id,
        persona: 'STUDENT',
        meta: meta(f.admin.id),
      })
      await expect(
        service.claim(actor(parent), invitation.inviteCode),
      ).rejects.toThrow()
      const fresh = await service.invitations(actor(f.child), {
          organizationId: f.org.id,
        }),
        link = await service.claim(actor(parent), fresh.inviteCode)
      await service.approve(actor(f.child), link.id, LINK_CONSENT_VERSION)
      expect(
        (await service.children(actor(parent), 1, 20)).list[0].childId,
      ).toBe(f.child.id)
    })
  },
)
